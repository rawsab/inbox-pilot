import { createDb, createSqlClient } from "@inbox-pilot/db";
import {
  setSharedMockMailbox,
  SyntheticMailbox,
  type GmailMode,
} from "@inbox-pilot/gmail";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processPendingJobs } from "./evaluate-job.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://inbox:inbox@localhost:5432/inbox_pilot";
const tokenEncryptionKey =
  process.env.TOKEN_ENCRYPTION_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const gmailMode = (process.env.GMAIL_MODE === "live" ? "live" : "mock") as GmailMode;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (gmailMode === "mock") {
    const fixturesDir = path.resolve(__dirname, "../../../fixtures/messages");
    try {
      setSharedMockMailbox(SyntheticMailbox.fromFixtureDir(fixturesDir, 200));
    } catch {
      // API may already have seeded the shared mailbox.
    }
  }

  const sql = createSqlClient(databaseUrl);
  await sql`select 1`;
  const { db, end } = createDb(databaseUrl);

  console.log(
    JSON.stringify({
      service: "worker",
      stage: 2,
      status: "running",
      gmail_mode: gmailMode,
      timestamp: new Date().toISOString(),
    }),
  );

  const tick = async () => {
    try {
      const n = await processPendingJobs({
        db,
        tokenEncryptionKey,
        gmailMode,
        google:
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                redirectUri:
                  process.env.GOOGLE_REDIRECT_URI ??
                  "http://localhost:3000/oauth/gmail/callback",
              }
            : undefined,
        limit: 20,
      });
      if (n > 0) {
        console.log(JSON.stringify({ processed_jobs: n, at: new Date().toISOString() }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  await tick();
  const timer = setInterval(tick, 5_000);

  const shutdown = async () => {
    clearInterval(timer);
    await end();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
