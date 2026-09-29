import { expect, keyMode, press, test, wasWrong } from "./run";
import type { Page } from "@playwright/test";

async function selectedTab(page: Page, name: string): Promise<void> {
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
}

test("configures, finishes and reviews a run without the mouse", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard mode is desktop only");
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await keyMode(page);

  await press(page, page.getByRole("button", { name: /^Nature/ }));
  await expect(page.getByRole("button", { name: /^Nature/ })).toHaveAttribute("aria-pressed", "true");
  const ten = page
    .getByRole("group", { name: "Number of questions" })
    .getByRole("button", { name: "10", exact: true });
  await press(page, ten);
  await expect(ten).toHaveAttribute("aria-pressed", "true");
  await press(page, page.getByRole("button", { name: "Start" }));
  await expect(page.getByRole("progressbar")).toBeVisible();

  for (let question = 1; question <= 10; question += 1) {
    await expect(page.getByText(`${question} / 10`)).toBeVisible();
    await page.keyboard.press("1");
    if (await wasWrong(page, question, 10)) await page.keyboard.press("Enter");
  }
  await expect(page.getByText("Run finished")).toBeVisible();

  await page.keyboard.press("Control+ArrowRight");
  await selectedTab(page, "Report");
  await expect(page.getByText("Mistakes by word")).toBeVisible();
  await page.keyboard.press("Control+ArrowRight");
  await selectedTab(page, "Chart");
  await page.keyboard.press("Control+ArrowRight");
  await selectedTab(page, "Marketplace");
  await page.keyboard.press("Control+ArrowLeft");
  await selectedTab(page, "Chart");

  await press(page, page.getByRole("button", { name: "Export flashcards" }));
  await expect(page.getByRole("button", { name: "Download as PDF" })).toBeVisible();
  await page.keyboard.press("Control+ArrowLeft");
  await page.keyboard.press("Control+ArrowLeft");
  await selectedTab(page, "Practice");

  await press(page, page.getByRole("button", { name: "Advanced settings" }));
  await press(page, page.getByRole("button", { name: "Back to setup" }).first());
  await press(page, page.getByRole("button", { name: "Study these first" }));
  await expect(page.getByRole("button", { name: "Back to setup" }).first()).toBeVisible();
});

test("? opens the shortcut sheet and Esc closes it", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard mode is desktop only");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Start keyboard mode")).toBeVisible();
  await expect(sheet.getByText("Show a hint")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("Tab picks up on the next question once the answered one is gone", async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, "keyboard mode is desktop only");
  await page.goto("/");
  await page.getByRole("button", { name: /^Nature/ }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("1 / 20")).toBeVisible();
  await keyMode(page);

  const choices = page.getByRole("group", { name: "Answers" });
  await press(page, choices.getByRole("button").first());
  if (await wasWrong(page, 1, 20)) await page.keyboard.press("Enter");
  await expect(page.getByText("2 / 20")).toBeVisible();
  await page.mouse.click(1, 1);
  await page.keyboard.press("Tab");
  await expect(choices.getByRole("button").first()).toBeFocused();
});
