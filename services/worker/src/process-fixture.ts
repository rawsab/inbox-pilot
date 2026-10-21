import { createHash, randomUUID } from "node:crypto";
import {
  AccountMode,
  ActionKind,
  AllowedGmailMethod,
  MessageState,
  POLICY_VERSION,
  PolicyOutcome,
  SCHEMA_VERSION,
  ADAPTER_VERSION,
  PROMPT_VERSION,
  ReviewStatus,
  evaluateActionGateway,
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
  owners,
  reviewItems,
} from "@inbox-pilot/db";
import { MockGmailClient } from "@inbox-pilot/gmail";
import { CATEGORY_DEFINITIONS, MockJevAdapter } from "@inbox-pilot/jev";
import { extractCandidates, normalizePlainText } from "@inbox-pilot/parser";
import { evaluatePolicy } from "@inbox-pilot/policy";
import { eq } from "drizzle-orm";

export type FixtureCase = {
  id: string;
  category_hint?: string;
  subject: string;
  body: string;
  from: string;
  from_name?: string;
  quoted?: string;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  notes?: string;
};

export type ReplayResult = {
  fixtureId: string;
  messageId: string;
  decisionId: string;
  outcome: string;
  category: string;
  reasonCodes: string[];
  gmailMutations: number;
  reviewItemId: string | null;
};

export async function ensureSyntheticAccount(db: ReturnType<typeof createDb>["db"]) {
  const existing = await db.select().from(owners).limit(1);
  let ownerId = existing[0]?.id;
  if (!ownerId) {
    const [owner] = await db
      .insert(owners)
      .values({
        email: "owner@localhost.test",
        passwordHash: "stage1-placeholder-not-for-auth",
      })
      .returning();
    ownerId = owner!.id;
  }

  const accounts = await db
    .select()
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.ownerId, ownerId))
    .limit(1);
  if (accounts[0]) return accounts[0];

  const [account] = await db
    .insert(mailboxAccounts)
    .values({
      ownerId,
      gmailIdentity: "synthetic@localhost.test",
      mode: AccountMode.DRY_RUN,
      cursorHealth: "healthy",
      connectedAt: new Date(),
    })
    .returning();
  return account!;
}

export async function processFixtureCase(opts: {
  db: ReturnType<typeof createDb>["db"];
  accountId: string;
  fixture: FixtureCase;
  jev: MockJevAdapter;
  gmail: MockGmailClient;
  /** When true, attempt a forbidden gateway call to prove rejection (tests only). */
  attemptForbiddenWrite?: boolean;
}): Promise<ReplayResult> {
  const { db, accountId, fixture, jev, gmail } = opts;
  const correlationId = randomUUID();
  const gmailMessageId = fixture.gmail_message_id ?? `synth_${fixture.id}`;
  const gmailThreadId = fixture.gmail_thread_id ?? `thread_${fixture.id}`;

  const fromEmail = fixture.from;
  const domain = fromEmail.split("@")[1];

  gmail.seed([
    {
      id: gmailMessageId,
      threadId: gmailThreadId,
      internalDate: new Date().toISOString(),
      subject: fixture.subject,
      from: fromEmail,
      labelIds: ["INBOX", "UNREAD"],
      body: fixture.body,
    },
  ]);

  const mutationsBefore = gmail.getMutationCount();

  const [msg] = await db
    .insert(messages)
    .values({
      accountId,
      gmailMessageId,
      gmailThreadId,
      internalDate: new Date(),
      state: MessageState.DISCOVERED,
      subject: fixture.subject,
      senderEmail: fromEmail,
      senderDisplayName: fixture.from_name ?? null,
    })
    .onConflictDoNothing()
    .returning();

  // Re-select if conflict (idempotent replay).
  const message =
    msg ??
    (
      await db
        .select()
        .from(messages)
        .where(eq(messages.gmailMessageId, gmailMessageId))
        .limit(1)
    )[0]!;

  const normalized = normalizePlainText({
    subject: fixture.subject,
    body: fixture.body,
    quoted: fixture.quoted,
  });

  const extracted = extractCandidates({
    subject: fixture.subject,
    body: normalized.plainText,
    senderDisplayName: fixture.from_name,
    senderDomain: domain,
  });

  await db
    .update(messages)
    .set({
      state: MessageState.NORMALIZED,
      normalizedHash: normalized.normalizedHash,
      parserVersion: normalized.parserVersion,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, message.id));

  for (const c of extracted) {
    await db.insert(candidates).values({
      messageId: message.id,
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

  const judgment = await jev.classifyAndVerify({
    request_id: randomUUID(),
    account_id: accountId,
    normalized_content_hash: normalized.normalizedHash,
    schema_version: SCHEMA_VERSION,
    newest_message_text: normalized.plainText,
    quoted_context: normalized.quotedContext || undefined,
    subject: fixture.subject,
    sender: {
      display_name: fixture.from_name,
      email: fromEmail,
      domain,
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
      messageId: message.id,
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
      connected: true,
      paused: false,
      mode: AccountMode.DRY_RUN,
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
    .where(eq(decisions.messageId, message.id));
  const revision = existingDecisions.length + 1;

  const [persisted] = await db
    .insert(decisions)
    .values({
      messageId: message.id,
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

  let reviewItemId: string | null = null;
  let nextState: string = MessageState.EVALUATED;

  if (decision.outcome === PolicyOutcome.REVIEW) {
    const [review] = await db
      .insert(reviewItems)
      .values({
        decisionId: persisted!.id,
        messageId: message.id,
        revision,
        status: ReviewStatus.OPEN,
        reason: decision.reason_codes.join(","),
      })
      .returning();
    reviewItemId = review!.id;
    nextState = MessageState.REVIEW_PENDING;
  } else if (decision.outcome === PolicyOutcome.IGNORE) {
    nextState = MessageState.IGNORED;
  } else if (decision.outcome === PolicyOutcome.ADD_LABEL) {
    // Dry run: record intent without Gmail mutation.
    await db.insert(actionIntents).values({
      decisionId: persisted!.id,
      messageId: message.id,
      accountId,
      kind: ActionKind.ADD_CATEGORY_LABEL,
      desiredDelta: { addLabelIds: ["Label_DRY_RUN_PROPOSED"], removeLabelIds: [] },
      idempotencyKey: `${accountId}:${message.id}:${revision}:ADD_CATEGORY_LABEL:dry`,
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
    .where(eq(messages.id, message.id));

  await db.insert(auditEvents).values({
    actor: "worker",
    eventType: "decision.persisted",
    objectType: "decision",
    objectId: persisted!.id,
    accountId,
    correlationId,
    metadata: {
      fixture_id: fixture.id,
      outcome: decision.outcome,
      category: decision.category,
      dry_run: true,
    },
  });

  if (opts.attemptForbiddenWrite) {
    const gate = evaluateActionGateway(
      {
        method: "gmail.users.messages.delete",
        accountId,
        messageId: gmailMessageId,
      },
      new Set(),
    );
    if (gate.ok) {
      throw new Error("action gateway must reject delete");
    }
  }

  // Dry run must not mutate Gmail (including label creation).
  const mutationsAfter = gmail.getMutationCount();
  if (mutationsAfter !== mutationsBefore) {
    throw new Error(`dry_run_gmail_mutation_detected fixture=${fixture.id}`);
  }

  // Prove gateway rejects forbidden methods.
  const forbidden = evaluateActionGateway(
    { method: "gmail.users.messages.trash", accountId },
    new Set(["Label_App"]),
  );
  if (forbidden.ok) {
    throw new Error("action gateway accepted trash");
  }
  void AllowedGmailMethod;

  return {
    fixtureId: fixture.id,
    messageId: message.id,
    decisionId: persisted!.id,
    outcome: decision.outcome,
    category: decision.category,
    reasonCodes: decision.reason_codes,
    gmailMutations: mutationsAfter - mutationsBefore,
    reviewItemId,
  };
}
