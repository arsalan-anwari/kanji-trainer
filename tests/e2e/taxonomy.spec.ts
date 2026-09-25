import { expect, test } from "./run";

test("groups the set rows under the five family headers", async ({ page }) => {
  await page.goto("/");
  for (const family of ["Quantity & time", "People & mind", "Daily life", "The world", "General"]) {
    await expect(page.getByRole("heading", { level: 3, name: family })).toBeVisible();
  }
  const quantity = page.getByRole("region", { name: "Quantity & time" });
  await expect(quantity.getByRole("button", { name: /^Numbers/ })).toBeVisible();
});

test("explains that kana words need a format that hides the kanji", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kanji-trainer-disabled-packs", JSON.stringify(["n5-plus", "n5-extra"]));
    const format = sessionStorage.getItem("format") ?? "kanji-kana";
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({ level: "N5", sets: ["expressions"], format, taxonomy: 1 })
    );
  });
  await page.goto("/");
  await expect(page.getByText("Kana words have no kanji form.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();

  await page.evaluate(() => sessionStorage.setItem("format", "kana-meaning"));
  await page.reload();
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
});

test("shows kana words switched off, with a warning, on a format that shows the kanji", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kanji-trainer-disabled-packs", JSON.stringify(["n5-plus", "n5-extra"]));
    localStorage.setItem(
      "kanji-trainer-settings",
      JSON.stringify({ level: "N5", sets: ["expressions"], format: "kanji-kana", taxonomy: 1 })
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Advanced settings" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Can't use N5 Kana words for this quiz type" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^はい.*yes/ })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Packs" }).getByRole("button", { name: "N5 Kana words" })).toBeDisabled();

  await page.getByRole("button", { name: "Back to setup" }).click();
  await page.getByRole("button", { name: /^Meaning/ }).first().click();
  await page.getByRole("button", { name: /^Kana to romaji/ }).click();
  await page.getByRole("button", { name: "Advanced settings" }).click();
  await expect(page.getByRole("button", { name: /^はい.*yes/ })).toBeEnabled();
  await expect(page.getByText("Can't use N5 Kana words", { exact: false })).toHaveCount(0);
});
