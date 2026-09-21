import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin, ADMIN_PASSWORD } from "./admin-auth";
import ExcelJS from "exceljs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end walk through the whole platform, admin first, then a student.
 * Runs against a freshly seeded database (roll ADMIN / Admin@123, all accounts
 * on their default password). The tests are serial and pass state between them
 * through the module variables below, mirroring one real placement drive.
 */

// The admin changes their own password on first login, which may already have
// happened in another spec file; signInAsAdmin copes with either state.
let adminPassword = ADMIN_PASSWORD;

// Captured from the student import screen, then used to sit the exam.
let studentRoll = "";
let studentPassword = "";

// Captured when the test is created, then used for results and monitoring.
let testId = "";

const GROUP = "E2E Batch";
const TEST_TITLE = "E2E Round 1";

async function signIn(page: Page, roll: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Roll number").fill(roll);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function completeFirstLogin(page: Page, newPassword: string) {
  await page.waitForURL("**/first-login");
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByLabel("Security question").selectOption({ index: 0 });
  await page.getByLabel("Your answer").fill("bluejay");
  await page.getByRole("button", { name: "Save and continue" }).click();
}

test.describe.serial("placement platform", () => {
  test("admin signs in and sets up their account", async ({ page }) => {
    await signInAsAdmin(page);
    adminPassword = ADMIN_PASSWORD;

    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("admin imports students into a new group", async ({ page }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin");

    // Build a real student spreadsheet on disk and upload it.
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Students");
    sheet.addRow(["Roll Number", "Name", "Email"]);
    sheet.addRow(["E2E201", "Meera Nair", "meera@example.edu"]);
    sheet.addRow(["E2E202", "Karthik Rao", "karthik@example.edu"]);
    const filePath = join(tmpdir(), "e2e-students.xlsx");
    await wb.xlsx.writeFile(filePath);

    await page.getByRole("link", { name: "Students" }).click();
    await page.waitForURL("**/admin/students");

    await page.getByRole("button", { name: "A new group" }).click();
    await page
      .getByPlaceholder("Name for the new group")
      .fill(GROUP);
    await page.locator('input[type="file"]').setInputFiles(filePath);
    await page.getByRole("button", { name: "Import students" }).click();

    // Success and the one-time credentials table both appear.
    await expect(page.getByText(/new account/i)).toBeVisible();
    const credRow = page
      .locator("tr")
      .filter({ hasText: "E2E201" })
      .first();
    await expect(credRow).toBeVisible();

    // Read the issued password straight from the screen, as staff would.
    const cells = credRow.locator("td");
    studentRoll = (await cells.nth(0).innerText()).trim();
    studentPassword = (await cells.nth(2).innerText()).trim();
    expect(studentRoll).toBe("E2E201");
    expect(studentPassword.length).toBeGreaterThan(4);
  });

  test("admin builds a test with all three question types", async ({
    page,
  }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin");

    await page.getByRole("link", { name: "Tests" }).click();
    await page.getByRole("link", { name: "Create test" }).first().click();
    await page.waitForURL("**/admin/tests/new");

    await page.getByLabel("Test title").fill(TEST_TITLE);
    await page.getByLabel("Duration in minutes").fill("30");
    await page
      .getByRole("button", { name: "Create and add questions" })
      .click();

    await page.waitForURL(/\/admin\/tests\/[0-9a-f-]{36}$/);
    testId = page.url().split("/").pop()!;
    expect(testId).toMatch(/[0-9a-f-]{36}/);

    // The saved questions appear in the list below the form. Waiting for each
    // to show there confirms the add actually completed before the next one,
    // rather than trusting the success banner, which lingers from a prior add.

    // The form starts closed; open it once, then add all three questions.
    await page.getByRole("button", { name: "Add a question" }).click();

    // One-answer question.
    await page.getByRole("button", { name: "One answer" }).click();
    await page.locator("#body").fill("What is 2 + 2?");
    await page.locator('input[name="option_0"]').fill("3");
    await page.locator('input[name="option_1"]').fill("4");
    await page.locator('input[name="option_2"]').fill("5");
    await page.locator('input[name="option_3"]').fill("6");
    await page.getByRole("radio", { name: "Option B is correct" }).check();
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("What is 2 + 2?")).toBeVisible();

    // Several-answers question.
    await page.getByRole("button", { name: "Several answers" }).click();
    await page.locator("#body").fill("Select the even numbers.");
    await page.locator('input[name="option_0"]').fill("2");
    await page.locator('input[name="option_1"]').fill("3");
    await page.locator('input[name="option_2"]').fill("4");
    await page.locator('input[name="option_3"]').fill("5");
    await page.getByRole("checkbox", { name: "Option A is correct" }).check();
    await page.getByRole("checkbox", { name: "Option C is correct" }).check();
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("Select the even numbers.")).toBeVisible();

    // Fill-in-the-blank question.
    await page.getByRole("button", { name: "Fill in the blank" }).click();
    await page.locator("#body").fill("The capital of France is ______");
    await page.locator("#acceptedAnswers").fill("Paris");
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(
      page.getByText("The capital of France is ______"),
    ).toBeVisible();

    // Assign to the imported group.
    await page.getByRole("checkbox", { name: GROUP }).check();
    await page.getByRole("button", { name: "Save groups" }).click();

    // Fresh server state, then publish.
    await page.reload();
    const publish = page.getByRole("button", { name: "Publish" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText("published").first()).toBeVisible();
  });

  test("student takes the test under lockdown and submits", async ({
    page,
  }) => {
    await signIn(page, studentRoll, studentPassword);
    await completeFirstLogin(page, "StudentE2E@2026");

    await page.waitForURL("**/student");
    await expect(page.getByText(TEST_TITLE)).toBeVisible();
    await page.getByRole("link", { name: "Start test" }).click();

    // The instructions screen: check the camera, agree, then continue. The
    // config supplies a fake webcam and turns the face check off, since that
    // camera shows no face.
    await expect(
      page.getByRole("heading", { name: "Before you begin" }),
    ).toBeVisible();

    const carryOn = page.getByRole("button", { name: /Continue to the test|Agree to the instructions|Turn on your camera first|Waiting for your face/ });
    // Nothing may start until both checklist items are done.
    await expect(carryOn).toBeDisabled();

    await page.getByRole("button", { name: "Turn on camera" }).click();
    await page
      .getByRole("checkbox", { name: /I have read and agree/ })
      .check();

    const go = page.getByRole("button", { name: "Continue to the test" });
    await expect(go).toBeEnabled({ timeout: 15_000 });
    await go.click();

    // The question interface appears once the camera and fullscreen are
    // granted, and the camera self-view confirms the stream is running.
    await expect(page.getByRole("timer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Camera on")).toBeVisible();

    // Visit every question via the palette and answer it by content, which is
    // robust to the per-student shuffling of question and option order.
    const paletteCount = await page
      .getByRole("button", { name: /^Question \d/ })
      .count();
    expect(paletteCount).toBe(3);

    for (let i = 1; i <= paletteCount; i++) {
      await page
        .getByRole("button", { name: new RegExp(`^Question ${i}\\b`) })
        .click();
      const card = page.locator(".card").first();
      const heading = await card.getByRole("heading").first().innerText();
      const fill = card.getByPlaceholder("Type your answer");

      if (await fill.count()) {
        await fill.fill("Paris");
      } else if (/even/i.test(heading)) {
        await card.getByText("2", { exact: true }).click();
        await card.getByText("4", { exact: true }).click();
      } else {
        await card.getByText("4", { exact: true }).click();
      }
      await page.waitForTimeout(300);
    }

    // Let the debounced fill-in-the-blank answer save before submitting.
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Submit" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();

    await page.waitForURL("**/student/result/**");
    // Every answer was correct: 3 questions at 1 mark each.
    await expect(page.getByText("3 / 3")).toBeVisible();

    // The student can review the paper question by question.
    await expect(
      page.getByRole("heading", { name: "Your answers" }),
    ).toBeVisible();
    await expect(
      page.getByText("3 of 3 correct. You attempted 3 and left 0 unanswered."),
    ).toBeVisible();

    // Buckets: everything correct here, so the other two filters have nothing
    // to show and are offered as disabled rather than as empty lists.
    const filters = page.getByRole("group", { name: "Filter questions" });
    await expect(filters.getByRole("button", { name: /^Wrong/ })).toBeDisabled();
    await expect(
      filters.getByRole("button", { name: /^Not answered/ }),
    ).toBeDisabled();
    await filters.getByRole("button", { name: /^Correct/ }).click();
    // Scoped to the verdict chips: "Correct" is also a column heading in the
    // section breakdown above.
    await expect(
      page.locator(".chip").filter({ hasText: /^Correct$/ }),
    ).toHaveCount(3);
    // Their own choice is marked, against the question they actually answered.
    await expect(page.getByText("What is 2 + 2?")).toBeVisible();
    await expect(
      page.getByText("your answer").first(),
    ).toBeVisible();
  });

  test("admin sees the result in the rank list", async ({ page }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin"); // let the login cookie settle first
    await page.goto(`/admin/results/${testId}`);

    await expect(
      page.getByRole("heading", { name: TEST_TITLE }),
    ).toBeVisible();
    // The student who submitted appears, ranked first with a full score.
    await expect(page.getByText("Top performer")).toBeVisible();
    await expect(page.getByRole("cell", { name: studentRoll })).toBeVisible();
    await expect(page.getByText("100%").first()).toBeVisible();
  });

  test("admin can open the live monitor", async ({ page }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin"); // let the login cookie settle first
    await page.goto(`/admin/monitor/${testId}`);
    await expect(page.getByText(/Monitoring/)).toBeVisible();
    // The submitted attempt shows in the status column of the attempts table.
    await expect(
      page.getByRole("table").getByText("Submitted"),
    ).toBeVisible();

    // The webcam thumbnail the student's browser uploaded is served to the
    // admin as a real JPEG.
    const thumb = page.getByRole("table").locator("img").first();
    await expect(thumb).toBeVisible();
    const src = await thumb.getAttribute("src");
    expect(src).toMatch(/^\/api\/proctor\/[0-9a-f-]{36}\/latest/);
    const image = await page.request.get(src!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
    expect((await image.body()).byteLength).toBeGreaterThan(500);
  });

  test("deleting a test returns to the list instead of a dead page", async ({
    page,
  }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin");

    // A throwaway test, so the drive above stays intact.
    await page.goto("/admin/tests/new");
    await page.getByLabel("Test title").fill("E2E Delete Me");
    await page.getByLabel("Duration in minutes").fill("10");
    await page
      .getByRole("button", { name: "Create and add questions" })
      .click();
    await page.waitForURL(/\/admin\/tests\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Delete" }).click();

    // The browser must end up on the list, with the test gone from it.
    await page.waitForURL(/\/admin\/tests$/);
    await expect(
      page.getByRole("heading", { name: "Tests" }),
    ).toBeVisible();
    await expect(page.getByText("E2E Delete Me")).toHaveCount(0);
  });

  test("camera review page lists the attempt", async ({ page }) => {
    await signIn(page, "ADMIN", adminPassword);
    await page.waitForURL("**/admin");
    await page.goto(`/admin/monitor/${testId}`);

    // The Camera column links each row to its review page.
    await page
      .getByRole("table")
      .locator('a[href*="/proctor/"]')
      .first()
      .click();
    await page.waitForURL(/\/admin\/monitor\/[0-9a-f-]{36}\/proctor\/[0-9a-f-]{36}$/);

    await expect(
      page.getByRole("heading", { name: /^Camera: / }),
    ).toBeVisible();
    await expect(page.getByText("Last frame")).toBeVisible();
  });
});
