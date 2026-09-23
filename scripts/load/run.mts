/**
 * Simulates a full lab sitting against a production server
 * (`npm run build && npx next start -p 3100`), driving the same server
 * actions and routes the browser does:
 *
 *   1. every student opens the test at the same moment, then everyone
 *      presses Continue together (which starts the clock and sends the paper)
 *   2. for DURATION seconds each one answers a question every 3-8 s and
 *      syncs the clock every 20 s, while one admin watches the live monitor
 *   3. everyone submits at the same moment, each sending the end-of-test photo
 *
 * Prints latency percentiles and errors per operation.
 *
 *   npx tsx scripts/load/setup.mts 100
 *   npx tsx scripts/load/run.mts [baseUrl] [durationSeconds]
 */
import postgres from "postgres";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { loadEnv, FIXTURE_FILE } from "./common.mts";

const BASE = process.argv[2] ?? "http://localhost:3100";
const DURATION_S = Number(process.argv[3] ?? 90);
const env = loadEnv();

const fixture = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as {
  testId: string;
  students: { id: string; rollNumber: string }[];
  questions: { id: string; options: string[] }[];
};

/* ------------------------------------------------------------ actions -- */

const manifest = JSON.parse(
  readFileSync(".next/server/server-reference-manifest.json", "utf8"),
).node as Record<string, { exportedName: string; filename: string }>;

function actionId(name: string): string {
  const hit = Object.entries(manifest).find(([, v]) => v.exportedName === name);
  if (!hit) throw new Error(`No server action named ${name} in the build`);
  return hit[0];
}

const ACTIONS = {
  beginAttempt: actionId("beginAttempt"),
  saveAnswer: actionId("saveAnswer"),
  uploadFinalPhoto: actionId("uploadFinalPhoto"),
  checkTime: actionId("checkTime"),
  submitOwnAttempt: actionId("submitOwnAttempt"),
  getLiveSnapshot: actionId("getLiveSnapshot"),
};

/* -------------------------------------------------------------- stats -- */

const samples = new Map<string, number[]>();
const failures = new Map<string, Map<string, number>>();

function record(label: string, ms: number, error?: string) {
  if (!samples.has(label)) samples.set(label, []);
  samples.get(label)!.push(ms);
  if (error) {
    if (!failures.has(label)) failures.set(label, new Map());
    const f = failures.get(label)!;
    f.set(error, (f.get(error) ?? 0) + 1);
  }
}

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function report(title: string) {
  console.log(`\n${title}`);
  console.log(
    "operation".padEnd(18) +
      "count".padStart(7) +
      "p50 ms".padStart(9) +
      "p95 ms".padStart(9) +
      "max ms".padStart(9) +
      "errors".padStart(8),
  );
  for (const [label, list] of samples) {
    const s = [...list].sort((a, b) => a - b);
    const errs = [...(failures.get(label)?.values() ?? [])].reduce((a, b) => a + b, 0);
    console.log(
      label.padEnd(18) +
        String(s.length).padStart(7) +
        String(Math.round(pct(s, 50))).padStart(9) +
        String(Math.round(pct(s, 95))).padStart(9) +
        String(Math.round(s[s.length - 1])).padStart(9) +
        String(errs).padStart(8),
    );
  }
  for (const [label, f] of failures) {
    for (const [msg, n] of f) console.log(`  ${label}: ${n} x ${msg}`);
  }
  samples.clear();
  failures.clear();
}

/* ---------------------------------------------------------- transport -- */

/** Matches src/lib/session.ts: the id and the account's session version. */
async function token(userId: string, sessionVersion: number) {
  return new SignJWT({ userId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
}

async function timed(label: string, run: () => Promise<Response>, expect = 200) {
  const started = performance.now();
  try {
    const res = await run();
    const body = await res.arrayBuffer();
    record(
      label,
      performance.now() - started,
      res.status === expect ? undefined : `HTTP ${res.status}`,
    );
    return { res, body };
  } catch (err) {
    record(label, performance.now() - started, (err as Error).message.slice(0, 80));
    return null;
  }
}

function callAction(label: string, cookie: string, path: string, id: string, args: unknown[]) {
  return timed(label, () =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
        Cookie: cookie,
      },
      body: JSON.stringify(args),
    }),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* --------------------------------------------------------------- main -- */

const sql = postgres(env.DATABASE_URL, { onnotice: () => {} });
const [admin] = await sql`
  select id, session_version from users
  where role = 'admin' and must_change_password = false limit 1`;
if (!admin) throw new Error("Needs an admin who has finished first sign-in");
const adminCookie = `ptp_session=${await token(admin.id, admin.session_version)}`;

const versions = new Map(
  (
    await sql`select id, session_version from users where id in ${sql(
      fixture.students.map((s) => s.id),
    )}`
  ).map((r) => [r.id, r.session_version as number]),
);

const students = await Promise.all(
  fixture.students.map(async (s) => ({
    ...s,
    cookie: `ptp_session=${await token(s.id, versions.get(s.id) ?? 0)}`,
    attemptId: "",
  })),
);

const testPath = `/student/test/${fixture.testId}`;
console.log(`${students.length} students against ${BASE}, ${DURATION_S}s sitting`);

// 1. Everyone opens the test at once.
await Promise.all(
  students.map((s) =>
    timed("open test", () => fetch(`${BASE}${testPath}`, { headers: { Cookie: s.cookie } })),
  ),
);

const rows = await sql`
  select id, user_id from attempts
  where test_id = ${fixture.testId} and status = 'in_progress'`;
const attemptByUser = new Map(rows.map((r) => [r.user_id, r.id]));
for (const s of students) s.attemptId = attemptByUser.get(s.id) ?? "";
const missing = students.filter((s) => !s.attemptId).length;
if (missing) console.log(`WARNING: ${missing} students have no attempt`);

// ...and everyone presses Continue in the same second.
await Promise.all(
  students.map((s) =>
    callAction("begin (paper)", s.cookie, testPath, ACTIONS.beginAttempt, [s.attemptId]),
  ),
);
report("Phase 1: all students open the test and press Continue together");

// 2. The sitting.
const frame = randomBytes(26_000).toString("base64"); // ~35 KB, a real frame's size
const stopAt = Date.now() + DURATION_S * 1000;

async function sit(s: (typeof students)[number]) {
  let nextSync = Date.now() + rand(0, 20_000);
  let nextAnswer = Date.now() + rand(3_000, 8_000);
  while (Date.now() < stopAt) {
    const now = Date.now();
    if (now >= nextAnswer) {
      const q = fixture.questions[Math.floor(Math.random() * fixture.questions.length)];
      const opt = q.options[Math.floor(Math.random() * q.options.length)];
      await callAction("saveAnswer", s.cookie, testPath, ACTIONS.saveAnswer, [
        s.attemptId,
        q.id,
        { selectedOptionIds: [opt] },
      ]);
      nextAnswer = Date.now() + rand(3_000, 8_000);
    }
    if (now >= nextSync) {
      await callAction("checkTime", s.cookie, testPath, ACTIONS.checkTime, [s.attemptId]);
      nextSync = Date.now() + 20_000;
    }
    await sleep(200);
  }
}

async function watch() {
  const monitorPath = `/admin/monitor/${fixture.testId}`;
  while (Date.now() < stopAt) {
    const t = Date.now();
    await callAction("monitor poll", adminCookie, monitorPath, ACTIONS.getLiveSnapshot, [
      fixture.testId,
    ]);
    await sleep(Math.max(0, 5_000 - (Date.now() - t)));
  }
}

await Promise.all([...students.map(sit), watch()]);
report(`Phase 2: ${DURATION_S}s of writing, with the live monitor open`);

// 3. Everyone submits at once, each with the end-of-test photo.
await Promise.all(
  students.map((s) =>
    Promise.all([
      callAction("final photo", s.cookie, testPath, ACTIONS.uploadFinalPhoto, [
        s.attemptId,
        frame,
      ]),
      callAction("submit", s.cookie, testPath, ACTIONS.submitOwnAttempt, [s.attemptId]),
    ]),
  ),
);
report("Phase 3: all students submit together");

const [done] = await sql`
  select count(*)::int as n from attempts
  where test_id = ${fixture.testId} and status <> 'in_progress'`;
console.log(`\n${done.n} of ${students.length} attempts recorded as submitted`);

// Proof the actions did their work rather than just answering quickly.
const [stored] = await sql`
  select
    (select count(*)::int from answers a join attempts t on t.id = a.attempt_id
      where t.test_id = ${fixture.testId}) as answers,
    (select count(*)::int from answers a join attempts t on t.id = a.attempt_id
      where t.test_id = ${fixture.testId} and a.is_correct is not null) as graded,
    (select count(*)::int from proctor_snapshots p join attempts t on t.id = p.attempt_id
      where t.test_id = ${fixture.testId} and p.kind = 'final') as frames,
    (select count(*)::int from attempts
      where test_id = ${fixture.testId} and begun_at is not null) as begun`;
console.log(
  `${stored.begun} attempts begun, ${stored.answers} answers stored (${stored.graded} graded), ${stored.frames} end-of-test photos`,
);
await sql.end();
