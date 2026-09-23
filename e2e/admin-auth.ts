import { type Page } from "@playwright/test";

/**
 * Signing in as the seeded admin, shared by every spec file.
 *
 * The account is seeded owing a first-login password change, and whichever
 * spec file Playwright happens to run first is the one that clears it. Rather
 * than making the files depend on that order, this helper copes with both
 * states: it completes the change if it is offered, and otherwise signs in
 * with the password the change set.
 */

export const SEED_PASSWORD = "admin";
export const ADMIN_PASSWORD = "AdminE2E@2026";
export const SECURITY_ANSWER = "bluejay";

export async function completeFirstLogin(page: Page, newPassword: string) {
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByLabel("Security question").selectOption({ index: 0 });
  await page.getByLabel("Your answer").fill(SECURITY_ANSWER);
  await page.getByRole("button", { name: "Save and continue" }).click();
}

export async function signInAsAdmin(page: Page) {
  for (const password of [ADMIN_PASSWORD, SEED_PASSWORD]) {
    await page.goto("/login");
    await page.getByLabel("Roll number").fill("ADMIN");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    const landed = await Promise.race([
      page.waitForURL("**/admin", { timeout: 8_000 }).then(() => "admin"),
      page
        .waitForURL("**/first-login", { timeout: 8_000 })
        .then(() => "first-login"),
      page
        .getByText(/Incorrect roll number or password/i)
        .waitFor({ timeout: 8_000 })
        .then(() => "rejected"),
    ]).catch(() => "timeout");

    if (landed === "admin") return;

    if (landed === "first-login") {
      await completeFirstLogin(page, ADMIN_PASSWORD);
      await page.waitForURL("**/admin");
      return;
    }
  }

  throw new Error("Could not sign in as ADMIN with either known password");
}
