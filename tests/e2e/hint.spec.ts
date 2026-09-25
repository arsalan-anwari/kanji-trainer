import { expect, test } from "./run";
import type { Page } from "@playwright/test";

async function tabTo(page: Page, selector: string): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    if (await page.locator(`${selector}:focus`).count()) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`nothing matching ${selector} was reachable by Tab`);
}

async function startRun(page: Page, difficulty: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("group", { name: "Difficulty" }).getByRole("button", { name: difficulty }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
}

test("opens the hint with the keyboard alone and closes it with Escape", async ({ page }) => {
  await startRun(page, "Beginner");

  const bulb = page.getByRole("button", { name: "Show a hint" });
  await expect(bulb).toBeVisible();

  await tabTo(page, 'button[aria-label="Show a hint"]');
  await page.keyboard.press("Enter");

  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("How it sounds")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close the hint" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toBeVisible();
});

test("closes the hint with its close button rather than quitting the run", async ({ page }) => {
  await startRun(page, "Beginner");

  await page.getByRole("button", { name: "Show a hint" }).click();
  await page.getByRole("button", { name: "Close the hint" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toBeVisible();
});

test("leaves nothing scrolling inside the page while the hint is open", async ({ page }) => {
  await startRun(page, "Beginner");
  await page.getByRole("button", { name: "Show a hint" }).click();

  const nested = await page.evaluate(() =>
    [...document.querySelectorAll("*")].filter((element) => {
      const overflow = getComputedStyle(element).overflowY;
      return (
        element !== document.documentElement &&
        (overflow === "auto" || overflow === "scroll") &&
        element.scrollHeight > element.clientHeight
      );
    }).length
  );
  expect(nested).toBe(0);

  const locked = await page.evaluate(() => document.documentElement.style.overflow);
  expect(locked).toBe("hidden");
});

test("offers an expert no bulb at all", async ({ page }) => {
  await startRun(page, "Expert");
  await expect(page.getByRole("button", { name: "Show a hint" })).toHaveCount(0);
});

// Kana to kanji is the format whose advanced hint is the picture; its beginner
// hint is the shape of the kanji, which is what a broken picture falls back to.
async function startPictureRun(page: Page, set: RegExp): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await page
    .getByRole("group", { name: "Difficulty" })
    .getByRole("button", { name: "Advanced" })
    .click();
  await page.getByRole("button", { name: set }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await page.getByRole("button", { name: "Show a hint" }).click();
}

test("shows the picture hint on the advanced tier", async ({ page }) => {
  await startPictureRun(page, /^Numbers/);
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  const picture = panel.getByRole("img", { name: "A picture hinting at the answer" });
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
    0
  );
});

test("falls back to the beginner hint when the picture will not load", async ({ page }) => {
  // Every word ships a picture, so the fallback only shows if one fails to load.
  await page.route("**/images/**", (route) => route.abort());
  await startPictureRun(page, /^Nature/);
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("A picture")).toHaveCount(0);
  await expect(panel.getByText("How it is written")).toBeVisible();
});
