import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import {
  createDb,
  createSqlClient,
  labelMap,
  mailboxAccounts,
  messages,
  candidates,
  oauthStates,
} from "@inbox-pilot/db";
import {
  buildAuthUrl,
  createOAuthClient,
  encryptSecret,
  exchangeCode,
  generatePkce,
  randomToken,
  scopeExplanation,
  setSharedMockMailbox,
  SyntheticMailbox,
} from "@inbox-pilot/gmail";
import { AccountMode } from "@inbox-pilot/contracts";
import { and, eq } from "drizzle-orm";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureOwner, login, requireCsrf, requireOwner } from "./auth.js";
import { env } from "./env.js";
import { getScanStatus, runScan } from "./scan-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const cfg = env();
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(formbody);

  const { db, end } = createDb(cfg.databaseUrl);
  const sql = createSqlClient(cfg.databaseUrl);
  await ensureOwner(db);

  // Seed mock mailbox from fixtures when in mock mode.
  if (cfg.gmailMode === "mock") {
    const fixturesDir = path.resolve(__dirname, "../../../fixtures/messages");
    try {
      setSharedMockMailbox(SyntheticMailbox.fromFixtureDir(fixturesDir, 200));
      app.log.info("Loaded synthetic Gmail mailbox with 200 messages");
    } catch (err) {
      app.log.warn({ err }, "Could not load fixture mailbox; using default seed");
    }
  }

  app.addHook("onClose", async () => {
    await end();
    await sql.end({ timeout: 5 });
  });

  app.get("/health", async () => {
    let dbOk = false;
    try {
      await sql`select 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? "ok" : "degraded",
      service: "api",
      stage: 2,
      db: dbOk,
      gmail_mode: cfg.gmailMode,
      real_mail_to_jev: cfg.realMailToJev,
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/metrics", async () => ({
    stage: 2,
    uptime_s: Math.floor(process.uptime()),
  }));

  app.post("/auth/login", async (req, reply) => {
    const body = (req.body ?? {}) as { password?: string };
    if (!body.password) return reply.code(422).send({ error: "password required" });
    const session = await login(db, body.password);
    if (!session) return reply.code(401).send({ error: "invalid_password" });
    reply.setCookie("inbox_session", session.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86_400,
    });
    return { ok: true, csrf: session.csrf };
  });

  app.post("/auth/logout", async (req, reply) => {
    reply.clearCookie("inbox_session", { path: "/" });
    return { ok: true };
  });

  app.get("/settings", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    const accounts = await db
      .select()
      .from(mailboxAccounts)
      .where(eq(mailboxAccounts.ownerId, session.ownerId))
      .limit(1);
    const account = accounts[0];
    return {
      scope_explanation: scopeExplanation(),
      gmail_mode: cfg.gmailMode,
      real_mail_to_jev: cfg.realMailToJev,
      account: account
        ? {
            id: account.id,
            gmail_identity: account.gmailIdentity,
            mode: account.mode,
            paused: Boolean(account.pausedAt),
            scan_boundary: account.scanBoundary,
            cursor_health: account.cursorHealth,
            label_namespace: account.labelNamespace,
            connected_at: account.connectedAt,
          }
        : null,
    };
  });

  app.patch("/settings", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    if (!requireCsrf(req, session)) return reply.code(403).send({ error: "csrf" });
    const body = (req.body ?? {}) as {
      account_id?: string;
      mode?: string;
      paused?: boolean;
      scan_boundary?: { kind: "new_only" | "historical"; maxDays?: number; maxMessages?: number };
      label_namespace?: string;
    };
    if (!body.account_id) return reply.code(422).send({ error: "account_id required" });
    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.id, body.account_id),
          eq(mailboxAccounts.ownerId, session.ownerId),
        ),
      )
      .limit(1);
    if (!account) return reply.code(404).send({ error: "not_found" });

    await db
      .update(mailboxAccounts)
      .set({
        mode: body.mode === AccountMode.LABELING ? AccountMode.LABELING : account.mode,
        pausedAt:
          body.paused === true
            ? new Date()
            : body.paused === false
              ? null
              : account.pausedAt,
        scanBoundary: body.scan_boundary ?? account.scanBoundary,
        labelNamespace: body.label_namespace ?? account.labelNamespace,
        updatedAt: new Date(),
      })
      .where(eq(mailboxAccounts.id, account.id));
    return { ok: true };
  });

  app.get("/oauth/gmail/start", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    const query = req.query as {
      scan_kind?: string;
      max_days?: string;
      max_messages?: string;
    };

    if (cfg.gmailMode === "mock" || !cfg.googleClientId) {
      // Connect synthetic account without Google.
      const identity = "synthetic@localhost.test";
      const existing = await db
        .select()
        .from(mailboxAccounts)
        .where(
          and(
            eq(mailboxAccounts.ownerId, session.ownerId),
            eq(mailboxAccounts.gmailIdentity, identity),
          ),
        )
        .limit(1);
      let account = existing[0];
      if (!account) {
        const [created] = await db
          .insert(mailboxAccounts)
          .values({
            ownerId: session.ownerId,
            gmailIdentity: identity,
            mode: AccountMode.DRY_RUN,
            scanBoundary: {
              kind: query.scan_kind === "historical" ? "historical" : "new_only",
              maxDays: Number(query.max_days ?? 30),
              maxMessages: Number(query.max_messages ?? 2000),
              startedAt: new Date().toISOString(),
            },
            cursorHealth: "unknown",
            connectedAt: new Date(),
          })
          .returning();
        account = created!;
      }
      return {
        mock: true,
        account_id: account.id,
        gmail_identity: identity,
        mode: account.mode,
        scope_explanation: scopeExplanation(),
        note: "Mock mode — no Google OAuth. Historical labeling requires a separate settings change.",
      };
    }

    const { verifier, challenge } = generatePkce();
    const state = randomToken(24);
    await db.insert(oauthStates).values({
      state,
      codeVerifier: verifier,
      ownerId: session.ownerId,
      scanKind: query.scan_kind === "historical" ? "historical" : "new_only",
      maxDays: Number(query.max_days ?? 30),
      maxMessages: Number(query.max_messages ?? 2000),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    const client = createOAuthClient({
      clientId: cfg.googleClientId,
      clientSecret: cfg.googleClientSecret,
      redirectUri: cfg.googleRedirectUri,
    });
    const url = buildAuthUrl(client, { state, codeChallenge: challenge });
    return { mock: false, auth_url: url, scope_explanation: scopeExplanation() };
  });

  app.get("/oauth/gmail/callback", async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    if (query.error) return reply.code(400).send({ error: query.error });
    if (!query.code || !query.state) return reply.code(422).send({ error: "missing_code_or_state" });

    const [oauth] = await db
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, query.state))
      .limit(1);
    if (!oauth || oauth.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "invalid_state" });
    }
    await db.delete(oauthStates).where(eq(oauthStates.id, oauth.id));

    const client = createOAuthClient({
      clientId: cfg.googleClientId,
      clientSecret: cfg.googleClientSecret,
      redirectUri: cfg.googleRedirectUri,
    });
    const tokens = await exchangeCode(client, {
      code: query.code,
      codeVerifier: oauth.codeVerifier,
    });
    const identity = tokens.email ?? "unknown@gmail.com";
    const encrypted = encryptSecret(tokens.refreshToken, cfg.tokenEncryptionKey);

    // Namespace conflict detection
    const labels = await client.request<{ labels?: { name?: string }[] }>({
      url: "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    }).catch(() => ({ data: { labels: [] } }));
    const existingRecruiting = (labels.data.labels ?? []).some((l) =>
      (l.name ?? "").startsWith("Recruiting/"),
    );

    const existing = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.ownerId, oauth.ownerId),
          eq(mailboxAccounts.gmailIdentity, identity),
        ),
      )
      .limit(1);

    let accountId: string;
    if (existing[0]) {
      await db
        .update(mailboxAccounts)
        .set({
          encryptedRefreshToken: encrypted,
          connectedAt: new Date(),
          disconnectedAt: null,
          scanBoundary: {
            kind: oauth.scanKind as "new_only" | "historical",
            maxDays: oauth.maxDays ?? 30,
            maxMessages: oauth.maxMessages ?? 2000,
            startedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(mailboxAccounts.id, existing[0].id));
      accountId = existing[0].id;
    } else {
      const [created] = await db
        .insert(mailboxAccounts)
        .values({
          ownerId: oauth.ownerId,
          gmailIdentity: identity,
          encryptedRefreshToken: encrypted,
          mode: AccountMode.DRY_RUN,
          scanBoundary: {
            kind: oauth.scanKind as "new_only" | "historical",
            maxDays: oauth.maxDays ?? 30,
            maxMessages: oauth.maxMessages ?? 2000,
            startedAt: new Date().toISOString(),
          },
          connectedAt: new Date(),
        })
        .returning();
      accountId = created!.id;
    }

    return {
      account_id: accountId,
      gmail_identity: identity,
      mode: AccountMode.DRY_RUN,
      namespace_conflict: existingRecruiting,
      note: existingRecruiting
        ? "Recruiting/* labels already exist — map or choose a clean prefix before labeling mode."
        : "Connected in dry_run. Historical labeling is a separate setting.",
      scope_explanation: scopeExplanation(),
    };
  });

  app.post("/oauth/gmail/disconnect", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    if (!requireCsrf(req, session)) return reply.code(403).send({ error: "csrf" });
    const body = (req.body ?? {}) as { account_id?: string };
    if (!body.account_id) return reply.code(422).send({ error: "account_id required" });
    await db
      .update(mailboxAccounts)
      .set({
        encryptedRefreshToken: null,
        disconnectedAt: new Date(),
        pausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mailboxAccounts.id, body.account_id),
          eq(mailboxAccounts.ownerId, session.ownerId),
        ),
      );
    return { ok: true };
  });

  app.post("/internal/scans", async (req, reply) => {
    const auth = req.headers.authorization ?? "";
    if (!cfg.schedulerToken || auth !== `Bearer ${cfg.schedulerToken}`) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as {
      account_id?: string;
      request_id?: string;
      kind?: "incremental" | "historical" | "reconcile";
    };
    if (!body.account_id || !body.request_id) {
      return reply.code(422).send({ error: "account_id and request_id required" });
    }
    try {
      const result = await runScan({
        db,
        accountId: body.account_id,
        requestId: body.request_id,
        kind: body.kind,
      });
      return reply.code(202).send({
        scan_id: result.scanId,
        status: result.status,
        discovered: result.discovered,
        coverage_gap: result.coverageGap ?? false,
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "scan_failed",
      });
    }
  });

  app.get("/status/scan", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    const accountId = (req.query as { account_id?: string }).account_id;
    if (!accountId) return reply.code(422).send({ error: "account_id required" });
    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.id, accountId),
          eq(mailboxAccounts.ownerId, session.ownerId),
        ),
      )
      .limit(1);
    if (!account) return reply.code(404).send({ error: "not_found" });
    return getScanStatus(db, accountId);
  });

  app.get("/parser/inspect/:messageId", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    const messageId = (req.params as { messageId: string }).messageId;
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!msg) return reply.code(404).send({ error: "not_found" });
    const [account] = await db
      .select()
      .from(mailboxAccounts)
      .where(
        and(
          eq(mailboxAccounts.id, msg.accountId),
          eq(mailboxAccounts.ownerId, session.ownerId),
        ),
      )
      .limit(1);
    if (!account) return reply.code(403).send({ error: "forbidden" });
    const cands = await db.select().from(candidates).where(eq(candidates.messageId, msg.id));
    return {
      message: {
        id: msg.id,
        gmail_message_id: msg.gmailMessageId,
        subject: msg.subject,
        sender_email: msg.senderEmail,
        state: msg.state,
        normalized_hash: msg.normalizedHash,
        parser_version: msg.parserVersion,
      },
      candidates: cands.map((c) => ({
        candidate_key: c.candidateKey,
        field_type: c.fieldType,
        normalized_value: c.normalizedValue,
        original_value: c.originalValue,
        source_segment: c.sourceSegment,
        start: c.startOffset,
        end: c.endOffset,
        rule_id: c.ruleId,
        rank: c.rank,
        verification_verdict: c.verificationVerdict,
      })),
    };
  });

  app.get("/labels/:accountId", async (req, reply) => {
    const session = await requireOwner(db, req, reply);
    if (!session) return;
    const accountId = (req.params as { accountId: string }).accountId;
    const rows = await db.select().from(labelMap).where(eq(labelMap.accountId, accountId));
    return { labels: rows };
  });

  await app.listen({ port: cfg.port, host: cfg.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
