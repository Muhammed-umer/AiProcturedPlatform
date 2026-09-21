import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Security answers are compared case-insensitively and whitespace-trimmed. */
export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function hashSecurityAnswer(answer: string): Promise<string> {
  return bcrypt.hash(normalizeSecurityAnswer(answer), ROUNDS);
}

export async function verifySecurityAnswer(
  answer: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(normalizeSecurityAnswer(answer), hash);
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

/**
 * Readable default password for a freshly imported student.
 *
 * The tail is padded so a very short roll number still clears the minimum
 * length above. Without this, a roll number like "A1" produces a password the
 * student is immediately told is too weak to reuse.
 */
export function generateDefaultPassword(rollNumber: string): string {
  const cleaned = rollNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const tail = cleaned.slice(-4);
  const padded = tail === "" ? "1234" : tail.padStart(4, "0");
  return `Test@${padded}`;
}
