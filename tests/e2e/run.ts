import { expect, test as base, type Page } from "@playwright/test";

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
