import { expect, test, type Page } from "@playwright/test";
import { wasWrong } from "./run";

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
    if (!(await wasWrong(page, question, 10))) continue;

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
  if (await wasWrong(page, 1, 10)) {
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  }
});

test("takes a typed reading and offers typing only where an answer can be typed", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Type the reading" }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Start" }).click();

  const field = page.getByRole("textbox", { name: "Answer" });
  await field.fill("zzz");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Wrong").first()).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");

  await page.getByRole("button", { name: "Quit", exact: true }).first().click();
  await page.getByLabel("Quit this run?").getByRole("button", { name: "Quit", exact: true }).click();

  // Typing the written form is offered, with the IME it needs spelled out.
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await expect(page.getByRole("button", { name: /input method \(IME\)/ })).toBeEnabled();
});

async function startMeaningRun(page: Page, direction: string): Promise<void> {
  await page.goto("/");
  // A format is a category and then a direction inside it.
  await page.getByRole("button", { name: "Meaning", exact: false }).first().click();
  await page.getByRole("button", { name: direction }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
}

test("asks a kanji in Japanese and answers it in English", async ({ page }) => {
  await startMeaningRun(page, "Kanji to romaji");
  await expect(page.getByText("What does this word mean?")).toBeVisible();

  await expect(page.locator("[lang='ja']")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Answers" }).locator("[lang='ja']")).toHaveCount(0);

  await tabTo(page, "[role='group'][aria-label='Answers'] button");
  await page.keyboard.press("Enter");
  if (await wasWrong(page, 1, 10)) {
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  }
});

test("asks a meaning in English and answers it in Japanese", async ({ page }) => {
  await startMeaningRun(page, "Romaji to kanji");
  await expect(page.getByText("Which word means this?")).toBeVisible();

  await expect(page.locator("[lang='ja']")).toHaveCount(4);
  await expect(page.getByRole("group", { name: "Answers" }).locator("[lang='ja']")).toHaveCount(4);
});
