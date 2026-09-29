import AxeBuilder from "@axe-core/playwright";
import { expect, keyMode, press, test } from "./run";
import type { Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

test("sits a whole exam without the mouse and reads the score split by part", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard mode is desktop only");
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await keyMode(page);

  await press(page, page.getByRole("button", { name: /^Exam/ }));
  await expect(page.getByText(/21 questions in 20 minutes/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Direction" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  await expect(page.getByText(/The exam asks 21 different words/)).toBeVisible();

  await press(page, page.getByRole("button", { name: "Select all" }).first());
  const start = page.getByRole("button", { name: "Start" });
  await expect(start).toBeEnabled();
  expect(await scan(page)).toEqual([]);
  await press(page, start);

  for (let question = 1; question <= 21; question += 1) {
    await expect(page.getByText(`${question} / 21`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Show a hint" })).toHaveCount(0);
    if (question === 1) expect(await scan(page)).toEqual([]);
    await page.keyboard.press("1");
    await expect(page.getByText("Wrong", { exact: true })).toHaveCount(0);
  }

  await expect(page.getByText("Run finished")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const part of ["Reading", "Writing", "Meaning"]) {
    await expect(page.getByText(part, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Time used")).toBeVisible();
  await expect(page.getByText(/ \/ 20:00$/)).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
