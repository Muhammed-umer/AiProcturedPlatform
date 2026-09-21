"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResetRequests } from "@/db/schema";
import {
  verifyPassword,
  hashPassword,
  checkPasswordStrength,
  hashSecurityAnswer,
  verifySecurityAnswer,
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
  // Same message either way, so the form never reveals which roll numbers exist.
  if (!user || !user.isActive) {
    return { error: "Incorrect roll number or password" };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Incorrect roll number or password" };

  await createSession({
    userId: user.id,
    role: user.role,
    rollNumber: user.rollNumber,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
  });

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

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const question = String(formData.get("securityQuestion") ?? "").trim();
  const answer = String(formData.get("securityAnswer") ?? "").trim();

  if (password !== confirm) return { error: "The two passwords do not match" };

  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  if (!question) return { error: "Choose a security question" };
  if (answer.length < 2) return { error: "Enter an answer to your security question" };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      securityQuestion: question,
      securityAnswerHash: await hashSecurityAnswer(answer),
    })
    .where(eq(users.id, session.userId));

  await createSession({ ...session, mustChangePassword: false });
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
  if (!user || !user.isActive) {
    return { error: "No active account found for that roll number" };
  }
  if (!user.securityQuestion) {
    return {
      error:
        "You have not set a security question yet. Ask a staff member to reset your password.",
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
  if (!user || !user.securityAnswerHash) {
    return { error: "Could not verify that account" };
  }

  const ok = await verifySecurityAnswer(answer, user.securityAnswerHash);
  if (!ok) return { error: "That answer does not match our records" };

  if (password !== confirm) return { error: "The two passwords do not match" };
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: false })
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
  if (user) {
    await db.insert(passwordResetRequests).values({ userId: user.id });
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
