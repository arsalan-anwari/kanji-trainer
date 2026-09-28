import { expect, test } from "./run";
import type { Page } from "@playwright/test";

async function pickLanguage(page: Page, name: string): Promise<void> {
  const inHeader = page.getByRole("navigation").getByLabel("Language");
  if (await inHeader.isVisible()) {
    await inHeader.click();
    await page.getByRole("option", { name }).click();
    return;
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByLabel("Language").click();
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
}

test("picking Hebrew redraws the app right to left and sticks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  await pickLanguage(page, "עברית");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.getByRole("button", { name: "התחלה" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "תרגול" })).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: "התחלה" })).toBeVisible();
});

test("a translated pack shows its meanings and clue in the interface language", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kaizen-prefs", JSON.stringify({ locale: "nl" }));
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({
        level: "N5",
        taxonomy: 1,
        sets: ["nature"],
        questionCount: 10,
        format: "kanji-meaning",
        difficulty: "advanced"
      })
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Starten" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  const tiles = page.getByRole("group", { name: "Antwoorden" }).locator("[lang='nl']");
  await expect(tiles).toHaveCount(4);

  await page.getByRole("button", { name: "Een hint tonen" }).click();
  const clue = page.getByRole("dialog").locator("p[lang]");
  await expect(clue).toHaveAttribute("lang", "nl");
  await expect(clue).not.toHaveText("");
});

test("an untranslated pack falls back to English and says so", async ({ page }) => {
  await page.route("**/locale/he.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.addInitScript(() => {
    localStorage.setItem("kaizen-prefs", JSON.stringify({ locale: "he" }));
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({
        level: "N5",
        taxonomy: 1,
        sets: ["nature"],
        questionCount: 10,
        format: "kanji-meaning",
        difficulty: "advanced"
      })
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "התחלה" }).click();
  await expect(page.getByRole("group", { name: "תשובות" }).locator("[lang='en']")).toHaveCount(4);
  await page.getByRole("button", { name: "הצגת רמז" }).click();
  await expect(page.getByRole("dialog").locator("p[lang]")).toHaveAttribute("lang", "en");
});
