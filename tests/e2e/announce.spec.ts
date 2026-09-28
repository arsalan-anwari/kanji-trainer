import { expect, test } from "./run";

test("announces the format label on a picture prompt, not the image path", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Visualize/ }).click();
  await page.getByRole("button", { name: /^Image to kana/ }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  const live = page.getByRole("status").filter({ hasText: /^Question 1 of/ });
  await expect(live).toHaveText(/Question 1 of \d+\. How is this word read\?$/);
  await expect(live).not.toContainText("/images/");
});
