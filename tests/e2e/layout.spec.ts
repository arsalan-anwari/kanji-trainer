import { expect, test } from "./run";
import type { Page } from "@playwright/test";

async function overflow(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function seedRun(page: Page, format: string): Promise<void> {
  await page.addInitScript((picked) => {
    localStorage.setItem("kanji-trainer-disabled-packs", JSON.stringify([]));
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({ level: "N5", taxonomy: 1, sets: ["expressions"], questionCount: 10, format: picked })
    );
  }, format);
}

for (const locale of ["nl", "he"]) {
  test(`no tab runs past the right edge in ${locale}`, async ({ page }) => {
    await page.addInitScript((tag) => localStorage.setItem("kaizen-prefs", JSON.stringify({ locale: tag })), locale);
    await seedRun(page, "kanji-meaning");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    for (const index of [1, 2, 3, 0]) {
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      expect(await overflow(page), `tab ${index} overflows in ${locale}`).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: locale === "nl" ? "Starten" : "התחלה" }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    expect(await overflow(page), `the quiz overflows in ${locale}`).toBeLessThanOrEqual(0);
  });
}
