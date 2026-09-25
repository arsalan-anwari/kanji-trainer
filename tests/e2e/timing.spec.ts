import { expect, test } from "./run";
import type { Page } from "@playwright/test";

async function startTimedRun(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Time per question" })
    .getByRole("button", { name: "5s", exact: true })
    .click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("progressbar", { name: "Time left on this question" })).toBeVisible();
}

test("records an ignored question as a timed-out miss", async ({ page }) => {
  await startTimedRun(page);
  await page.clock.runFor(6000);

  await expect(page.getByText("Out of time", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("counts every timed-out question on the result screen", async ({ page }) => {
  await startTimedRun(page);
  for (let question = 1; question <= 10; question += 1) {
    await page.clock.runFor(6000);
    await page.getByRole("button", { name: question === 10 ? "See the score" : "Continue" }).click();
  }

  await expect(page.getByText("Run finished")).toBeVisible();
  await expect(page.getByText("Average per question")).toBeVisible();
  await expect(page.getByText("Out of time", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Accuracy")).toBeVisible();
});

test("holds the clock while the quit dialog is open", async ({ page }) => {
  await startTimedRun(page);
  await page.getByRole("button", { name: "Quit" }).click();
  await page.clock.runFor(20_000);
  await page.getByRole("button", { name: "Keep going" }).click();

  await expect(page.getByText("Out of time", { exact: true })).toHaveCount(0);
  await page.clock.runFor(6000);
  await expect(page.getByText("Out of time", { exact: true })).toBeVisible();
});

async function learnFirstAnswer(page: Page): Promise<string> {
  await page.addInitScript(() => {
    let seed = 42;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await startTimedRun(page);
  await page.getByRole("group", { name: "Answers" }).getByRole("button").first().click();
  await page.clock.runFor(100);
  await expect(page.getByRole("alert")).toContainText("The answer was");
  const said = (await page.getByRole("alert").textContent()) ?? "";
  await page.reload();
  await page.getByRole("button", { name: "Start" }).click();
  return said.split("The answer was ")[1]?.trim() ?? "";
}

test("stops the question clock once a wrong answer is given", async ({ page }) => {
  const answer = await learnFirstAnswer(page);
  const bar = page.getByRole("progressbar", { name: "Time left on this question" });
  await page.clock.runFor(1000);
  await page
    .getByRole("group", { name: "Answers" })
    .getByRole("button")
    .filter({ hasNotText: answer })
    .first()
    .click();
  const held = await bar.getAttribute("aria-valuenow");

  await page.clock.runFor(10_000);
  await expect(bar).toHaveAttribute("aria-valuenow", held ?? "");
  await expect(page.getByText("Out of time", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 / 10")).toBeVisible();
});

test("moves on by itself after a right answer", async ({ page }) => {
  const answer = await learnFirstAnswer(page);
  await page.getByRole("group", { name: "Answers" }).getByRole("button", { name: answer }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.getByText("2 / 10")).toBeVisible();
});
