import { expect, test, wasWrong } from "./run";
import type { Page } from "@playwright/test";

async function tabTo(page: Page, selector: string): Promise<void> {
  for (let press = 0; press < 60; press += 1) {
    if (await page.locator(`${selector}:focus`).count()) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`nothing matching ${selector} was reachable by Tab`);
}

const THREE_WORDS = {
  level: "N5",
  sets: ["nature"],
  subcategories: [],
  format: "kana-assemble",
  answerStyle: "choice",
  choiceCount: 4,
  questionCount: 0,
  wordShapes: [],
  excludedWords: ["山|やま", "川|かわ", "木|き"],
  difficulty: "beginner",
  perQuestionSeconds: 0,
  totalSeconds: 0
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    if (localStorage.getItem("kanji-trainer-settings") === null) {
      localStorage.setItem("kanji-trainer-settings", JSON.stringify(settings));
    }
  }, THREE_WORDS);
  await page.goto("/");
});

test("assembles a three word run with the keyboard alone", async ({ page }) => {
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  const slots = page.getByRole("group", { name: "Slots" });
  const pile = "[role='group'][aria-label='Blocks'] button";

  for (let question = 1; question <= 3; question += 1) {
    await expect(page.getByText(`${question} / 3`)).toBeVisible();
    await expect(slots.getByRole("button", { name: /^kanji 1, .+, empty$/ }).first()).toBeVisible();

    for (;;) {
      const left = await page.locator(pile).count();
      await tabTo(page, pile);
      await page.keyboard.press("Enter");
      if (left === 1) break;
      await expect(page.locator(pile)).toHaveCount(left - 1);
      await expect(page.getByRole("status").filter({ hasText: /^(Placed|.+ is complete)/ })).toHaveCount(1);
    }
    if (!(await wasWrong(page, question, 3))) continue;

    const next = question === 3 ? "See the score" : "Continue";
    await tabTo(page, `button:text-is("${next}")`);
    await page.keyboard.press("Enter");
  }

  await expect(page.getByText("Run finished")).toBeVisible();
});

test("lifts a placed block back out when its slot is pressed", async ({ page }) => {
  await page.evaluate((settings) => {
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({ ...settings, excludedWords: [...settings.excludedWords, "水|みず", "雨|あめ"] })
    );
  }, THREE_WORDS);
  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  const pile = page.getByRole("group", { name: "Blocks" }).getByRole("button");
  await expect(pile).toHaveCount(4);

  await pile.first().click();
  await expect(pile).toHaveCount(3);
  await page.locator('[data-slot]:not([aria-label$="empty"])').click();
  await expect(pile).toHaveCount(4);
  await expect(page.getByRole("status").filter({ hasText: /^Took / })).toHaveCount(1);
});

test("hides the answer style while assembling", async ({ page }) => {
  await expect(page.getByRole("group", { name: "Answer style" })).toHaveCount(0);
});

test("lifts a block back out of a character it already finished", async ({ page }) => {
  await page.evaluate((settings) => {
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({ ...settings, sets: ["objects"], subcategories: ["objects/money"], excludedWords: ["円|えん"] })
    );
  }, THREE_WORDS);
  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  const pile = page.getByRole("group", { name: "Blocks" }).getByRole("button");
  await expect(pile).toHaveCount(2);

  await pile.filter({ hasText: "お" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^お is complete/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^kana 1, whole, お$/ }).click();
  await expect(pile).toHaveCount(2);
  await expect(page.getByRole("status").filter({ hasText: /^Took お/ })).toHaveCount(1);
});
