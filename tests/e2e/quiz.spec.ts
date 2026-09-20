import { expect, test, type Page } from "@playwright/test";

async function tabTo(page: Page, selector: string): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    if (await page.locator(`${selector}:focus`).count()) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`nothing matching ${selector} was reachable by Tab`);
}

async function startRun(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
}

test("answers every question with the keyboard alone", async ({ page }) => {
  await startRun(page);
  const choices = page.getByRole("group", { name: "Answers" }).getByRole("button");

  for (let question = 1; question <= 10; question += 1) {
    await expect(page.getByText(`${question} / 10`)).toBeVisible();
    await expect(choices).toHaveCount(4);

    await tabTo(page, "[role='group'][aria-label='Answers'] button");
    await page.keyboard.press("Enter");

    const next = question === 10 ? "See the score" : "Continue";
    await tabTo(page, `button:text-is("${next}")`);
    await page.keyboard.press("Enter");
  }

  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText("Run finished")).toBeVisible();
});

test("keeps the answer hidden until one is given", async ({ page }) => {
  await startRun(page);
  await expect(page.getByText("Meaning")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);

  await page.getByRole("group", { name: "Answers" }).getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("takes a typed reading and offers typing only where an answer can be typed", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Type the reading" }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Start" }).click();

  const field = page.getByRole("textbox", { name: "Reading" });
  await field.fill("zzz");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Wrong").first()).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");

  await page.getByRole("button", { name: "Quit", exact: true }).click();
  await page.getByRole("button", { name: "Quit", exact: true }).click();
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await expect(page.getByRole("button", { name: /needs an IME/ })).toBeDisabled();
});
