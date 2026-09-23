import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, attempts } from "@/db/schema";

const COOKIE = "ptp_session";
/** The cookie's hard ceiling, for everyone. */
const MAX_AGE = 60 * 60 * 12;
/**
 * A student is signed out three hours after signing in, so a lab PC left
 * signed in does not stay usable by the next person. The one exception is a
 * test they have already begun: that is never cut off mid-way.
 */
const STUDENT_SESSION_MS = 3 * 60 * 60 * 1000;

/** The placeholder shipped in .env.example. A server using it can be forged. */
const EXAMPLE_SECRET = "change-this-to-a-long-random-string-before-deploying";

export interface SessionPayload {
  userId: string;
  role: "admin" | "student";
  rollNumber: string;
  name: string;
  mustChangePassword: boolean;
}

/** What the cookie actually carries. Everything else is read fresh. */
interface TokenClaims {
  userId: string;
  sv: number;
}

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length < 32 || value === EXAMPLE_SECRET) {
    throw new Error(
      "SESSION_SECRET is missing, too short (32+ characters) or still the example value. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new TextEncoder().encode(value);
}

/**
 * Signs the user in on this browser. The token holds only the user id and
 * their session version; role, name and the must-change-password flag are
 * read from the database on every request, so a token can never claim more
 * than the account has.
 */
export async function createSession(
  userId: string,
  sessionVersion: number,
): Promise<void> {
  const claims: TokenClaims = { userId, sv: sessionVersion };
  const token = await new SignJWT({ ...claims })
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

/**
 * The signed-in user, or null. Cached per request, so the layout, the page
 * and the actions they call share one database lookup.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  let claims: TokenClaims & { iat?: number };
  try {
    const verified = await jwtVerify(token, secret());
    claims = verified.payload as unknown as TokenClaims & { iat?: number };
  } catch {
    return null;
  }
  if (typeof claims.userId !== "string" || typeof claims.sv !== "number") {
    return null;
  }

  // A deleted or deactivated account, or one whose sessions were ended by a
  // logout or a password change, is signed out here. If the database cannot
  // be reached nothing else would work either, so fail closed.
  try {
    const [account] = await db
      .select({
        role: users.role,
        rollNumber: users.rollNumber,
        name: users.name,
        mustChangePassword: users.mustChangePassword,
        isActive: users.isActive,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);

    if (!account || !account.isActive) return null;
    // A newer sign-in, a logout or a password change ends this session.
    if (account.sessionVersion !== claims.sv) return null;

    const issuedAt = (claims.iat ?? 0) * 1000;
    if (
      account.role === "student" &&
      Date.now() - issuedAt > STUDENT_SESSION_MS &&
      !(await hasTestUnderway(claims.userId))
    ) {
      return null;
    }

    return {
      userId: claims.userId,
      role: account.role,
      rollNumber: account.rollNumber,
      name: account.name,
      mustChangePassword: account.mustChangePassword,
    };
  } catch {
    return null;
  }
});

/** A test the student has begun and not yet finished. */
async function hasTestUnderway(userId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, "in_progress"),
        isNotNull(attempts.begunAt),
      ),
    )
    .limit(1);
  return Boolean(open);
}

/** Signs this browser out and ends every other session for the account. */
export async function destroySession(): Promise<void> {
  const session = await getSession();
  if (session) await endAllSessions(session.userId);
  const store = await cookies();
  store.delete(COOKIE);
}

/** Invalidates every token issued to this user so far. */
export async function endAllSessions(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId));
}

/**
 * For server actions. Throws rather than redirects, because a direct call to
 * an action has no page to redirect. An account still owing its first
 * password change may do nothing but make that change.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin" || session.mustChangePassword) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireStudent(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "student" || session.mustChangePassword) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * For admin pages. A layout's check does not stop its pages rendering, so
 * every admin page calls this itself before touching any data.
 */
export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/first-login");
  if (session.role !== "admin") redirect("/student");
  return session;
}
