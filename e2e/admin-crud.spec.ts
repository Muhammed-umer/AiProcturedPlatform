import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./admin-auth";

/**
 * Creating, editing and deleting groups and tests through the admin panel.
 *
 * This is the half of the platform the drive in placement.spec.ts does not
 * touch: that one walks a single test from creation to results, while this one
 * exercises the edit and delete paths around it, where a mistake is quiet
 * (a stale list, a dead page, a cascade that takes too much with it).
 *
 * Everything here is named with a CRUD prefix so it cannot collide with the
 * drive, and each test cleans up after the group it owns.
 */

const GROUP_A = "CRUD Batch A";
const GROUP_B = "CRUD Batch B";
const TEST_TITLE = "CRUD Paper";

let testId = "";

/** The row for one group in the groups table. */
function groupRow(page: Page, name: string) {
  return page.locator("tr").filter({ hasText: name });
}

test.describe.serial("admin manages groups and tests", () => {
  /* --------------------------------------------------------------- groups */

  test("creates groups", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/groups");

    await page.getByLabel("Group name").fill(GROUP_A);
    await page.getByLabel(/Description/).fill("Created by the CRUD suite");
    await page.getByRole("button", { name: "Create group" }).click();

    const rowA = groupRow(page, GROUP_A);
    await expect(rowA).toBeVisible();
    await expect(rowA).toContainText("Created by the CRUD suite");
    // A brand new group has nobody in it and no test pointed at it.
    await expect(rowA.locator("td").nth(1)).toHaveText("0");

    await page.getByLabel("Group name").fill(GROUP_B);
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(groupRow(page, GROUP_B)).toBeVisible();
  });

  test("refuses a duplicate group name", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/groups");

    await page.getByLabel("Group name").fill(GROUP_A);
    await page.getByRole("button", { name: "Create group" }).click();

    // Matched on the message itself: Next's route announcer is also role=alert.
    await expect(page.getByText(/already exists/i)).toBeVisible();
    // Still exactly one row carrying that name.
    await expect(groupRow(page, GROUP_A)).toHaveCount(1);
  });

  /* ---------------------------------------------------------------- tests */

  test("creates a test that cannot be published while it is empty", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/tests/new");

    await page.getByLabel("Test title").fill(TEST_TITLE);
    await page.getByLabel("Duration in minutes").fill("20");
    await page.getByLabel("Warnings before auto-submit").fill("2");
    // On by default; created without it to prove the choice is kept.
    const camera = page.getByRole("checkbox", { name: /Camera proctoring/ });
    await expect(camera).toBeChecked();
    await camera.uncheck();
    await page
      .getByRole("button", { name: "Create and add questions" })
      .click();

    await page.waitForURL(/\/admin\/tests\/[0-9a-f-]{36}$/);
    testId = page.url().split("/").pop()!;

    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible();
    // Every new test starts with one section so the question form is usable.
    await expect(page.getByText("Section A")).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Camera proctoring/ }),
    ).not.toBeChecked();

    // With no questions and no group, publishing must be refused and the
    // reason spelled out rather than the button silently doing nothing.
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await expect(
      page.getByText("Add at least one question before publishing."),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------- sections */

  test("adds, edits and deletes a section", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    // One section row in the list, by name.
    const sectionRow = (name: string) =>
      page
        .locator("div.rounded-lg.border.border-line")
        .filter({ hasText: name })
        .first();

    // The inline edit form, which is the only form carrying both a section id
    // and a name field. Scoping to it keeps "Save" away from the other two
    // Save buttons on this page.
    const editForm = page.locator(
      'form:has(input[name="sectionId"]):has(input[name="name"])',
    );

    // Add.
    await page.getByRole("button", { name: "Add section" }).first().click();
    await page.getByPlaceholder("Section B").fill("Reasoning");
    await page.getByPlaceholder("Quantitative").fill("Logical");
    await page.getByRole("button", { name: "Add section" }).last().click();

    await expect(sectionRow("Reasoning")).toBeVisible();
    await expect(sectionRow("Reasoning")).toContainText("Logical");

    // Edit: rename it and change the marks each question carries.
    await sectionRow("Reasoning").getByRole("button", { name: "Edit" }).click();
    await editForm.locator('input[name="name"]').fill("Reasoning II");
    await editForm.locator('input[name="defaultMarks"]').fill("3");
    await editForm.getByRole("button", { name: "Save" }).click();

    await expect(sectionRow("Reasoning II")).toBeVisible();
    await expect(sectionRow("Reasoning II")).toContainText("3 marks each");

    // The change survives a reload, so it really reached the database.
    await page.reload();
    await expect(sectionRow("Reasoning II")).toBeVisible();

    // Delete.
    await sectionRow("Reasoning II")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText("Reasoning II")).toHaveCount(0);
    // The last remaining section stays: a test always needs at least one.
    await expect(sectionRow("Section A")).toBeVisible();
  });

  /* ------------------------------------------------------------ questions */

  test("adds and deletes questions", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    // The form is closed until asked for.
    await expect(page.locator("#body")).toHaveCount(0);
    await page.getByRole("button", { name: "Add a question" }).click();

    await page.locator("#body").fill("Which planet is the largest?");
    await page.locator('input[name="option_0"]').fill("Earth");
    await page.locator('input[name="option_1"]').fill("Jupiter");
    await page.locator('input[name="option_2"]').fill("Mars");
    await page.locator('input[name="option_3"]').fill("Venus");
    await page.getByRole("radio", { name: "Option B is correct" }).check();
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("Which planet is the largest?")).toBeVisible();

    // A second one, so deleting the first leaves something behind.
    await page.locator("#body").fill("Water freezes at ______ degrees Celsius");
    await page.getByRole("button", { name: "Fill in the blank" }).click();
    await page.locator("#body").fill("Water freezes at ______ degrees Celsius");
    await page.locator("#acceptedAnswers").fill("0 | zero");
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(
      page.getByText("Water freezes at ______ degrees Celsius"),
    ).toBeVisible();

    // Delete the first, and only the first.
    await page
      .locator("li")
      .filter({ hasText: "Which planet is the largest?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText("Which planet is the largest?")).toHaveCount(0);
    await expect(
      page.getByText("Water freezes at ______ degrees Celsius"),
    ).toBeVisible();
  });

  /* ------------------------------------------------- group assignment ---- */

  test("assigns groups to the test and takes one away again", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    await page.getByRole("checkbox", { name: GROUP_A }).check();
    await page.getByRole("checkbox", { name: GROUP_B }).check();
    await page.getByRole("button", { name: "Save groups" }).click();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: GROUP_A })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: GROUP_B })).toBeChecked();

    // Editing an assignment must also be able to remove one.
    await page.getByRole("checkbox", { name: GROUP_B }).uncheck();
    await page.getByRole("button", { name: "Save groups" }).click();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: GROUP_A })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: GROUP_B }),
    ).not.toBeChecked();
  });

  /* --------------------------------------------------------- visibility -- */

  test("edits what students may see after submitting", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    const showAnswers = page.getByRole("checkbox", {
      name: /Show which answers were right/,
    });
    await expect(showAnswers).toBeChecked();

    await showAnswers.uncheck();
    await page
      .locator("form")
      .filter({ has: showAnswers })
      .getByRole("button", { name: "Save" })
      .click();

    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: /Show which answers were right/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Show their score/ }),
    ).toBeChecked();
  });

  test("edits attempts, shuffling and the camera", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    const attemptsField = page.getByLabel("Attempts allowed per student");
    const shuffleQ = page.getByRole("checkbox", {
      name: /Shuffle questions for each student/,
    });
    const shuffleO = page.getByRole("checkbox", {
      name: /Shuffle options for each student/,
    });
    const camera = page.getByRole("checkbox", { name: /Camera proctoring/ });

    // The defaults, with the camera left off at creation.
    await expect(attemptsField).toHaveValue("1");
    await expect(shuffleQ).toBeChecked();
    await expect(shuffleO).toBeChecked();
    await expect(camera).not.toBeChecked();

    await attemptsField.fill("3");
    await shuffleQ.uncheck();
    await shuffleO.uncheck();
    await camera.check();
    const form = page.locator("form").filter({ has: camera });
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Attempts allowed per student")).toHaveValue(
      "3",
    );
    await expect(
      page.getByRole("checkbox", { name: /Shuffle questions/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Shuffle options/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Camera proctoring/ }),
    ).toBeChecked();
  });

  /* ------------------------------------------------------------- status -- */

  test("publishes the test and closes it again", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    // It now has a question and a group, so publishing is allowed.
    const publish = page.getByRole("button", { name: "Publish" });
    await expect(publish).toBeEnabled();
    await publish.click();

    await expect(page.getByText("published").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Monitor live" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close test" }).click();
    await expect(page.getByText("closed").first()).toBeVisible();
  });

  /* ------------------------------------------------- deleting a group ---- */

  test("deleting an assigned group leaves the test standing", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/groups");

    // The group knows it is in use before it goes.
    await expect(groupRow(page, GROUP_A)).toContainText("1 assigned");
    await groupRow(page, GROUP_A)
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(groupRow(page, GROUP_A)).toHaveCount(0);

    // The test survives; only the assignment went with the group.
    await page.goto(`/admin/tests/${testId}`);
    await expect(page.getByRole("heading", { name: TEST_TITLE })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: GROUP_A })).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: GROUP_B }),
    ).not.toBeChecked();
  });

  /* ------------------------------------------------------------ cleanup -- */

  test("deletes the test and the remaining group", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/tests/${testId}`);

    // The test's own Delete, not the one on the question still in the list.
    await page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Delete" }) })
      .filter({ hasNot: page.locator('input[name="questionId"]') })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.waitForURL(/\/admin\/tests$/);
    await expect(page.getByText(TEST_TITLE)).toHaveCount(0);

    await page.goto("/admin/groups");
    await groupRow(page, GROUP_B)
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(groupRow(page, GROUP_B)).toHaveCount(0);
  });
});
