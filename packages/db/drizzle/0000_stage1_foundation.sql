CREATE TABLE IF NOT EXISTS "owners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "owners_email_unique" UNIQUE("email")
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mailbox_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "gmail_identity" text NOT NULL,
  "encrypted_refresh_token" text,
  "mode" text DEFAULT 'dry_run' NOT NULL,
  "scan_boundary" jsonb,
  "history_id" text,
  "cursor_health" text DEFAULT 'unknown' NOT NULL,
  "coverage_gap_from" timestamp with time zone,
  "coverage_gap_to" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "disconnected_at" timestamp with time zone,
  "retention_config" jsonb,
  "label_namespace" text DEFAULT 'Recruiting' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "gmail_message_id" text NOT NULL,
  "gmail_thread_id" text NOT NULL,
  "internal_date" timestamp with time zone NOT NULL,
  "normalized_hash" text,
  "parser_version" text,
  "state" text DEFAULT 'DISCOVERED' NOT NULL,
  "manual_override_lock" boolean DEFAULT false NOT NULL,
  "subject" text,
  "sender_email" text,
  "sender_display_name" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "candidate_key" text NOT NULL,
  "parser_version" text NOT NULL,
  "field_type" text NOT NULL,
  "normalized_value" text NOT NULL,
  "original_value" text NOT NULL,
  "source_segment" text NOT NULL,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  "rule_id" text NOT NULL,
  "rank" integer NOT NULL,
  "verification_verdict" text,
  "created_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "input_hash" text NOT NULL,
  "candidate_hash" text NOT NULL,
  "adapter_version" text NOT NULL,
  "provider_model" text,
  "prompt_version" text NOT NULL,
  "schema_version" text NOT NULL,
  "score_kind" text NOT NULL,
  "raw_score" numeric(8, 6),
  "validated_verdicts" jsonb NOT NULL,
  "ambiguity_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "latency_ms" integer,
  "usage" jsonb,
  "outcome" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "inference_id" uuid,
  "category" text NOT NULL,
  "calibrated_score" numeric(8, 6),
  "calibration_version" text NOT NULL,
  "policy_version" text NOT NULL,
  "outcome" text NOT NULL,
  "reason_codes" jsonb NOT NULL,
  "entity_verdicts" jsonb NOT NULL,
  "proposed_label_key" text,
  "created_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "review_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "decision_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "reason" text NOT NULL,
  "corrected_values" jsonb,
  "resolver" text,
  "created_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "action_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "decision_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "desired_delta" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "expected_state" jsonb,
  "observed_state" jsonb,
  "next_retry_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor" text NOT NULL,
  "event_type" text NOT NULL,
  "object_type" text,
  "object_id" text,
  "account_id" uuid,
  "correlation_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "label_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "app_label_key" text NOT NULL,
  "gmail_label_id" text NOT NULL,
  "gmail_label_name" text NOT NULL,
  "owned_by_app" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "policy_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" text NOT NULL,
  "thresholds" jsonb NOT NULL,
  "budgets" jsonb NOT NULL,
  "feature_flags" jsonb NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "policy_configs_version_unique" UNIQUE("version")
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "kill_switch" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deletion_tombs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "purged_at" timestamp with time zone NOT NULL,
  "reason" text NOT NULL
);

--> statement-breakpoint

ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "inferences" ADD CONSTRAINT "inferences_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "decisions" ADD CONSTRAINT "decisions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "decisions" ADD CONSTRAINT "decisions_inference_id_inferences_id_fk" FOREIGN KEY ("inference_id") REFERENCES "public"."inferences"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "review_items" ADD CONSTRAINT "review_items_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "review_items" ADD CONSTRAINT "review_items_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "action_intents" ADD CONSTRAINT "action_intents_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "label_map" ADD CONSTRAINT "label_map_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "mailbox_accounts_owner_gmail_uidx" ON "mailbox_accounts" USING btree ("owner_id","gmail_identity");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "messages_account_gmail_uidx" ON "messages" USING btree ("account_id","gmail_message_id");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "messages_account_state_idx" ON "messages" USING btree ("account_id","state");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "decisions_message_revision_uidx" ON "decisions" USING btree ("message_id","revision");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "review_items_open_message_revision_uidx" ON "review_items" USING btree ("message_id","revision");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "action_intents_idempotency_uidx" ON "action_intents" USING btree ("idempotency_key");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "label_map_account_key_uidx" ON "label_map" USING btree ("account_id","app_label_key");
