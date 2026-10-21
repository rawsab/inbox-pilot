import { createDb } from "@inbox-pilot/db";
import { setSharedMockMailbox, SyntheticMailbox } from "@inbox-pilot/gmail";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processPendingJobs } from "./evaluate-job.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://inbox:inbox@localhost:5432/inbox_pilot";
  const fixturesDir = path.resolve(__dirname, "../../../fixtures/messages");
  setSharedMockMailbox(SyntheticMailbox.fromFixtureDir(fixturesDir, 200));
  const { db, end } = createDb(databaseUrl);
  let total = 0;
  for (let i = 0; i < 20; i++) {
    total += await processPendingJobs({
      db,
      tokenEncryptionKey:
        process.env.TOKEN_ENCRYPTION_KEY ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      gmailMode: "mock",
      limit: 25,
    });
  }
  console.log(JSON.stringify({ processed: total }));
  await end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
