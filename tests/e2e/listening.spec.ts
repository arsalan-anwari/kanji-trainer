import { expect, test, moveOn } from "./run";
import type { Page } from "@playwright/test";

async function startListeningRun(page: Page, direction: string): Promise<string[]> {
  const clips: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/audio/")) clips.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Listening/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${direction}`) }).click();
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  return clips;
}

test("plays each heard word as it appears and finishes a run", async ({ page }) => {
  const clips = await startListeningRun(page, "Sound to kana");
  await expect(page.getByText("How is the word you heard read?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play the word again" })).toBeVisible();
  await expect.poll(() => clips.length).toBeGreaterThan(0);

  for (let question = 1; question <= 10; question += 1) {
    await expect(page.getByText(`${question} / 10`)).toBeVisible();
    await page.getByRole("group", { name: "Answers" }).getByRole("button").first().click();
    await moveOn(page, question, 10);
  }
  await expect(page.getByText("Run finished")).toBeVisible();
});

test("picks a recording by tapping it, then checking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Listening/ }).click();
  await page.getByRole("button", { name: /^Kanji to sound/ }).click();
  const styles = page.getByRole("group", { name: "Answer style" });
  await expect(styles.getByRole("button")).toHaveCount(1);
  await expect(styles.getByRole("button", { name: /^Typing/ })).toHaveCount(0);

  await startListeningRun(page, "Kanji to sound");
  await expect(page.getByText("Which recording is this word?", { exact: true })).toBeVisible();

  for (let question = 1; question <= 10; question += 1) {
    await expect(page.getByText(`${question} / 10`)).toBeVisible();
    const check = page.getByRole("button", { name: "Check" });
    await expect(check).toBeDisabled();
    const first = page.getByRole("button", { name: "Recording 1" });
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await check.click();
    await moveOn(page, question, 10);
  }
  await expect(page.getByText("Run finished")).toBeVisible();
});

test("takes a typed reading for a heard word", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Typing/ }).click();
  await startListeningRun(page, "Sound to kana");
  await page.getByRole("textbox", { name: "Answer" }).fill("zzz");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Wrong").first()).toBeVisible();
});
