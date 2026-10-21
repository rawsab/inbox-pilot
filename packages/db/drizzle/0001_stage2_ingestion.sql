CREATE TABLE IF NOT EXISTS "owner_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "csrf_secret" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state" text NOT NULL,
  "code_verifier" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "scan_kind" text DEFAULT 'new_only' NOT NULL,
  "max_days" integer,
  "max_messages" integer,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "request_id" text NOT NULL,
  "kind" text DEFAULT 'incremental' NOT NULL,
  "status" text DEFAULT 'accepted' NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "discovered_count" integer DEFAULT 0 NOT NULL,
  "error" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "kind" text DEFAULT 'evaluate' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_account_id_mailbox_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mailbox_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_sessions_token_hash_unique" ON "owner_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_unique" ON "oauth_states" USING btree ("state");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scans_account_request_uidx" ON "scans" USING btree ("account_id","request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "processing_jobs_message_kind_uidx" ON "processing_jobs" USING btree ("message_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processing_jobs_status_idx" ON "processing_jobs" USING btree ("status");
