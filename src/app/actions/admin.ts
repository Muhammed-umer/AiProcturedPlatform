"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  groups,
  groupMembers,
  tests,
  testGroups,
  sections,
  questions,
  options,
  passwordResetRequests,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { hashPassword, generateDefaultPassword } from "@/lib/password";
import { parseStudentRows, parseQuestionRows } from "@/lib/excel-parse";
import { readSheetRows } from "@/lib/excel-read";
import { clampMaxAttempts } from "@/lib/attempts";

export interface AdminState {
  error?: string;
  success?: string;
  /** Roll number and issued password pairs, shown once after an import. */
  credentials?: { rollNumber: string; name: string; password: string }[];
  issues?: { row: number; message: string }[];
}

/* ----------------------------------------------------------- groups ---- */

export async function createGroup(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "Give the group a name" };

  const existing = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.name, name))
    .limit(1);

  if (existing.length > 0)
    return { error: `A group called "${name}" already exists` };

  await db.insert(groups).values({ name, description: description || null });
  revalidatePath("/admin/groups");
  return { success: `Group "${name}" created` };
}

export async function deleteGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("groupId") ?? "");
  if (id) await db.delete(groups).where(eq(groups.id, id));
  revalidatePath("/admin/groups");
}

/* --------------------------------------------------- student import ---- */

/**
 * Reads a student spreadsheet and creates accounts. The admin either picks an
 * existing group or types a new group name, which is created on the spot.
 *
 * A roll number that already exists is not duplicated. The existing student is
 * simply added to the chosen group, which is what makes it safe to re-upload a
 * corrected sheet.
 */
export async function importStudents(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a spreadsheet to upload" };
  }

  const mode = String(formData.get("groupMode") ?? "existing");
  let groupId = String(formData.get("groupId") ?? "");
  const newGroupName = String(formData.get("newGroupName") ?? "").trim();

  if (mode === "new") {
    if (!newGroupName) return { error: "Enter a name for the new group" };
    const clash = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.name, newGroupName))
      .limit(1);
    if (clash.length > 0) {
      return { error: `A group called "${newGroupName}" already exists` };
    }
    const created = await db
      .insert(groups)
      .values({ name: newGroupName })
      .returning({ id: groups.id });
    groupId = created[0].id;
  } else if (!groupId) {
    return { error: "Choose a group, or create a new one" };
  }

  let rows;
  try {
    rows = await readSheetRows(await file.arrayBuffer());
  } catch {
    return {
      error: "That file could not be read. Upload a .xlsx or .csv file.",
    };
  }

  const parsed = parseStudentRows(rows);

  if (parsed.valid.length === 0) {
    return {
      error:
        "No usable rows found. Expected columns: Roll Number, Name, Email.",
      issues: parsed.issues,
    };
  }

  const rollNumbers = parsed.valid.map((r) => r.rollNumber.toUpperCase());
  const existing = await db
    .select({ id: users.id, rollNumber: users.rollNumber })
    .from(users)
    .where(inArray(users.rollNumber, rollNumbers));

  const existingByRoll = new Map(existing.map((u) => [u.rollNumber, u.id]));
  const credentials: AdminState["credentials"] = [];
  const memberIds: string[] = [];

  for (const row of parsed.valid) {
    const roll = row.rollNumber.toUpperCase();
    const already = existingByRoll.get(roll);

    if (already) {
      memberIds.push(already);
      continue;
    }

    const password = generateDefaultPassword();
    const inserted = await db
      .insert(users)
      .values({
        rollNumber: roll,
        name: row.name,
        email: row.email,
        passwordHash: await hashPassword(password),
        role: "student",
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    memberIds.push(inserted[0].id);
    credentials.push({ rollNumber: roll, name: row.name, password });
  }

  if (memberIds.length > 0) {
    await db
      .insert(groupMembers)
      .values(memberIds.map((userId) => ({ groupId, userId })))
      .onConflictDoNothing();
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/groups");

  const reused = memberIds.length - credentials.length;
  return {
    success:
      `${credentials.length} new account${credentials.length === 1 ? "" : "s"} created` +
      (reused > 0
        ? `, ${reused} existing student${reused === 1 ? "" : "s"} added to the group`
        : ""),
    credentials,
    issues: parsed.issues,
  };
}

/** The state behind a "Reset password" button: the new password, once. */
export interface ResetState {
  password?: string;
  error?: string;
}

/**
 * Gives an account a fresh random password it must change on next sign-in,
 * lifts any lockout, and signs it out everywhere.
 */
async function issueTemporaryPassword(userId: string): Promise<string> {
  const password = generateDefaultPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(and(eq(users.id, userId), eq(users.role, "student")));
  return password;
}

export async function resetStudentPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing student" };

  const password = await issueTemporaryPassword(userId);
  revalidatePath("/admin/students");
  return { password };
}

export async function resolveResetRequest(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const session = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("decision") ?? "approved");
  if (!requestId) return { error: "Missing request" };

  // The student comes from the request row, not from the form.
  const [request] = await db
    .select({
      userId: passwordResetRequests.userId,
      status: passwordResetRequests.status,
    })
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.id, requestId))
    .limit(1);
  if (!request || request.status !== "pending") {
    return { error: "This request has already been handled" };
  }

  const password =
    action === "approved"
      ? await issueTemporaryPassword(request.userId)
      : undefined;

  await db
    .update(passwordResetRequests)
    .set({
      status: action === "approved" ? "approved" : "rejected",
      resolvedAt: new Date(),
      resolvedBy: session.userId,
    })
    .where(eq(passwordResetRequests.id, requestId));

  revalidatePath("/admin/requests");
  return { password };
}

/* ------------------------------------------------------------ tests ---- */

export async function createTest(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const session = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const duration = Number(formData.get("durationMinutes") ?? 0);
  const instructions = String(formData.get("instructions") ?? "").trim();
  const maxWarnings = Number(formData.get("maxWarnings") ?? 3);

  if (!title) return { error: "Give the test a title" };
  if (!Number.isFinite(duration) || duration < 1) {
    return { error: "Duration must be at least one minute" };
  }

  const created = await db
    .insert(tests)
    .values({
      title,
      instructions: instructions || null,
      durationMinutes: Math.floor(duration),
      maxWarnings: Math.max(1, Math.floor(maxWarnings)),
      maxAttempts: clampMaxAttempts(formData.get("maxAttempts") ?? 1),
      shuffleQuestions: formData.get("shuffleQuestions") === "on",
      shuffleOptions: formData.get("shuffleOptions") === "on",
      cameraRequired: formData.get("cameraRequired") === "on",
      createdBy: session.userId,
    })
    .returning({ id: tests.id });

  // Every test starts with one section, so the question form is usable at once.
  await db.insert(sections).values({
    testId: created[0].id,
    name: "Section A",
    ordinal: 0,
    defaultMarks: "1",
    negativeMarks: "0",
  });

  revalidatePath("/admin/tests");
  return { success: created[0].id };
}

export async function updateTestGroups(formData: FormData): Promise<void> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  const selected = formData.getAll("groupIds").map(String).filter(Boolean);

  if (!testId) return;

  // Replace the whole set. Works before or after publishing, which is how a
  // live test gets opened up to an extra group.
  await db.delete(testGroups).where(eq(testGroups.testId, testId));
  if (selected.length > 0) {
    await db
      .insert(testGroups)
      .values(selected.map((groupId) => ({ testId, groupId })))
      .onConflictDoNothing();
  }

  revalidatePath(`/admin/tests/${testId}`);
  revalidatePath("/admin/tests");
}

export async function setTestStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  const status = String(formData.get("status") ?? "draft") as
    "draft" | "published" | "closed";

  await db
    .update(tests)
    .set({
      status,
      publishedAt: status === "published" ? new Date() : undefined,
    })
    .where(eq(tests.id, testId));

  revalidatePath(`/admin/tests/${testId}`);
  revalidatePath("/admin/tests");
}

/** Saves what a student is allowed to see about their own attempt. */
export async function updateTestVisibility(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  if (!testId) return { error: "Missing test" };

  await db
    .update(tests)
    .set({
      showScoreToStudent: formData.get("showScore") === "on",
      showAnswersToStudent: formData.get("showAnswers") === "on",
    })
    .where(eq(tests.id, testId));

  revalidatePath(`/admin/tests/${testId}`);
  return { success: "Saved" };
}

/**
 * Saves how the test is sat: attempts allowed, shuffling and the camera.
 * A paper already open keeps its attempt; the rest applies from the next
 * start or reload.
 */
export async function updateTestSettings(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  if (!testId) return { error: "Missing test" };

  await db
    .update(tests)
    .set({
      maxAttempts: clampMaxAttempts(formData.get("maxAttempts") ?? 1),
      shuffleQuestions: formData.get("shuffleQuestions") === "on",
      shuffleOptions: formData.get("shuffleOptions") === "on",
      cameraRequired: formData.get("cameraRequired") === "on",
    })
    .where(eq(tests.id, testId));

  revalidatePath(`/admin/tests/${testId}`);
  revalidatePath(`/admin/monitor/${testId}`);
  return { success: "Saved" };
}

export async function deleteTest(formData: FormData): Promise<void> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  if (testId) await db.delete(tests).where(eq(tests.id, testId));
  revalidatePath("/admin/tests");
  // This action is submitted from the test's own page, which no longer exists
  // once the row is gone. Without this the browser stays there and shows a
  // 404. redirect throws, so it has to come after the revalidate above.
  redirect("/admin/tests");
}

/* --------------------------------------------------------- sections ---- */

export async function addSection(formData: FormData): Promise<void> {
  await requireAdmin();
  const testId = String(formData.get("testId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const defaultMarks = String(formData.get("defaultMarks") ?? "1");
  const negativeMarks = String(formData.get("negativeMarks") ?? "0");

  if (!testId || !name) return;

  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sections)
    .where(eq(sections.testId, testId));

  await db.insert(sections).values({
    testId,
    name,
    topic: topic || null,
    ordinal: count[0]?.n ?? 0,
    defaultMarks,
    negativeMarks,
  });

  revalidatePath(`/admin/tests/${testId}`);
}

export async function updateSection(formData: FormData): Promise<void> {
  await requireAdmin();
  const sectionId = String(formData.get("sectionId") ?? "");
  const testId = String(formData.get("testId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const defaultMarks = String(formData.get("defaultMarks") ?? "1");
  const negativeMarks = String(formData.get("negativeMarks") ?? "0");

  if (!sectionId || !name) return;

  await db
    .update(sections)
    .set({ name, topic: topic || null, defaultMarks, negativeMarks })
    .where(eq(sections.id, sectionId));

  revalidatePath(`/admin/tests/${testId}`);
}

export async function deleteSection(formData: FormData): Promise<void> {
  await requireAdmin();
  const sectionId = String(formData.get("sectionId") ?? "");
  const testId = String(formData.get("testId") ?? "");
  if (sectionId) await db.delete(sections).where(eq(sections.id, sectionId));
  revalidatePath(`/admin/tests/${testId}`);
}

/* -------------------------------------------------------- questions ---- */

export async function addQuestion(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const testId = String(formData.get("testId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const type = String(formData.get("type") ?? "mcq_single") as
    "mcq_single" | "mcq_multiple" | "fill_blank";
  const body = String(formData.get("body") ?? "").trim();
  const marksRaw = String(formData.get("marksOverride") ?? "").trim();

  if (!sectionId) return { error: "Choose a section" };
  if (!body) return { error: "Enter the question text" };

  const marksOverride = marksRaw === "" ? null : marksRaw;
  if (marksOverride !== null && !(Number(marksOverride) > 0)) {
    return { error: "Marks must be a positive number, or left blank" };
  }

  if (type === "fill_blank") {
    const answersRaw = String(formData.get("acceptedAnswers") ?? "").trim();
    const accepted = answersRaw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (accepted.length === 0) {
      return { error: "Enter at least one accepted answer" };
    }

    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(questions)
      .where(eq(questions.sectionId, sectionId));

    await db.insert(questions).values({
      sectionId,
      type,
      body,
      ordinal: count[0]?.n ?? 0,
      marksOverride,
      acceptedAnswers: accepted,
    });

    revalidatePath(`/admin/tests/${testId}`);
    return { success: "Question added" };
  }

  const optionBodies: string[] = [];
  for (let i = 0; i < 6; i++) {
    const text = String(formData.get(`option_${i}`) ?? "").trim();
    if (text) optionBodies.push(text);
  }

  const correctIdx = formData
    .getAll("correct")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  if (optionBodies.length < 2) return { error: "Enter at least two options" };
  if (correctIdx.length === 0) return { error: "Mark which option is correct" };
  if (type === "mcq_single" && correctIdx.length !== 1) {
    return {
      error: "A single answer question needs exactly one correct option",
    };
  }
  if (type === "mcq_multiple" && correctIdx.length < 2) {
    return {
      error: "A multiple answer question needs at least two correct options",
    };
  }
  if (correctIdx.some((i) => i >= optionBodies.length)) {
    return { error: "A correct answer was marked on an empty option" };
  }

  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .where(eq(questions.sectionId, sectionId));

  const created = await db
    .insert(questions)
    .values({
      sectionId,
      type,
      body,
      ordinal: count[0]?.n ?? 0,
      marksOverride,
    })
    .returning({ id: questions.id });

  await db.insert(options).values(
    optionBodies.map((text, i) => ({
      questionId: created[0].id,
      body: text,
      isCorrect: correctIdx.includes(i),
      ordinal: i,
    })),
  );

  revalidatePath(`/admin/tests/${testId}`);
  return { success: "Question added" };
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  await requireAdmin();
  const questionId = String(formData.get("questionId") ?? "");
  const testId = String(formData.get("testId") ?? "");
  if (questionId)
    await db.delete(questions).where(eq(questions.id, questionId));
  revalidatePath(`/admin/tests/${testId}`);
}

/** Bulk question upload. Sections named in the sheet are created as needed. */
export async function importQuestions(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  await requireAdmin();

  const testId = String(formData.get("testId") ?? "");
  const file = formData.get("file");

  if (!testId) return { error: "Missing test" };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a spreadsheet to upload" };
  }

  let rows;
  try {
    rows = await readSheetRows(await file.arrayBuffer());
  } catch {
    return {
      error: "That file could not be read. Upload a .xlsx or .csv file.",
    };
  }

  const parsed = parseQuestionRows(rows);
  if (parsed.valid.length === 0) {
    return {
      error:
        "No usable rows found. Expected columns: Section, Type, Question, Option A to F, Correct, Marks.",
      issues: parsed.issues,
    };
  }

  const existingSections = await db
    .select({ id: sections.id, name: sections.name })
    .from(sections)
    .where(eq(sections.testId, testId));

  const byName = new Map(
    existingSections.map((s) => [s.name.trim().toLowerCase(), s.id]),
  );
  let ordinal = existingSections.length;

  for (const row of parsed.valid) {
    const key = row.section.trim().toLowerCase();
    let sectionId = byName.get(key);

    if (!sectionId) {
      const created = await db
        .insert(sections)
        .values({
          testId,
          name: row.section,
          ordinal: ordinal++,
          defaultMarks: "1",
          negativeMarks: "0",
        })
        .returning({ id: sections.id });
      sectionId = created[0].id;
      byName.set(key, sectionId);
    }

    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(questions)
      .where(eq(questions.sectionId, sectionId));

    const created = await db
      .insert(questions)
      .values({
        sectionId,
        type: row.type,
        body: row.body,
        ordinal: count[0]?.n ?? 0,
        marksOverride: row.marks === null ? null : String(row.marks),
        acceptedAnswers: row.acceptedAnswers,
      })
      .returning({ id: questions.id });

    if (row.options.length > 0) {
      await db.insert(options).values(
        row.options.map((o, i) => ({
          questionId: created[0].id,
          body: o.body,
          isCorrect: o.isCorrect,
          ordinal: i,
        })),
      );
    }
  }

  revalidatePath(`/admin/tests/${testId}`);
  return {
    success: `${parsed.valid.length} question${parsed.valid.length === 1 ? "" : "s"} imported`,
    issues: parsed.issues,
  };
}
