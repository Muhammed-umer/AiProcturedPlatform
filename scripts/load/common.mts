import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const LOAD_PREFIX = "LOAD";
export const LOAD_GROUP = "Load Test Batch";
export const LOAD_TEST = "Load Test Paper";
export const FIXTURE_FILE = join(tmpdir(), "ptp-load-fixture.json");

/** Reads .env without pulling in dotenv. */
export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
