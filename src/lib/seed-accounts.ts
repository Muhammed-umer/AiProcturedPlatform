/**
 * The demo accounts `npm run db:seed` creates. Shared so the seed script and
 * the development-only hint on the sign-in screen can never drift apart.
 *
 * Both accounts use the same password deliberately: this is demo data for a
 * machine on the department LAN, not a credential store.
 */

export const SEED_PASSWORD = "Admin@123";

export const SEED_ADMIN = {
  rollNumber: "ADMIN",
  name: "Department Admin",
} as const;

export const SEED_STUDENT = {
  rollNumber: "21CS001",
  name: "Aarav Sharma",
  email: "aarav@example.edu",
} as const;
