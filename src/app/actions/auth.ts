"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResetRequests } from "@/db/schema";
import {
  verifyPassword,
  hashPassword,
  checkPasswordStrength,
  hashSecurityAnswer,
  verifySecurityAnswer,
  DUMMY_HASH,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MINUTES,
} from "@/lib/password";
import { createSession, destroySession, getSession } from "@/lib/session";

export interface ActionState {
  error?: string;
  success?: string;
}

async function findByRoll(rollNumber: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.rollNumber, rollNumber.trim().toUpperCase()))
    .limit(1);
  return rows[0] ?? null;
}

type Account = NonNullable<Awaited<ReturnType<typeof findByRoll>>>;

/** Minutes left on a lockout, or 0 if the account may try again. */
function lockedFor(user: Account): number {
  if (!user.lockedUntil) return 0;
  const ms = user.lockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

function lockedMessage(minutes: number): string {
  return `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask a staff member to reset your password.`;
}

/**
 * Counts a wrong password or security answer. On the last allowed try the
 * account pauses for a few minutes and the count starts again. Done in one
 * statement so simultaneous guesses cannot slip past the limit.
 */
async function recordFailure(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      failedAttempts: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then 0 else ${users.failedAttempts} + 1 end`,
      lockedUntil: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then now() + make_interval(mins => ${LOCKOUT_MINUTES}) else ${users.lockedUntil} end`,
    })
    .where(eq(users.id, userId));
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rollNumber = String(formData.get("rollNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!rollNumber || !password) {
    return { error: "Enter your roll number and password" };
  }

  const user = await findByRoll(rollNumber);
  // Same message and the same bcrypt cost either way, so neither the text nor
  // the response time reveals which roll numbers exist.
  if (!user || !user.isActive) {
    await verifyPassword(password, DUMMY_HASH);
    return { error: "Incorrect roll number or password" };
  }

  const wait = lockedFor(user);
  if (wait > 0) return { error: lockedMessage(wait) };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordFailure(user.id);
    return { error: "Incorrect roll number or password" };
  }

  if (user.failedAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }

  // A student may be signed in on one computer at a time: signing in here
  // ends the session anywhere else. Admins may use several at once.
  let sessionVersion = user.sessionVersion;
  if (user.role === "student") {
    const [bumped] = await db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, user.id))
      .returning({ sessionVersion: users.sessionVersion });
    sessionVersion = bumped.sessionVersion;
  }

  await createSession(user.id, sessionVersion);

  if (user.mustChangePassword) redirect("/first-login");
  redirect(user.role === "admin" ? "/admin" : "/student");
}

/**
 * First sign-in. The student sets their own password and a security question,
 * which is what makes an offline self-service reset possible later.
 */
export async function firstLoginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Your session expired. Please sign in again." };
  // This action sets a password without asking for the current one, so it is
  // only open to an account that has just signed in with a temporary password.
  if (!session.mustChangePassword) {
    return { error: "Your password has already been set." };
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const question = String(formData.get("securityQuestion") ?? "").trim();
  const answer = String(formData.get("securityAnswer") ?? "").trim();

  if (password !== confirm) return { error: "The two passwords do not match" };

  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  if (!question) return { error: "Choose a security question" };
  if (answer.length < 2) return { error: "Enter an answer to your security question" };

  // Raising the session version signs out anyone else who had the
  // temporary password; this browser gets a fresh session below.
  const [updated] = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      securityQuestion: question,
      securityAnswerHash: await hashSecurityAnswer(answer),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, session.userId))
    .returning({ sessionVersion: users.sessionVersion });

  await createSession(session.userId, updated.sessionVersion);
  redirect(session.role === "admin" ? "/admin" : "/student");
}

/** Step one of a reset: look up the student's chosen security question. */
export async function lookupSecurityQuestion(
  _prev: ActionState & { question?: string; rollNumber?: string },
  formData: FormData,
): Promise<ActionState & { question?: string; rollNumber?: string }> {
  const rollNumber = String(formData.get("rollNumber") ?? "").trim();
  if (!rollNumber) return { error: "Enter your roll number" };

  const user = await findByRoll(rollNumber);
  // One message for "no such roll number" and "no question set", so this
  // step cannot be used to find out which roll numbers exist.
  if (!user || !user.isActive || !user.securityQuestion) {
    return {
      error:
        "No security question is set up for that roll number. Ask a staff member to reset your password.",
    };
  }

  return { question: user.securityQuestion, rollNumber: user.rollNumber };
}

/** Step two: answer the question and set a new password. */
export async function resetWithSecurityAnswer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rollNumber = String(formData.get("rollNumber") ?? "").trim();
  const answer = String(formData.get("securityAnswer") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const user = await findByRoll(rollNumber);
  if (!user || !user.isActive || !user.securityAnswerHash) {
    return { error: "Could not verify that account" };
  }

  // Shares the sign-in counter, so the answer cannot be guessed at speed.
  const wait = lockedFor(user);
  if (wait > 0) return { error: lockedMessage(wait) };

  const ok = await verifySecurityAnswer(answer, user.securityAnswerHash);
  if (!ok) {
    await recordFailure(user.id);
    return { error: "That answer does not match our records" };
  }

  if (password !== confirm) return { error: "The two passwords do not match" };
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      // Signs out every session that existed before the reset.
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, user.id));

  return { success: "Password changed. You can sign in now." };
}

/** Fallback when the student cannot answer their own security question. */
export async function requestAdminReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rollNumber = String(formData.get("rollNumber") ?? "").trim();
  const user = await findByRoll(rollNumber);

  // Always report success, so this cannot be used to discover roll numbers.
  // One open request per student is enough, and stops the queue being flooded.
  if (user) {
    const [open] = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.userId, user.id),
          eq(passwordResetRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (!open) {
      await db.insert(passwordResetRequests).values({ userId: user.id });
    }
  }

  return {
    success:
      "Request sent. A staff member will reset your password and give you a new one.",
  };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
