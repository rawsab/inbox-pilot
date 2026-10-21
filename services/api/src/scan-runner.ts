import { MessageState } from "@inbox-pilot/contracts";
import {
  createDb,
  mailboxAccounts,
  messages,
  processingJobs,
  scans,
} from "@inbox-pilot/db";
import {
  createGmailConnector,
  decryptSecret,
  dedupeMessageRefs,
  discoverHistorical,
  discoverIncremental,
  type GmailMode,
  type ScanBoundary,
} from "@inbox-pilot/gmail";
import { and, desc, eq, sql } from "drizzle-orm";
import { env } from "./env.js";
import { randomUUID } from "node:crypto";

type Db = ReturnType<typeof createDb>["db"];

const LEASE_MS = 120_000;

export async function runScan(opts: {
  db: Db;
  accountId: string;
  requestId: string;
  kind?: "incremental" | "historical" | "reconcile";
}): Promise<{
  scanId: string;
  status: string;
  discovered: number;
  coverageGap?: boolean;
}> {
  const { db, accountId, requestId } = opts;
  const kind = opts.kind ?? "incremental";

  const existing = await db
    .select()
    .from(scans)
    .where(and(eq(scans.accountId, accountId), eq(scans.requestId, requestId)))
    .limit(1);
  if (existing[0]) {
    return {
      scanId: existing[0].id,
      status: existing[0].status,
      discovered: existing[0].discoveredCount,
    };
  }

  const accounts = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, accountId))
    .limit(1);
  const account = accounts[0];
  if (!account) {
    throw new Error("account_not_found");
  }
  if (account.pausedAt) {
    const [scan] = await db
      .insert(scans)
      .values({
        accountId,
        requestId,
        kind,
        status: "skipped_paused",
        finishedAt: new Date(),
      })
      .returning();
    return { scanId: scan!.id, status: scan!.status, discovered: 0 };
  }

  const leaseOwner = `api-${randomUUID()}`;
  const [scan] = await db
    .insert(scans)
    .values({
      accountId,
      requestId,
      kind,
      status: "running",
      leaseOwner,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      startedAt: new Date(),
    })
    .returning();

  try {
    const cfg = env();
    const refreshToken = account.encryptedRefreshToken
      ? decryptSecret(account.encryptedRefreshToken, cfg.tokenEncryptionKey)
      : undefined;
    const connector = createGmailConnector({
      mode: cfg.gmailMode as GmailMode,
      refreshToken,
      oauth:
        cfg.googleClientId && cfg.googleClientSecret
          ? {
              clientId: cfg.googleClientId,
              clientSecret: cfg.googleClientSecret,
              redirectUri: cfg.googleRedirectUri,
            }
          : undefined,
    });

    const boundary = (account.scanBoundary ?? {
      kind: "new_only",
      maxDays: 30,
      maxMessages: 2000,
    }) as ScanBoundary;

    let discovered;
    let coverageGap = false;

    if (
      kind === "historical" ||
      kind === "reconcile" ||
      !account.historyId ||
      boundary.kind === "historical"
    ) {
      discovered = await discoverHistorical(connector, {
        ...boundary,
        kind: kind === "historical" || boundary.kind === "historical" ? "historical" : "new_only",
        maxMessages: kind === "reconcile" ? 500 : boundary.maxMessages,
      });
    } else {
      discovered = await discoverIncremental(connector, account.historyId);
      coverageGap = Boolean(discovered.coverageGap);
      if (coverageGap) {
        // Bounded recovery rescan
        discovered = await discoverHistorical(connector, {
          kind: "historical",
          maxDays: Math.min(boundary.maxDays ?? 30, 7),
          maxMessages: 500,
        });
        coverageGap = true;
      }
    }

    const refs = dedupeMessageRefs(discovered.messages);
    let inserted = 0;

    for (const ref of refs) {
      const [row] = await db
        .insert(messages)
        .values({
          accountId,
          gmailMessageId: ref.gmailMessageId,
          gmailThreadId: ref.gmailThreadId,
          internalDate: ref.internalDate,
          state: MessageState.DISCOVERED,
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        inserted += 1;
        await db
          .insert(processingJobs)
          .values({
            accountId,
            messageId: row.id,
            kind: "evaluate",
            status: "pending",
          })
          .onConflictDoNothing();
      }
    }

    // Advance cursor only after discovered IDs are committed.
    await db
      .update(mailboxAccounts)
      .set({
        historyId: discovered.newHistoryId ?? account.historyId,
        cursorHealth: coverageGap ? "coverage_gap" : "healthy",
        coverageGapFrom: coverageGap ? new Date() : account.coverageGapFrom,
        coverageGapTo: coverageGap ? new Date() : account.coverageGapTo,
        updatedAt: new Date(),
      })
      .where(eq(mailboxAccounts.id, accountId));

    await db
      .update(scans)
      .set({
        status: coverageGap ? "completed_with_gap" : "completed",
        discoveredCount: inserted,
        finishedAt: new Date(),
        leaseExpiresAt: null,
      })
      .where(eq(scans.id, scan!.id));

    return {
      scanId: scan!.id,
      status: coverageGap ? "completed_with_gap" : "completed",
      discovered: inserted,
      coverageGap,
    };
  } catch (err) {
    await db
      .update(scans)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
        leaseExpiresAt: null,
      })
      .where(eq(scans.id, scan!.id));
    throw err;
  }
}

export async function getScanStatus(db: Db, accountId: string) {
  const [account] = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, accountId))
    .limit(1);
  const recent = await db
    .select()
    .from(scans)
    .where(eq(scans.accountId, accountId))
    .orderBy(desc(scans.createdAt))
    .limit(10);
  const pendingJobs = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(processingJobs)
    .where(
      and(eq(processingJobs.accountId, accountId), eq(processingJobs.status, "pending")),
    );
  const messageCounts = await db
    .select({
      state: messages.state,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(eq(messages.accountId, accountId))
    .groupBy(messages.state);

  return {
    account: account
      ? {
          id: account.id,
          gmailIdentity: account.gmailIdentity,
          mode: account.mode,
          paused: Boolean(account.pausedAt),
          historyId: account.historyId,
          cursorHealth: account.cursorHealth,
          coverageGapFrom: account.coverageGapFrom,
          coverageGapTo: account.coverageGapTo,
          scanBoundary: account.scanBoundary,
          connectedAt: account.connectedAt,
        }
      : null,
    recentScans: recent.map((s) => ({
      id: s.id,
      requestId: s.requestId,
      kind: s.kind,
      status: s.status,
      discoveredCount: s.discoveredCount,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      error: s.error,
    })),
    pendingJobs: pendingJobs[0]?.count ?? 0,
    messagesByState: Object.fromEntries(messageCounts.map((r) => [r.state, r.count])),
  };
}
