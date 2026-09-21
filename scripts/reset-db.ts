/**
 * Empties the database by dropping and recreating the public schema, so that
 * `npm run db:push && npm run db:seed` starts from nothing. For development
 * and the end-to-end tests only: it destroys every row.
 *
 * Run with: npm run db:reset
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

// Load .env without a dotenv dependency, matching scripts/seed.ts.
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env file. The check below will report the missing variable.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset the database with NODE_ENV=production.");
  process.exit(1);
}

// The cascade drop emits a NOTICE listing dependent objects; not useful here.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe("drop schema public cascade; create schema public;");
  console.log("Database emptied. Now run: npm run db:push && npm run db:seed");
} finally {
  await sql.end();
}
