import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const COOKIE = "ptp_session";
const MAX_AGE = 60 * 60 * 12; // twelve hours, comfortably longer than any test

export interface SessionPayload {
  userId: string;
  role: "admin" | "student";
  rollNumber: string;
  name: string;
  mustChangePassword: boolean;
}

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in .env before starting the server.",
    );
  }
  return new TextEncoder().encode(value);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    // Plain HTTP on the LAN by default. Set SECURE_COOKIES=true once the app
    // is served over HTTPS, which the camera-proctored exam requires.
    secure: process.env.SECURE_COOKIES === "true",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  let payload: SessionPayload;
  try {
    const verified = await jwtVerify(token, secret());
    payload = verified.payload as unknown as SessionPayload;
  } catch {
    return null;
  }

  // The token is signed and unexpired, but the account behind it may have
  // been deleted or deactivated since - by staff removing a student, or by
  // reseeding the database, which issues fresh ids. Trusting the id alone
  // lets such a session go on to write rows that point at a user who no
  // longer exists, which fails as a foreign key error deep in an action
  // rather than as a clean trip back to the sign-in screen.
  try {
    const [account] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!account || !account.isActive) return null;
  } catch {
    // The database is unreachable. Everything else on the page is about to
    // fail anyway; do not sign the whole lab out over a blip.
    return payload;
  }

  return payload;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireStudent(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "student") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
