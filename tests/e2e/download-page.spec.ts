import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = ["index.html", "privacy.html"];

for (const name of PAGES) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the download site's ${name} has no accessibility violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(pathToFileURL(resolve("packaging/repo/html", name)).href);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
}

test("every image on the download page has alt text", async ({ page }) => {
  await page.goto(pathToFileURL(resolve("packaging/repo/html/index.html")).href);
  const images = page.locator("img");
  for (const image of await images.all()) {
    expect(await image.getAttribute("alt")).toBeTruthy();
  }
});
