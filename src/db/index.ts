import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL server.",
  );
}

/**
 * Next.js reloads modules in development, so the client is cached on
 * globalThis to avoid opening a new pool on every hot reload.
 */
const globalForDb = globalThis as unknown as {
  __ptpClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__ptpClient ??
  postgres(connectionString, {
    // Measured with 100 students writing at once (scripts/load): the steady
    // load is about a hundred short queries a second, which ten connections
    // handle, but the bursts - everyone opening or submitting in the same
    // second - queue less with twenty. Well inside PostgreSQL's default of
    // 100 connections.
    max: 20,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ptpClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
