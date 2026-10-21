import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://inbox:inbox@localhost:5432/inbox_pilot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "drizzle");

async function main() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  console.log(`Migrating ${connectionString.replace(/:[^:@]+@/, ":***@")} ...`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
