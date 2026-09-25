import { expect, test } from "./run";
import type { Page } from "@playwright/test";

// Wide layouts put the preset actions beside the select; a phone hides them in
// the sheet the select opens.
async function presetAction(page: Page, label: string): Promise<void> {
  const action = page.getByRole("button", { name: label });
  if (!(await action.isVisible())) {
    await page.getByRole("button", { name: "Saved runs" }).click();
  }
  await action.click();
}

// Wide layouts show a set's subcategories beside it; a phone folds them into a
// row that has to be opened first.
async function subcategory(page: Page, set: string, label: string) {
  const chip = page.getByRole("button", { name: new RegExp(`^${label}`) });
  if (!(await chip.isVisible())) {
    await page.getByRole("button", { name: `Show ${set}` }).click();
  }
  return chip;
}

test("cannot start a run before a set is picked", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start" });
  await expect(start).toBeDisabled();
  await expect(page.getByText("Pick at least one set to start.")).toBeVisible();

  await page.getByRole("button", { name: /^Nature/ }).click();
  await expect(start).toBeEnabled();
});

test("remembers the run it was set up with across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("button", { name: "Kana to kanji" }).click();
  const counts = page.getByRole("group", { name: "Number of questions" });
  await counts.getByRole("button", { name: "50", exact: true }).click();

  await page.reload();

  await expect(page.getByRole("button", { name: /^Actions/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Kana to kanji" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(counts.getByRole("button", { name: "50", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("offers no set that has no words at this level", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Numbers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Society/ })).toHaveCount(0);
});

test("switches to a single pass over the words in play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "One pass", exact: true }).click();

  // The nature set is six words, so a single pass is six questions.
  await expect(page.getByText("Questions").locator("..")).toContainText("6");
});

test("shows the levels this build has no content for as switched off", async ({ page }) => {
  await page.goto("/");
  // The level chips live on the advanced settings screen, which needs a set.
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Advanced settings" }).click();
  await expect(page.getByRole("button", { name: "N5", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "N4", exact: true })).toBeDisabled();
});

test("ships a Japanese face for machines that have none", async ({ page }) => {
  await page.goto("/");
  const families = await page.evaluate(() =>
    [...document.fonts].map((face) => face.family)
  );
  expect(families).toContain("Kaizen JP");
});

test("holds back hand-picked words, and keeps them held across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();

  const inPlay = page.getByText("Words in play").locator("..");
  const before = Number(((await inPlay.textContent()) ?? "").replace(/\D+/g, ""));
  expect(before).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Advanced settings" }).click();

  const groups = page.getByRole("group", { name: /^Words in / });
  const words = groups.getByRole("button");
  await expect(words.first()).toHaveAttribute("aria-pressed", "true");

  await words.nth(0).click();
  await words.nth(1).click();
  await expect(groups.locator("button[aria-pressed='false']")).toHaveCount(2);

  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(inPlay).toContainText(String(before - 2));

  await page.reload();
  await expect(inPlay).toContainText(String(before - 2));

  await page.getByRole("button", { name: "Advanced settings" }).click();
  await expect(groups.locator("button[aria-pressed='false']")).toHaveCount(2);
});

test("lists the words of a set under one section per subcategory", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Advanced settings" }).click();

  // Nature is landscape, weather, plants and elements, and nothing else.
  const groups = page.getByRole("group", { name: /^Words in / });
  await expect(groups).toHaveCount(4);
  await expect(page.getByRole("group", { name: "Words in Weather" }).getByRole("button")).toHaveCount(2);
  // The set row sums its subcategories up.
  await expect(page.getByText("6 of 6 kept")).toBeVisible();
});

test("drops the subcategories of a set that were not picked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();

  const inPlay = page.getByText("Words in play").locator("..");
  await expect(inPlay).toContainText("6");

  // Nature holds two weather words; unticking them leaves the other four.
  await (await subcategory(page, "Nature", "Weather")).click();
  await expect(inPlay).toContainText("4");

  await page.reload();
  await expect(inPlay).toContainText("4");
});

test("searches the words of the sets in play by meaning", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Advanced settings" }).click();

  await page.getByPlaceholder("Search words").fill("rain");
  const groups = page.getByRole("group", { name: /^Words in / });
  await expect(groups).toHaveCount(1);
  await expect(groups.getByRole("button")).toHaveCount(1);

  await page.getByPlaceholder("Search words").fill("zzz");
  await expect(page.getByText("No word matches this search.")).toBeVisible();
});

test("keeps the loaded preset selected through the word picker, so it can be updated", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();

  await presetAction(page, "Save this run");
  await page.getByPlaceholder("Name this run").fill("nature run");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const picker = page.getByRole("button", { name: "Saved runs" });
  await expect(picker).toContainText("nature run");

  await page.getByRole("button", { name: "Advanced settings" }).click();
  const groups = page.getByRole("group", { name: /^Words in / });
  await groups.getByRole("button").first().click();
  await page.getByRole("button", { name: "Back to setup" }).click();

  await expect(picker).toContainText("nature run");
  await presetAction(page, "Update");
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("keeps the loaded preset selected while the run is edited", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await presetAction(page, "Save this run");
  await page.getByPlaceholder("Name this run").fill("editable");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const picker = page.getByRole("button", { name: "Saved runs" });
  await expect(picker).toContainText("editable");

  await page.getByRole("button", { name: "Advanced settings" }).click();
  await page.getByRole("group", { name: "Word shapes" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(picker).toContainText("editable");

  await page.getByRole("button", { name: "Kana to kanji" }).click();
  await expect(picker).toContainText("editable");

  await page.reload();
  await expect(picker).toContainText("editable");
});

test("skips a preset's pack once it is switched off, instead of emptying the run", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kanji-trainer-presets",
      JSON.stringify([
        { name: "extras only", selection: { sets: ["nature"], subcategories: [], packs: ["n5-extra"], excludedWords: [], taxonomy: 1 } }
      ])
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  const inPlay = page.getByText("Words in play").locator("..");
  const all = ((await inPlay.textContent()) ?? "").replace(/\D+/g, "");

  await page.getByRole("button", { name: "Saved runs" }).click();
  await page.getByRole("option", { name: "extras only" }).click();
  await expect(inPlay).toContainText(all);
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
});
