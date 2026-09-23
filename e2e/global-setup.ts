import postgres from "postgres";
import { readFileSync } from "node:fs";

/**
 * Clears what earlier runs of these specs left behind, so every run starts
 * from the same place without resetting the whole database. Only rows under
 * the specs' own reserved names are touched: the E2E students, the E2E and
 * CRUD groups and tests. The rest of the development data is left alone.
 */
export default async function globalSetup() {
  const env = readFileSync(".env", "utf8");
  const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "");
  if (!url) throw new Error("DATABASE_URL is not set in .env");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`delete from tests where title in ('E2E Round 1', 'CRUD Paper', 'E2E Delete Me')`;
    await sql`delete from groups where name in ('E2E Batch', 'CRUD Batch A', 'CRUD Batch B')`;
    await sql`delete from users where role = 'student' and roll_number like 'E2E%'`;
  } finally {
    await sql.end();
  }
}
