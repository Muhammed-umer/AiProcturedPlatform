/**
 * The two demo accounts `npm run db:seed` creates. Roll numbers are compared
 * in upper case, so "admin" and "user" work at the sign-in form.
 *
 * These are for a demo on the department LAN, not a credential store. The
 * passwords are far below the rule enforced on real students (8+ characters
 * with a letter and a digit), which is why the seed sets them directly and
 * never sends these accounts through the first-sign-in change.
 */

export const SEED_ADMIN = {
  rollNumber: "ADMIN",
  password: "admin",
  name: "Department Admin",
} as const;

export const SEED_STUDENT = {
  rollNumber: "USER",
  password: "user",
  name: "Demo Student",
  email: null,
} as const;
