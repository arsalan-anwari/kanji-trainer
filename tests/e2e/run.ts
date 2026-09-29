import { expect, test as base, type Locator, type Page } from "@playwright/test";

export const OPTIONAL_PACKS = ["n5-plus", "n5-extra", "n5-kana"];

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((optional) => {
      if (localStorage.getItem("kanji-trainer-disabled-packs") === null) {
        localStorage.setItem("kanji-trainer-disabled-packs", JSON.stringify(optional));
      }
    }, OPTIONAL_PACKS);
    await use(page);
  }
});

export { expect };

export async function wasWrong(page: Page, question: number, total: number): Promise<boolean> {
  const wrong = page.getByText("Wrong", { exact: true });
  const moved =
    question === total ? page.getByText("Run finished") : page.getByText(`${question + 1} / ${total}`);
  await expect(wrong.or(moved)).toBeVisible();
  return wrong.isVisible();
}

export async function moveOn(page: Page, question: number, total: number): Promise<void> {
  if (!(await wasWrong(page, question, total))) return;
  await page
    .getByRole("button", { name: question === total ? "See the score" : "Continue" })
    .click();
}

export async function keyMode(page: Page): Promise<void> {
  await page.keyboard.press("Control+/");
  await expect(page.locator("html.kbd-nav")).toHaveCount(1);
}

export async function reach(page: Page, target: Locator): Promise<void> {
  const handle = await target.elementHandle();
  const focused = (): Promise<{ hit: boolean; seen: boolean }> =>
    page.evaluate((element) => {
      const here = document.activeElement;
      const seen = (window as { seen?: WeakSet<Element> }).seen ?? new WeakSet<Element>();
      (window as { seen?: WeakSet<Element> }).seen = seen;
      const again = here !== null && seen.has(here);
      if (here !== null) seen.add(here);
      return { hit: here === element, seen: again };
    }, handle);
  for (let up = 0; up < 60; up += 1) await page.keyboard.press("Shift+ArrowUp");
  for (let section = 0; section < 60; section += 1) {
    await page.evaluate(() => ((window as { seen?: WeakSet<Element> }).seen = new WeakSet<Element>()));
    for (let press = 0; press < 300; press += 1) {
      const { hit, seen } = await focused();
      if (hit) return;
      if (seen) break;
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Shift+ArrowDown");
  }
  throw new Error("the target was not reachable with the keyboard");
}

export async function press(page: Page, target: Locator): Promise<void> {
  await reach(page, target);
  await page.keyboard.press("Enter");
}
