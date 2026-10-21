import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" }).notNull();

const utcTimestampNullable = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const owners = pgTable("owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
});

export const mailboxAccounts = pgTable(
  "mailbox_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id),
    gmailIdentity: text("gmail_identity").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    mode: text("mode").notNull().default("dry_run"),
    scanBoundary: jsonb("scan_boundary").$type<{
      kind: "new_only" | "historical";
      maxDays?: number;
      maxMessages?: number;
      startedAt?: string;
    }>(),
    historyId: text("history_id"),
    cursorHealth: text("cursor_health").notNull().default("unknown"),
    coverageGapFrom: utcTimestampNullable("coverage_gap_from"),
    coverageGapTo: utcTimestampNullable("coverage_gap_to"),
    pausedAt: utcTimestampNullable("paused_at"),
    connectedAt: utcTimestampNullable("connected_at"),
    disconnectedAt: utcTimestampNullable("disconnected_at"),
    retentionConfig: jsonb("retention_config").$type<Record<string, unknown>>(),
    labelNamespace: text("label_namespace").notNull().default("Recruiting"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("mailbox_accounts_owner_gmail_uidx").on(t.ownerId, t.gmailIdentity)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailboxAccounts.id),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    internalDate: utcTimestamp("internal_date"),
    normalizedHash: text("normalized_hash"),
    parserVersion: text("parser_version"),
    state: text("state").notNull().default("DISCOVERED"),
    manualOverrideLock: boolean("manual_override_lock").notNull().default(false),
    subject: text("subject"),
    senderEmail: text("sender_email"),
    senderDisplayName: text("sender_display_name"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("messages_account_gmail_uidx").on(t.accountId, t.gmailMessageId),
    index("messages_account_state_idx").on(t.accountId, t.state),
  ],
);

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  candidateKey: text("candidate_key").notNull(),
  parserVersion: text("parser_version").notNull(),
  fieldType: text("field_type").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  originalValue: text("original_value").notNull(),
  sourceSegment: text("source_segment").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  ruleId: text("rule_id").notNull(),
  rank: integer("rank").notNull(),
  verificationVerdict: text("verification_verdict"),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
});

export const inferences = pgTable("inferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  inputHash: text("input_hash").notNull(),
  candidateHash: text("candidate_hash").notNull(),
  adapterVersion: text("adapter_version").notNull(),
  providerModel: text("provider_model"),
  promptVersion: text("prompt_version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  scoreKind: text("score_kind").notNull(),
  rawScore: numeric("raw_score", { precision: 8, scale: 6 }),
  validatedVerdicts: jsonb("validated_verdicts").$type<unknown>().notNull(),
  ambiguityFlags: jsonb("ambiguity_flags").$type<string[]>().notNull().default([]),
  latencyMs: integer("latency_ms"),
  usage: jsonb("usage").$type<Record<string, unknown>>(),
  outcome: text("outcome").notNull(),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
});

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    revision: integer("revision").notNull(),
    inferenceId: uuid("inference_id").references(() => inferences.id),
    category: text("category").notNull(),
    calibratedScore: numeric("calibrated_score", { precision: 8, scale: 6 }),
    calibrationVersion: text("calibration_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    outcome: text("outcome").notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull(),
    entityVerdicts: jsonb("entity_verdicts").$type<unknown>().notNull(),
    proposedLabelKey: text("proposed_label_key"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("decisions_message_revision_uidx").on(t.messageId, t.revision)],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => decisions.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    revision: integer("revision").notNull(),
    status: text("status").notNull().default("OPEN"),
    reason: text("reason").notNull(),
    correctedValues: jsonb("corrected_values").$type<Record<string, unknown>>(),
    resolver: text("resolver"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
    resolvedAt: utcTimestampNullable("resolved_at"),
  },
  (t) => [
    uniqueIndex("review_items_open_message_revision_uidx").on(t.messageId, t.revision),
  ],
);

export const actionIntents = pgTable(
  "action_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    decisionId: uuid("decision_id")
      .notNull()
      .references(() => decisions.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailboxAccounts.id),
    kind: text("kind").notNull(),
    desiredDelta: jsonb("desired_delta")
      .$type<{ addLabelIds: string[]; removeLabelIds: string[] }>()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: utcTimestampNullable("lease_expires_at"),
    expectedState: jsonb("expected_state").$type<Record<string, unknown>>(),
    observedState: jsonb("observed_state").$type<Record<string, unknown>>(),
    nextRetryAt: utcTimestampNullable("next_retry_at"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("action_intents_idempotency_uidx").on(t.idempotencyKey)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actor: text("actor").notNull(),
    eventType: text("event_type").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    accountId: uuid("account_id"),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (t) => [index("audit_events_correlation_idx").on(t.correlationId)],
);

export const labelMap = pgTable(
  "label_map",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailboxAccounts.id),
    appLabelKey: text("app_label_key").notNull(),
    gmailLabelId: text("gmail_label_id").notNull(),
    gmailLabelName: text("gmail_label_name").notNull(),
    ownedByApp: boolean("owned_by_app").notNull().default(true),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("label_map_account_key_uidx").on(t.accountId, t.appLabelKey)],
);

export const policyConfigs = pgTable("policy_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  version: text("version").notNull().unique(),
  thresholds: jsonb("thresholds").$type<Record<string, unknown>>().notNull(),
  budgets: jsonb("budgets").$type<Record<string, unknown>>().notNull(),
  featureFlags: jsonb("feature_flags").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").notNull().default(false),
  activatedAt: utcTimestampNullable("activated_at"),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
});

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("global"),
  killSwitch: boolean("kill_switch").notNull().default(false),
  updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
});

export const deletionTombs = pgTable("deletion_tombs", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  purgedAt: utcTimestamp("purged_at").$defaultFn(() => new Date()),
  reason: text("reason").notNull(),
});

export const ownerSessions = pgTable("owner_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  tokenHash: text("token_hash").notNull().unique(),
  csrfSecret: text("csrf_secret").notNull(),
  expiresAt: utcTimestamp("expires_at"),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
});

export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: text("state").notNull().unique(),
  codeVerifier: text("code_verifier").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id),
  scanKind: text("scan_kind").notNull().default("new_only"),
  maxDays: integer("max_days"),
  maxMessages: integer("max_messages"),
  expiresAt: utcTimestamp("expires_at"),
  createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
});

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailboxAccounts.id),
    requestId: text("request_id").notNull(),
    kind: text("kind").notNull().default("incremental"),
    status: text("status").notNull().default("accepted"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: utcTimestampNullable("lease_expires_at"),
    discoveredCount: integer("discovered_count").notNull().default(0),
    error: text("error"),
    startedAt: utcTimestampNullable("started_at"),
    finishedAt: utcTimestampNullable("finished_at"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("scans_account_request_uidx").on(t.accountId, t.requestId)],
);

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailboxAccounts.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    kind: text("kind").notNull().default("evaluate"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: utcTimestampNullable("lease_expires_at"),
    lastError: text("last_error"),
    createdAt: utcTimestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: utcTimestamp("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("processing_jobs_message_kind_uidx").on(t.messageId, t.kind),
    index("processing_jobs_status_idx").on(t.status),
  ],
);
