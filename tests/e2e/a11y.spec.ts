import AxeBuilder from "@axe-core/playwright";
import { expect, moveOn, test } from "./run";
import type { Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map(
    (violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`
  );
}

async function seed(page: Page, format: string): Promise<void> {
  await page.addInitScript((picked) => {
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({
        level: "N5",
        sets: ["nature"],
        subcategories: [],
        format: picked,
        answerStyle: "choice",
        choiceCount: 4,
        questionCount: 10,
        wordShapes: [],
        excludedWords: [],
        difficulty: "beginner",
        perQuestionSeconds: 0,
        totalSeconds: 0
      })
    );
  }, format);
}

async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#splash")).toHaveCount(0, { timeout: 15_000 });
}

test("the setup screen has no accessibility violations", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the study screen has no accessibility violations", async ({ page }) => {
  await seed(page, "kanji-kana");
  await openApp(page);
  await page.getByRole("button", { name: "Study these first" }).click();
  await expect(page.getByRole("button", { name: "Back to setup" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the word picker has no accessibility violations", async ({ page }) => {
  await seed(page, "kanji-kana");
  await openApp(page);
  await page.getByRole("button", { name: "Advanced settings" }).click();
  await expect(page.getByRole("button", { name: "Back to setup" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

for (const format of ["kanji-kana", "image-kana", "audio-kana", "kana-assemble"]) {
  test(`the ${format} quiz has no accessibility violations`, async ({ page }) => {
    await seed(page, format);
    await openApp(page);
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}

test("the result screen has no accessibility violations", async ({ page }) => {
  await seed(page, "kanji-kana");
  await openApp(page);
  await page.getByRole("button", { name: "Start" }).click();
  for (let question = 1; question <= 10; question += 1) {
    await page.getByRole("group", { name: "Answers" }).getByRole("button").first().click();
    await moveOn(page, question, 10);
  }
  await expect(page.getByText("Run finished")).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.getByRole("tab", { name: "Report" }).click();
  await expect(page.getByText("Mistakes by word")).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the empty reports screen has no accessibility violations", async ({ page }) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Report" }).click();
  await expect(page.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true");
  expect(await scan(page)).toEqual([]);
});

test("the chart and print picker have no accessibility violations", async ({ page }) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Chart" }).click();
  await expect(page.getByRole("button", { name: "Export flashcards" })).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.getByRole("button", { name: "Export flashcards" }).click();
  await expect(page.getByRole("button", { name: "Download as PDF" })).toBeVisible();
  expect(await scan(page)).toEqual([]);

  await page.getByRole("button", { name: "Download as PDF" }).click();
  await expect(page.getByRole("group", { name: "Cards per page" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("the marketplace has no accessibility violations", async ({ page }) => {
  await openApp(page);
  await page.getByRole("tab", { name: "Marketplace" }).click();
  await expect(page.getByRole("tab", { name: "Marketplace" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("N5 Base").first()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

for (const [theme, stored] of [
  ["dark", { theme: "dark" }],
  ["high-contrast", { contrast: true }]
] as const) {
  test(`the ${theme} theme has no accessibility violations`, async ({ page }) => {
    await seed(page, "kanji-kana");
    await page.addInitScript((prefs) => localStorage.setItem("kaizen-prefs", JSON.stringify(prefs)), stored);
    await openApp(page);
    await expect(page.locator(`html.${theme}`)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    expect(await scan(page)).toEqual([]);

    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}
