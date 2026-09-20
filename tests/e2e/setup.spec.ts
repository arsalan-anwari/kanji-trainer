import { expect, test, type Page } from "@playwright/test";

// Wide layouts put the preset actions beside the select; a phone hides them in
// the sheet the select opens.
async function presetAction(page: Page, label: string): Promise<void> {
  const action = page.getByRole("button", { name: label });
  if (!(await action.isVisible())) {
    await page.getByRole("button", { name: "Saved runs" }).click();
  }
  await action.click();
}

test("cannot start a run before a set is picked", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start" });
  await expect(start).toBeDisabled();
  await expect(page.getByText("Pick at least one set to start.")).toBeVisible();

  await page.getByRole("button", { name: /^Nature/ }).click();
  await expect(start).toBeEnabled();
});

test("remembers the run it was set up with across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Verbs/ }).click();
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  const counts = page.getByRole("group", { name: "Number of questions" });
  await counts.getByRole("button", { name: "50", exact: true }).click();

  await page.reload();

  await expect(page.getByRole("button", { name: /^Verbs/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Kana to kanji" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(counts.getByRole("button", { name: "50", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("offers no set that has no words at this level", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Numbers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Body/ })).toHaveCount(0);
});

test("switches to a single pass over the words in play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "One pass", exact: true }).click();

  // The nature set is six words, so a single pass is six questions.
  await expect(page.getByText("Questions").locator("..")).toContainText("6");
});

test("shows the levels this build has no content for as switched off", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "N5", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "N4", exact: true })).toBeDisabled();
});

test("ships a Japanese face for machines that have none", async ({ page }) => {
  await page.goto("/");
  const families = await page.evaluate(() =>
    [...document.fonts].map((face) => face.family)
  );
  expect(families).toContain("Kaizen JP");
});

test("holds back hand-picked words, and keeps them held across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();

  const inPlay = page.getByText("Words in play").locator("..");
  const before = Number(((await inPlay.textContent()) ?? "").replace(/\D+/g, ""));
  expect(before).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Select words" }).click();

  const groups = page.getByRole("group", { name: /^Words written with/ });
  const words = groups.getByRole("button");
  await expect(words.first()).toHaveAttribute("aria-pressed", "true");

  await words.nth(0).click();
  await words.nth(1).click();
  await expect(groups.locator("button[aria-pressed='false']")).toHaveCount(2);

  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(inPlay).toContainText(String(before - 2));

  await page.reload();
  await expect(inPlay).toContainText(String(before - 2));

  await page.getByRole("button", { name: "Select words" }).click();
  await expect(groups.locator("button[aria-pressed='false']")).toHaveCount(2);
});

test("keeps the loaded preset selected through the word picker, so it can be updated", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();

  await presetAction(page, "Save this run");
  await page.getByPlaceholder("Name this run").fill("nature run");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const picker = page.getByRole("button", { name: "Saved runs" });
  await expect(picker).toContainText("nature run");

  await page.getByRole("button", { name: "Select words" }).click();
  const groups = page.getByRole("group", { name: /^Words written with/ });
  await groups.getByRole("button").first().click();
  await page.getByRole("button", { name: "Back to setup" }).click();

  await expect(picker).toContainText("nature run");
  await presetAction(page, "Update");
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("keeps the loaded preset selected while the run is edited", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await presetAction(page, "Save this run");
  await page.getByPlaceholder("Name this run").fill("editable");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const picker = page.getByRole("button", { name: "Saved runs" });
  await expect(picker).toContainText("editable");

  await page.getByRole("group", { name: "Word shapes" }).getByRole("button").first().click();
  await expect(picker).toContainText("editable");

  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await expect(picker).toContainText("editable");

  await page.reload();
  await expect(picker).toContainText("editable");
});
