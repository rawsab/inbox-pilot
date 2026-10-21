import { randomUUID } from "node:crypto";
import {
  AccountMode,
  ActionKind,
  ADAPTER_VERSION,
  MessageState,
  POLICY_VERSION,
  PolicyOutcome,
  PROMPT_VERSION,
  ReviewStatus,
  SCHEMA_VERSION,
} from "@inbox-pilot/contracts";
import {
  actionIntents,
  auditEvents,
  candidates,
  createDb,
  decisions,
  inferences,
  mailboxAccounts,
  messages,
  processingJobs,
  reviewItems,
} from "@inbox-pilot/db";
import {
  createGmailConnector,
  decryptSecret,
  type GmailMode,
} from "@inbox-pilot/gmail";
import { CATEGORY_DEFINITIONS, MockJevAdapter } from "@inbox-pilot/jev";
import { extractCandidates, normalizeFromMime } from "@inbox-pilot/parser";
import { evaluatePolicy } from "@inbox-pilot/policy";
import { and, eq, lt, or } from "drizzle-orm";
import { createHash } from "node:crypto";

type Db = ReturnType<typeof createDb>["db"];

const LEASE_MS = 60_000;

export async function processPendingJobs(opts: {
  db: Db;
  tokenEncryptionKey: string;
  gmailMode: GmailMode;
  google?: { clientId: string; clientSecret: string; redirectUri: string };
  limit?: number;
}): Promise<number> {
  const workerId = `worker-${randomUUID()}`;
  const now = new Date();
  const jobs = await opts.db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.kind, "evaluate"),
        or(
          eq(processingJobs.status, "pending"),
          and(
            eq(processingJobs.status, "leased"),
            lt(processingJobs.leaseExpiresAt, now),
          ),
        ),
      ),
    )
    .limit(opts.limit ?? 10);

  let processed = 0;
  for (const job of jobs) {
    const [leased] = await opts.db
      .update(processingJobs)
      .set({
        status: "leased",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attempts: job.attempts + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(processingJobs.id, job.id), eq(processingJobs.status, job.status)))
      .returning();
    if (!leased) continue;

    try {
      await evaluateOne({
        db: opts.db,
        jobId: job.id,
        messageId: job.messageId,
        accountId: job.accountId,
        tokenEncryptionKey: opts.tokenEncryptionKey,
        gmailMode: opts.gmailMode,
        google: opts.google,
      });
      await opts.db
        .update(processingJobs)
        .set({ status: "completed", leaseExpiresAt: null, updatedAt: new Date() })
        .where(eq(processingJobs.id, job.id));
      processed += 1;
    } catch (err) {
      await opts.db
        .update(processingJobs)
        .set({
          status: "pending",
          lastError: err instanceof Error ? err.message : String(err),
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(processingJobs.id, job.id));
    }
  }
  return processed;
}

async function evaluateOne(opts: {
  db: Db;
  jobId: string;
  messageId: string;
  accountId: string;
  tokenEncryptionKey: string;
  gmailMode: GmailMode;
  google?: { clientId: string; clientSecret: string; redirectUri: string };
}) {
  const { db } = opts;
  const [msg] = await db.select().from(messages).where(eq(messages.id, opts.messageId)).limit(1);
  if (!msg) throw new Error("message_missing");
  if (msg.manualOverrideLock) return;

  const [account] = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.id, opts.accountId))
    .limit(1);
  if (!account) throw new Error("account_missing");

  const refreshToken = account.encryptedRefreshToken
    ? decryptSecret(account.encryptedRefreshToken, opts.tokenEncryptionKey)
    : undefined;
  const connector = createGmailConnector({
    mode: opts.gmailMode,
    refreshToken,
    oauth: opts.google,
  });

  const fetched = await connector.getMessage(msg.gmailMessageId);
  if (!fetched) {
    await db
      .update(messages)
      .set({ state: MessageState.UNAVAILABLE, updatedAt: new Date() })
      .where(eq(messages.id, msg.id));
    return;
  }

  const { mime, normalized } = await normalizeFromMime(fetched.rawMime);
  const extracted = extractCandidates({
    subject: mime.subject || fetched.subject,
    body: normalized.plainText,
    senderDisplayName: mime.fromName ?? fetched.fromName,
    senderDomain: (mime.fromEmail ?? fetched.from).split("@")[1],
  });

  await db
    .update(messages)
    .set({
      state: MessageState.NORMALIZED,
      subject: mime.subject || fetched.subject,
      senderEmail: mime.fromEmail ?? fetched.from,
      senderDisplayName: mime.fromName ?? fetched.fromName ?? null,
      normalizedHash: normalized.normalizedHash,
      parserVersion: normalized.parserVersion,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, msg.id));

  // Replace candidates for this message revision of parsing.
  await db.delete(candidates).where(eq(candidates.messageId, msg.id));
  for (const c of extracted) {
    await db.insert(candidates).values({
      messageId: msg.id,
      candidateKey: c.candidate_id,
      parserVersion: c.parser_version,
      fieldType: c.field_type,
      normalizedValue: c.normalized_value,
      originalValue: c.original_value,
      sourceSegment: c.source_segment,
      startOffset: c.start,
      endOffset: c.end,
      ruleId: c.rule_id,
      rank: c.rank,
    });
  }

  // Stage 2: mock Jev still; Stage 3 swaps in live adapter behind the same contract.
  const jev = new MockJevAdapter();
  const judgment = await jev.classifyAndVerify({
    request_id: randomUUID(),
    account_id: opts.accountId,
    normalized_content_hash: normalized.normalizedHash,
    schema_version: SCHEMA_VERSION,
    newest_message_text: normalized.plainText,
    quoted_context: normalized.quotedContext || undefined,
    subject: mime.subject || fetched.subject,
    sender: {
      display_name: mime.fromName ?? fetched.fromName,
      email: mime.fromEmail ?? fetched.from,
      domain: (mime.fromEmail ?? fetched.from).split("@")[1],
    },
    category_definitions: CATEGORY_DEFINITIONS,
    candidates: extracted,
    truncation_forced_review: normalized.truncationForcedReview,
  });

  const candidateHash = createHash("sha256")
    .update(extracted.map((c) => c.candidate_id).sort().join(","))
    .digest("hex");

  const [inference] = await db
    .insert(inferences)
    .values({
      messageId: msg.id,
      inputHash: normalized.normalizedHash,
      candidateHash,
      adapterVersion: ADAPTER_VERSION,
      providerModel: judgment.provider_model ?? "mock-jev",
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      scoreKind: judgment.score_kind,
      rawScore: judgment.raw_score !== null ? String(judgment.raw_score) : null,
      validatedVerdicts: judgment.candidate_verdicts,
      ambiguityFlags: judgment.ambiguity_flags,
      latencyMs: judgment.latency_ms ?? null,
      usage: judgment.usage ?? null,
      outcome: "ok",
    })
    .returning();

  const decision = evaluatePolicy({
    judgment,
    account: {
      connected: Boolean(account.connectedAt) && !account.disconnectedAt,
      paused: Boolean(account.pausedAt),
      mode: account.mode === AccountMode.LABELING ? AccountMode.LABELING : AccountMode.DRY_RUN,
      kill_switch: false,
      policy_version_active: POLICY_VERSION,
    },
    calibratedScore: null,
    releasedAutoClasses: new Set(),
    truncationForcedReview: normalized.truncationForcedReview,
  });

  const existingDecisions = await db
    .select()
    .from(decisions)
    .where(eq(decisions.messageId, msg.id));
  const revision = existingDecisions.length + 1;

  const [persisted] = await db
    .insert(decisions)
    .values({
      messageId: msg.id,
      revision,
      inferenceId: inference!.id,
      category: decision.category,
      calibratedScore:
        decision.calibrated_score !== null ? String(decision.calibrated_score) : null,
      calibrationVersion: decision.calibration_version,
      policyVersion: decision.policy_version,
      outcome: decision.outcome,
      reasonCodes: decision.reason_codes,
      entityVerdicts: decision.entity_verdicts,
      proposedLabelKey: decision.proposed_label_key,
    })
    .returning();

  let nextState: string = MessageState.EVALUATED;
  if (decision.outcome === PolicyOutcome.REVIEW) {
    await db.insert(reviewItems).values({
      decisionId: persisted!.id,
      messageId: msg.id,
      revision,
      status: ReviewStatus.OPEN,
      reason: decision.reason_codes.join(","),
    });
    nextState = MessageState.REVIEW_PENDING;
  } else if (decision.outcome === PolicyOutcome.IGNORE) {
    nextState = MessageState.IGNORED;
  } else if (decision.outcome === PolicyOutcome.ADD_LABEL) {
    // Dry run: record intent only — never mutate Gmail (including label creation).
    await db.insert(actionIntents).values({
      decisionId: persisted!.id,
      messageId: msg.id,
      accountId: opts.accountId,
      kind: ActionKind.ADD_CATEGORY_LABEL,
      desiredDelta: { addLabelIds: ["Label_DRY_RUN_PROPOSED"], removeLabelIds: [] },
      idempotencyKey: `${opts.accountId}:${msg.id}:${revision}:ADD_CATEGORY_LABEL:dry`,
      status: "PENDING",
      expectedState: { dry_run: true, proposed: decision.proposed_label_key },
    });
    nextState = MessageState.ACTION_PENDING;
  } else if (decision.outcome === PolicyOutcome.RETRY) {
    nextState = MessageState.RETRY_WAIT;
  }

  await db
    .update(messages)
    .set({ state: nextState, updatedAt: new Date() })
    .where(eq(messages.id, msg.id));

  await db.insert(auditEvents).values({
    actor: "worker",
    eventType: "decision.persisted",
    objectType: "decision",
    objectId: persisted!.id,
    accountId: opts.accountId,
    correlationId: randomUUID(),
    metadata: {
      outcome: decision.outcome,
      category: decision.category,
      dry_run: account.mode !== AccountMode.LABELING,
      stage: 2,
    },
  });
}
