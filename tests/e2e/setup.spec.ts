import { expect, test } from "@playwright/test";

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
