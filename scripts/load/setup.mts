/**
 * Creates the fixture for the load test: 100 students (LOAD001-LOAD100), a
 * group holding them, and a published 20-question test assigned to it.
 * Anything left from a previous run is removed first, and nothing else in the
 * database is touched. Refuses to run with NODE_ENV=production.
 *
 *   npx tsx scripts/load/setup.mts [students]
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { writeFileSync } from "node:fs";
import { loadEnv, FIXTURE_FILE, LOAD_GROUP, LOAD_TEST, LOAD_PREFIX } from "./common.mts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to create load-test users with NODE_ENV=production");
}

const env = loadEnv();
const COUNT = Number(process.argv[2] ?? 100);
const QUESTIONS = 20;
const sql = postgres(env.DATABASE_URL, { onnotice: () => {} });

await cleanup();

const hash = await bcrypt.hash("Load@12345", 10);
const students = await sql`
  insert into users ${sql(
    Array.from({ length: COUNT }, (_, i) => ({
      roll_number: `${LOAD_PREFIX}${String(i + 1).padStart(3, "0")}`,
      name: `Load Student ${i + 1}`,
      password_hash: hash,
      role: "student",
      must_change_password: false,
    })),
  )}
  returning id, roll_number`;

const [group] = await sql`insert into groups (name) values (${LOAD_GROUP}) returning id`;
await sql`insert into group_members ${sql(
  students.map((s) => ({ group_id: group.id, user_id: s.id })),
)}`;

const [test] = await sql`
  insert into tests (title, duration_minutes, status, max_warnings, camera_required, published_at)
  values (${LOAD_TEST}, 60, 'published', 1000, true, now())
  returning id`;
await sql`insert into test_groups (test_id, group_id) values (${test.id}, ${group.id})`;

const [section] = await sql`
  insert into sections (test_id, name, ordinal, default_marks, negative_marks)
  values (${test.id}, 'Section A', 0, 1, 0) returning id`;

const questions: { id: string; options: string[] }[] = [];
for (let q = 0; q < QUESTIONS; q++) {
  const [row] = await sql`
    insert into questions (section_id, type, body, ordinal)
    values (${section.id}, 'mcq_single', ${`Load question ${q + 1}: pick one.`}, ${q})
    returning id`;
  const opts = await sql`
    insert into options ${sql(
      [0, 1, 2, 3].map((o) => ({
        question_id: row.id,
        body: `Option ${o + 1}`,
        is_correct: o === 0,
        ordinal: o,
      })),
    )}
    returning id`;
  questions.push({ id: row.id, options: opts.map((o) => o.id) });
}

writeFileSync(
  FIXTURE_FILE,
  JSON.stringify(
    {
      testId: test.id,
      students: students.map((s) => ({ id: s.id, rollNumber: s.roll_number })),
      questions,
    },
    null,
    2,
  ),
);
console.log(`Created ${students.length} students and test ${test.id}`);
await sql.end();

async function cleanup() {
  await sql`delete from tests where title = ${LOAD_TEST}`;
  await sql`delete from groups where name = ${LOAD_GROUP}`;
  await sql`delete from users where roll_number like ${LOAD_PREFIX + "%"} and role = 'student'`;
}
