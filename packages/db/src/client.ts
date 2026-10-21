import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type SqlClient = ReturnType<typeof postgres>;

export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    end: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

export type Database = ReturnType<typeof createDb>["db"];

export function createSqlClient(connectionString: string) {
  return postgres(connectionString, { max: 1 });
}
