import { bcryptHash, bcryptCompare } from "@/lib/bcrypt-pool";
import { randomInt } from "node:crypto";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcryptHash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcryptCompare(plain, hash);
}

/** Security answers are compared case-insensitively and whitespace-trimmed. */
export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function hashSecurityAnswer(answer: string): Promise<string> {
  return bcryptHash(normalizeSecurityAnswer(answer), ROUNDS);
}

export async function verifySecurityAnswer(
  answer: string,
  hash: string,
): Promise<boolean> {
  return bcryptCompare(normalizeSecurityAnswer(answer), hash);
}

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/**
 * Deliberately modest rules. Students set these on a lab keyboard under time
 * pressure, and a rule nobody can satisfy just generates support requests.
 */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters" };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { ok: false, message: "Password must contain at least one letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "Password must contain at least one number" };
  }
  return { ok: true };
}

// No 0/O, 1/I/L: these are read off a printed slip onto a lab keyboard.
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/**
 * A fresh random password for a new or reset account, such as "KPRT-4829".
 *
 * It used to be derived from the roll number, which meant anyone who knew a
 * classmate's roll number could sign in as them before they did. Now it is
 * shown once to the admin, printed, and changed on first sign-in.
 */
export function generateDefaultPassword(): string {
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}`;
}

/** Sign-in and reset attempts allowed before the account pauses. */
export const MAX_FAILED_ATTEMPTS = 8;
/** How long the pause lasts. Short, so a prank lockout costs minutes. */
export const LOCKOUT_MINUTES = 5;

/**
 * Compared against when the roll number does not exist, so a wrong roll
 * number takes as long to reject as a wrong password and the timing does not
 * reveal which roll numbers are real.
 */
export const DUMMY_HASH =
  "$2a$10$KeVv4AmdmWH.oebAoOPWn.fzBjOxDlzlcIZkX7mxcVnldx747w1Ha";
