import { expect, type Page } from "@playwright/test";

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
