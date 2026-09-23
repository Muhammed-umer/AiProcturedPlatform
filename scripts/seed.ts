/**
 * Resets the accounts and creates a small demo setup: one admin, one student,
 * a group and a published sample test, so the app is usable straight after
 * `npm run db:push`.
 *
 * This DELETES every existing user (and, by cascade, their attempts, answers
 * and webcam frames) so a forgotten password can never lock you out: reseeding
 * always gives back the credentials printed below. That is also why it refuses
 * to run with NODE_ENV=production.
 *
 * Run with: npm run db:seed
 */

import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";
import { SEED_ADMIN, SEED_STUDENT } from "../src/lib/seed-accounts";

// Load .env without a dotenv dependency, so setup needs one fewer package.
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

const {
  users,
  groups,
  groupMembers,
  tests,
  testGroups,
  sections,
  questions,
  options,
} = schema;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to seed with NODE_ENV=production: this deletes every user account.",
  );
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

/**
 * NODE_ENV is not set in a plain shell on the lab server, so it cannot be
 * the only thing standing between a typo and a wiped exam database. Refuse
 * whenever the database already holds submitted tests, unless --force.
 */
async function refuseIfRealData() {
  if (process.argv.includes("--force")) return;
  const [{ n }] = await client<{ n: number }[]>`
    select count(*)::int as n from attempts where status <> 'in_progress'`;
  if (n > 0) {
    console.error(
      `Refusing to seed: the database holds ${n} submitted attempt(s), and seeding deletes every account.\n` +
        "If this really is a development database, run: npm run db:seed -- --force",
    );
    await client.end();
    process.exit(1);
  }
}

const hash = (p: string) => bcrypt.hash(p, 10);

async function main() {
  await refuseIfRealData();
  console.log("Seeding…");

  /* ---------------------------------------------------------- accounts */

  // tests.created_by points at a user without a cascade rule, so release those
  // references before clearing the table. Everything else (group membership,
  // attempts, answers, violations, webcam frames) cascades from the user row.
  await db.update(tests).set({ createdBy: null });
  const removed = await db.delete(users).returning({ id: users.id });
  if (removed.length > 0) {
    console.log(`  removed ${removed.length} existing account(s)`);
  }

  const [admin] = await db
    .insert(users)
    .values({
      rollNumber: SEED_ADMIN.rollNumber,
      name: SEED_ADMIN.name,
      email: null,
      passwordHash: await hash(SEED_ADMIN.password),
      role: "admin",
      // Demo accounts keep their short passwords; see seed-accounts.ts.
      mustChangePassword: false,
    })
    .returning();
  console.log(`  admin    ${admin.rollNumber}  password: ${SEED_ADMIN.password}`);

  const [student] = await db
    .insert(users)
    .values({
      rollNumber: SEED_STUDENT.rollNumber,
      name: SEED_STUDENT.name,
      email: SEED_STUDENT.email,
      passwordHash: await hash(SEED_STUDENT.password),
      role: "student",
      mustChangePassword: false,
    })
    .returning();
  console.log(`  student  ${student.rollNumber}  password: ${SEED_STUDENT.password}`);

  /* ------------------------------------------------------- demo group */

  const groupName = "Demo Batch";
  let [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.name, groupName))
    .limit(1);

  if (!group) {
    [group] = await db
      .insert(groups)
      .values({ name: groupName, description: "Sample group for trying the app" })
      .returning();
    console.log(`  group created: ${groupName}`);
  }

  await db
    .insert(groupMembers)
    .values({ groupId: group.id, userId: student.id })
    .onConflictDoNothing();

  /* -------------------------------------------------------- demo test */

  const title = "Sample Aptitude Test";
  const existingTest = await db
    .select()
    .from(tests)
    .where(eq(tests.title, title))
    .limit(1);

  if (existingTest.length === 0) {
    const [test] = await db
      .insert(tests)
      .values({
        title,
        instructions:
          "Answer all questions. The test runs in full screen with your camera on, and switching away counts as a warning.",
        durationMinutes: 15,
        maxWarnings: 3,
        status: "published",
        publishedAt: new Date(),
        createdBy: admin.id,
      })
      .returning();

    await db.insert(testGroups).values({ testId: test.id, groupId: group.id });

    const [sectionA] = await db
      .insert(sections)
      .values({
        testId: test.id,
        name: "Section A",
        topic: "Quantitative",
        ordinal: 0,
        defaultMarks: "1",
        negativeMarks: "0",
      })
      .returning();

    const [sectionB] = await db
      .insert(sections)
      .values({
        testId: test.id,
        name: "Section B",
        topic: "General Knowledge",
        ordinal: 1,
        defaultMarks: "2",
        negativeMarks: "0.5",
      })
      .returning();

    // One of each question type, so every path is exercised.
    const [q1] = await db
      .insert(questions)
      .values({
        sectionId: sectionA.id,
        type: "mcq_single",
        body: "What is 15% of 200?",
        ordinal: 0,
      })
      .returning();

    await db.insert(options).values([
      { questionId: q1.id, body: "20", isCorrect: false, ordinal: 0 },
      { questionId: q1.id, body: "30", isCorrect: true, ordinal: 1 },
      { questionId: q1.id, body: "35", isCorrect: false, ordinal: 2 },
      { questionId: q1.id, body: "40", isCorrect: false, ordinal: 3 },
    ]);

    const [q2] = await db
      .insert(questions)
      .values({
        sectionId: sectionA.id,
        type: "mcq_multiple",
        body: "Which of these are prime numbers?",
        ordinal: 1,
        marksOverride: "3",
      })
      .returning();

    await db.insert(options).values([
      { questionId: q2.id, body: "2", isCorrect: true, ordinal: 0 },
      { questionId: q2.id, body: "4", isCorrect: false, ordinal: 1 },
      { questionId: q2.id, body: "7", isCorrect: true, ordinal: 2 },
      { questionId: q2.id, body: "9", isCorrect: false, ordinal: 3 },
    ]);

    await db.insert(questions).values({
      sectionId: sectionB.id,
      type: "fill_blank",
      body: "The chemical symbol for water is ______",
      ordinal: 0,
      acceptedAnswers: ["H2O", "water"],
    });

    console.log(`  test created: ${title}`);
  } else {
    // Reassign it to the new admin, since the old owner was just deleted.
    await db
      .update(tests)
      .set({ createdBy: admin.id })
      .where(eq(tests.id, existingTest[0].id));
    console.log("  demo test already exists, reassigned to the new admin");
  }

  console.log(
    `\nDone. Sign in at /login\n  admin   ${SEED_ADMIN.rollNumber} / ${SEED_ADMIN.password}\n  student ${SEED_STUDENT.rollNumber} / ${SEED_STUDENT.password}`,
  );
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
