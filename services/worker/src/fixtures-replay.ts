import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@inbox-pilot/db";
import { MockGmailClient } from "@inbox-pilot/gmail";
import { MockJevAdapter } from "@inbox-pilot/jev";
import {
  ensureSyntheticAccount,
  FixtureCase,
  processFixtureCase,
} from "./process-fixture.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://inbox:inbox@localhost:5432/inbox_pilot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../../fixtures/messages");

async function main() {
  const files = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length < 40) {
    throw new Error(`Expected at least 40 fixtures, found ${files.length}`);
  }

  const { db, end } = createDb(databaseUrl);
  try {
    const account = await ensureSyntheticAccount(db);
    const jev = new MockJevAdapter();
    const gmail = new MockGmailClient();

    const results = [];
    for (const file of files) {
      const fixture = JSON.parse(
        readFileSync(path.join(fixturesDir, file), "utf8"),
      ) as FixtureCase;
      const result = await processFixtureCase({
        db,
        accountId: account.id,
        fixture,
        jev,
        gmail,
        attemptForbiddenWrite: true,
      });
      results.push(result);
    }

    const summary = {
      ok: true,
      fixture_count: results.length,
      gmail_mutations_total: results.reduce((n, r) => n + r.gmailMutations, 0),
      by_outcome: countBy(results.map((r) => r.outcome)),
      by_category: countBy(results.map((r) => r.category)),
      sample: results.slice(0, 5),
    };

    if (summary.gmail_mutations_total !== 0) {
      throw new Error("Dry run produced Gmail mutations");
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await end();
  }
}

function countBy(values: string[]) {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
