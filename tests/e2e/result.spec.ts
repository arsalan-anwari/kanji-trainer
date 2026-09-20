import { expect, test, type Page } from "@playwright/test";

async function runThrough(page: Page, questions: number): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();

  for (let question = 1; question <= questions; question += 1) {
    await page.getByRole("group", { name: "Answers" }).getByRole("button").first().click();
    await page
      .getByRole("button", { name: question === questions ? "See the score" : "Continue" })
      .click();
  }
}

test("scores the run and keeps it after the app is closed", async ({ page }) => {
  await runThrough(page, 10);

  await expect(page.getByText("Run finished")).toBeVisible();
  await expect(page.getByText("Accuracy")).toBeVisible();
  await expect(page.getByText("Words to look at again")).toBeVisible();

  await page.getByRole("button", { name: "See past runs" }).click();
  await expect(page.getByText(/of 10 right/)).toHaveCount(1);

  await page.reload();
  await page.getByRole("tab", { name: "Report" }).click();
  await expect(page.getByText(/of 10 right/)).toHaveCount(1);
});

test("keeps past runs off the practice screen", async ({ page }) => {
  await runThrough(page, 10);
  await page.getByRole("button", { name: "Set up another run" }).click();

  await expect(page.getByText(/of 10 right/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});

test("says so when nothing has been run yet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Report" }).click();
  await expect(page.getByText("No run has been finished yet.")).toBeVisible();
});

test("narrows past runs with the filters", async ({ page }) => {
  await runThrough(page, 10);
  await page.getByRole("button", { name: "See past runs" }).click();

  await page.getByText("Filters").click();
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await expect(page.getByText(/of 10 right/)).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText(/of 10 right/)).toHaveCount(1);
});
