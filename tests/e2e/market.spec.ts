import { expect, test } from "./run";
import type { Page } from "@playwright/test";

const food = {
  id: "n5-food",
  level: "N5",
  theme: "food",
  version: "1.0.0",
  title: "Food and drink",
  words: 1,
  kanji: 1,
  description: "description.md"
};

const foodContent = {
  level: "N5",
  generated: "2026-09-24",
  sources: [],
  kanji: [{ character: "寿", level: "N5", look: "", components: ["寿"], on: ["ジュ"], kun: [] }],
  words: [
    {
      id: "寿司|すし",
      written: "寿司",
      reading: "すし",
      readings: ["すし"],
      glosses: ["sushi"],
      meaning: "sushi",
      clue: "",
      kanji: ["寿"],
      hasAudio: false,
      set: "food",
      subcategory: "meals",
      level: "N5",
      pack: "n5-food",
      file: "sushi"
    }
  ],
  taughtComponents: []
};

async function withFoodInstalled(page: Page): Promise<void> {
  await page.route("**/packs/index.json", (route) => route.fulfill({ json: ["n5-base", "n5-food"] }));
  await page.route("**/packs/n5-food/pack.json", (route) => route.fulfill({ json: food }));
  await page.route("**/packs/n5-food/content.json", (route) => route.fulfill({ json: foodContent }));
  await page.route("**/packs/n5-food/description.md", (route) =>
    route.fulfill({ body: "# Food and drink\n\n- **sushi** and more", contentType: "text/markdown" })
  );
}

test("reads a pack's details with the keyboard and closes them with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Marketplace" }).click();
  const details = page.getByRole("button", { name: "Details of JLPT N5" });
  await details.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "JLPT N5" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem").first()).toContainText("80 kanji");
  await expect(dialog.locator("script")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("switching an expansion off takes its words off the Chart at once", async ({ page }) => {
  await withFoodInstalled(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("寿司");
  await expect(page.getByRole("group", { name: /^寿司, すし/ })).toBeVisible();

  await page.getByRole("tab", { name: "Marketplace" }).click();
  const use = page.getByRole("switch", { name: /Use in practice/ });
  await expect(use).toHaveAttribute("aria-checked", "true");
  await use.focus();
  await page.keyboard.press("Enter");
  await expect(use).toHaveAttribute("aria-checked", "false");

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("寿司");
  await expect(page.getByRole("group", { name: /^寿司, すし/ })).toHaveCount(0);
});

test("never lets a base pack be switched off or removed", async ({ page }) => {
  await withFoodInstalled(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Marketplace" }).click();
  await expect(page.getByRole("switch")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "JLPT N5" }).getByRole("button", { name: /Remove/ })).toHaveCount(0);
});

test("blocks the app behind the gate while a listed base level is missing", async ({ page }) => {
  await page.route("**/catalog.json", async (route) => {
    const catalog = await (await route.fetch()).json();
    const base = catalog.packs[0];
    const n4 = { ...base, id: "n4-base", level: "N4", title: "JLPT N4", archive: "archives/n4-base.tar" };
    await route.fulfill({ json: { packs: [base, n4] } });
  });
  await page.goto("/");
  const gate = page.getByRole("dialog", { name: "Download the basics" });
  await expect(gate).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();
  const chart = page.getByRole("tab", { name: "Chart" });
  const box = await chart.boundingBox();
  if (box !== null) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(chart).toHaveAttribute("aria-selected", "false");
  await expect(gate).toBeVisible();
});
