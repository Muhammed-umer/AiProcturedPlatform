/**
 * Launch-day screenshots of PRISM at 1920x1080, taken in a real browser as a
 * student and then as the admin: sign-in, dashboards, the instructions
 * screen, the paper mid-test with a warning, the result, the live monitor,
 * the rank list and the warnings review.
 *
 * Uses a temporary student and paper (removed afterwards), so nothing in the
 * database is used up. Run against a production server started with
 * PROCTOR_FACE_GATE=off, because the synthetic webcam has no face in it.
 *
 *   PROCTOR_FACE_GATE=off npx next start -p 3200
 *   node scripts/screenshots.mjs http://localhost:3200 "<output folder>"
 */
import { chromium } from "@playwright/test";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = process.argv[3] ?? "screenshots";
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

const ROLL = "23CSE29";
const PASSWORD = "Shot@12345";
const TITLE = "Placement Technical Round 1";
const GROUP = "III Year CSE - A";

async function cleanup() {
  await sql`delete from tests where title = ${TITLE}`;
  await sql`delete from groups where name = ${GROUP}`;
  await sql`delete from users where roll_number = ${ROLL}`;
}
await cleanup();

const [student] = await sql`
  insert into users (roll_number, name, email, password_hash, role, must_change_password)
  values (${ROLL}, 'Muhammed Umer S', 'umer@gcee.ac.in', ${await bcrypt.hash(PASSWORD, 10)}, 'student', false)
  returning id`;
const [group] = await sql`insert into groups (name) values (${GROUP}) returning id`;
await sql`insert into group_members (group_id, user_id) values (${group.id}, ${student.id})`;
const [test] = await sql`
  insert into tests (title, instructions, duration_minutes, status, max_warnings, camera_required, published_at)
  values (${TITLE}, 'Programming and core computer science. Each question carries one mark. There is no negative marking.', 30, 'published', 3, true, now())
  returning id`;
await sql`insert into test_groups (test_id, group_id) values (${test.id}, ${group.id})`;

const paper = [
  ["Programming", [
    [`What is the output of this Java code?

int x = 5;
System.out.println(x++ + ++x);`, ["10", "11", "12", "Compilation error"], 2],
    ["In Python, what does len(\"hello\"[1:4]) return?", ["2", "3", "4", "5"], 1],
    ["Which data structure gives O(1) average time for insert, delete and search?", ["Array", "Linked list", "Hash table", "Binary search tree"], 2],
  ]],
  ["Core CS", [
    ["Which SQL clause filters rows after GROUP BY has been applied?", ["WHERE", "HAVING", "ORDER BY", "LIMIT"], 1],
    ["In OOP, which concept lets a subclass provide its own version of a method defined in its parent class?", ["Encapsulation", "Overloading", "Overriding", "Abstraction"], 2],
  ]],
];
for (const [s, [name, qs]] of paper.entries()) {
  const [section] = await sql`
    insert into sections (test_id, name, ordinal, default_marks, negative_marks)
    values (${test.id}, ${name}, ${s}, 1, 0) returning id`;
  for (const [i, [body, opts, correct]] of qs.entries()) {
    const [row] = await sql`
      insert into questions (section_id, type, body, ordinal)
      values (${section.id}, 'mcq_single', ${body}, ${i}) returning id`;
    await sql`insert into options ${sql(
      opts.map((o, k) => ({ question_id: row.id, body: o, is_correct: k === correct, ordinal: k })),
    )}`;
  }
}
const [admin] = await sql`select id, session_version from users where role = 'admin' limit 1`;

/* ---------------------------------------------------- capture ---------- */

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
let n = 0;
const shot = async (page, name) => {
  await page.waitForTimeout(600); // let entrance animations finish
  const file = join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("  saved", file);
};
const settle = (page) => page.waitForLoadState("networkidle");

const viewport = { width: 1920, height: 1080 };

// The student, signing in through the form like anyone else.
const studentCtx = await browser.newContext({ viewport, permissions: ["camera"] });
const s = await studentCtx.newPage();
await s.goto(`${BASE}/login`);
await settle(s);
await shot(s, "login");

await s.getByLabel("Roll number").fill(ROLL);
await s.getByLabel("Password").fill(PASSWORD);
await shot(s, "login-filled");
await s.getByRole("button", { name: "Sign in" }).click();
await s.waitForURL("**/student");
await settle(s);
await shot(s, "student-home");

await s.getByRole("link", { name: "Start test" }).click();
await s.waitForURL(/\/student\/test\//);
await settle(s);
await shot(s, "instructions");

await s.getByRole("button", { name: "Turn on camera" }).click();
await s.waitForTimeout(2500);
await s.getByRole("checkbox", { name: /I have read and agree/ }).check();
await shot(s, "instructions-camera-on");

await s.getByRole("button", { name: "Continue to the test" }).click();
await s.getByRole("timer").waitFor({ timeout: 30_000 });
await settle(s);
await shot(s, "exam-question");

// Answer three of five, then move to the fourth for a mid-test view.
for (const q of [1, 2, 3]) {
  await s.getByRole("button", { name: new RegExp(`^Question ${q}(?!\\d)`) }).click();
  await s.locator(".card").first().getByRole("radio").nth(1).click();
  await s.waitForTimeout(300);
}
await s.getByRole("button", { name: /^Question 4(?!\d)/ }).click();
await shot(s, "exam-in-progress");

// A warning: the student switches away.
await s.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await s.getByText(/Warning 1 of 3/).waitFor();
await shot(s, "exam-warning");
await s.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});

// The admin's live monitor while the student is still writing.
const adminCtx = await browser.newContext({ viewport });
const adminToken = await new SignJWT({ userId: admin.id, sv: admin.session_version })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(env.SESSION_SECRET));
await adminCtx.addCookies([{ name: "ptp_session", value: adminToken, url: BASE }]);
const a = await adminCtx.newPage();
await a.goto(`${BASE}/admin`);
await settle(a);
await shot(a, "admin-dashboard");
await a.goto(`${BASE}/admin/monitor/${test.id}`);
await settle(a);
await a.getByText("Writing now").waitFor();
await shot(a, "admin-live-monitor");

// The student submits.
await s.getByRole("button", { name: "Submit", exact: true }).click();
await shot(s, "exam-submit-confirm");
await s.getByRole("button", { name: "Yes, submit" }).click();
await s.waitForURL("**/student/result/**");
await settle(s);
await shot(s, "student-result");
await s.mouse.wheel(0, 700);
await shot(s, "student-result-answers");

// The admin afterwards: builder, results and the warnings review.
await a.goto(`${BASE}/admin/tests/${test.id}`);
await settle(a);
await shot(a, "admin-test-builder");
await a.goto(`${BASE}/admin/results/${test.id}`);
await settle(a);
await shot(a, "admin-results");
await a.goto(`${BASE}/admin/monitor/${test.id}`);
await settle(a);
await a.getByRole("table").locator('a[href*="/proctor/"]').first().click();
await a.getByRole("img", { name: /as the test ended$/ }).waitFor();
await settle(a);
await shot(a, "admin-warnings-review");

await browser.close();
await cleanup();
await sql.end();
console.log(`\n${n} screenshots in ${OUT}`);
