/**
 * A real-browser walk-through of one sitting, as an invigilator would see it:
 * the student signs in, opens the test, turns the camera on, agrees, begins,
 * answers, earns one warning by switching away, submits; then the admin opens
 * the live monitor and the warnings review for that attempt.
 *
 * Runs against a production server started with PROCTOR_FACE_GATE=off (the
 * synthetic webcam has no face in it). Saves screenshots of every stage.
 *
 *   PROCTOR_FACE_GATE=off npx next start -p 3200
 *   node scripts/walkthrough.mjs http://localhost:3200 <outDir>
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = process.argv[3] ?? "walkthrough-shots";
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const sql = postgres(env.DATABASE_URL, { onnotice() {} });

/* ---------------------------------------------------- fixture ---------- */

const ROLL = "WALK001";
const PASSWORD = "Walk@12345";
const TITLE = "Walk-through Paper";

await sql`delete from tests where title = ${TITLE}`;
await sql`delete from groups where name = 'Walk-through Batch'`;
await sql`delete from users where roll_number = ${ROLL}`;

const [student] = await sql`
  insert into users (roll_number, name, password_hash, role, must_change_password)
  values (${ROLL}, 'Walk Through', ${await bcrypt.hash(PASSWORD, 10)}, 'student', false)
  returning id`;
const [group] = await sql`insert into groups (name) values ('Walk-through Batch') returning id`;
await sql`insert into group_members (group_id, user_id) values (${group.id}, ${student.id})`;
const [test] = await sql`
  insert into tests (title, duration_minutes, status, max_warnings, camera_required, published_at)
  values (${TITLE}, 10, 'published', 3, true, now()) returning id`;
await sql`insert into test_groups (test_id, group_id) values (${test.id}, ${group.id})`;
const [section] = await sql`
  insert into sections (test_id, name, ordinal, default_marks, negative_marks)
  values (${test.id}, 'Aptitude', 0, 1, 0) returning id`;
for (const [i, q] of ["What is 5 + 7?", "What is 9 - 4?"].entries()) {
  const [row] = await sql`
    insert into questions (section_id, type, body, ordinal)
    values (${section.id}, 'mcq_single', ${q}, ${i}) returning id`;
  const answers = i === 0 ? ["10", "12", "14"] : ["5", "6", "4"];
  await sql`insert into options ${sql(
    answers.map((a, o) => ({
      question_id: row.id,
      body: a,
      is_correct: (i === 0 && a === "12") || (i === 1 && a === "5"),
      ordinal: o,
    })),
  )}`;
}
const [admin] = await sql`select id, session_version from users where role = 'admin' limit 1`;

/* ---------------------------------------------------- the sitting ------ */

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const shots = [];
const shot = async (page, name) => {
  const file = join(OUT, `${String(shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  console.log("  ", name);
};

const studentCtx = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  permissions: ["camera"],
});
const s = await studentCtx.newPage();

console.log("Student");
await s.goto(`${BASE}/login`);
await s.getByLabel("Roll number").fill(ROLL);
await s.getByLabel("Password").fill(PASSWORD);
await s.getByRole("button", { name: "Sign in" }).click();
await s.waitForURL("**/student");
await shot(s, "student-dashboard");

await s.getByRole("link", { name: "Start test" }).click();
await s.waitForURL(/\/student\/test\//);
await shot(s, "instructions-before-camera");

await s.getByRole("button", { name: "Turn on camera" }).click();
await s.waitForTimeout(2500);
await s.getByRole("checkbox", { name: /I have read and agree/ }).check();
await shot(s, "instructions-ready");
await s.getByRole("button", { name: "Continue to the test" }).click();
try {
  await s.getByRole("timer").waitFor({ timeout: 20_000 });
} catch (err) {
  await shot(s, "FAILED-after-continue");
  console.log("Screen text:", (await s.locator("body").innerText()).slice(0, 1500));
  throw err;
}
await shot(s, "question-1");

// Answer both by content: the order is shuffled per student.
for (const n of [1, 2]) {
  await s.getByRole("button", { name: new RegExp(`^Question ${n}(?!\\d)`) }).click();
  const card = s.locator(".card").first();
  const heading = await card.getByRole("heading").first().innerText();
  const right = /5 \+ 7/.test(heading) ? "12" : "5";
  await card.getByRole("radio", { name: right, exact: true }).click();
  await s.waitForTimeout(300);
}
await shot(s, "question-answered");

// One warning: the student switches away from the test.
await s.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await s.getByText(/Warning 1 of 3/).waitFor();
await shot(s, "warning-switched-tab");
await s.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});

await s.getByRole("button", { name: "Submit", exact: true }).click();
await s.getByRole("button", { name: "Yes, submit" }).click();
await s.waitForURL("**/student/result/**");
await shot(s, "student-result");

/* ---------------------------------------------------- the admin -------- */

console.log("Admin");
const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
// Signed in with a session cookie, as the admin's password is whatever staff
// last set it to; the student above signed in through the form for real.
const adminToken = await new SignJWT({ userId: admin.id, sv: admin.session_version })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(env.SESSION_SECRET));
await adminCtx.addCookies([{ name: "ptp_session", value: adminToken, url: BASE }]);
const a = await adminCtx.newPage();

await a.goto(`${BASE}/admin/monitor/${test.id}`);
await a.getByText("Photo received").waitFor();
await shot(a, "admin-monitor");

await a.getByRole("table").locator('a[href*="/proctor/"]').first().click();
await a.getByRole("heading", { name: /^Warnings: / }).waitFor();
await a.getByRole("img", { name: /as the test ended$/ }).waitFor();
await shot(a, "admin-warnings-review");

/* ---------------------------------------------------- checks ----------- */

const [att] = await sql`
  select status, warning_count, total_score, max_score,
    (select count(*)::int from proctor_snapshots p where p.attempt_id = attempts.id) as photos
  from attempts where test_id = ${test.id}`;
console.log("\nRecorded:", att);
const ok =
  att.status === "submitted" &&
  att.warning_count === 1 &&
  Number(att.total_score) === 2 &&
  att.photos === 1;
console.log(ok ? "WALK-THROUGH PASSED" : "WALK-THROUGH FAILED");

await browser.close();
await sql`delete from tests where title = ${TITLE}`;
await sql`delete from groups where name = 'Walk-through Batch'`;
await sql`delete from users where roll_number = ${ROLL}`;
await sql.end();
process.exit(ok ? 0 : 1);
