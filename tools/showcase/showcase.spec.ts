import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { applySeed, seedPayload } from "../promo/seed";
import {
  answerChoice,
  answering,
  blocksInOrder,
  confirmQuit,
  installShowcase,
  moveOn,
  pickFormat,
  quitRun,
  Showcase,
  splash
} from "./drive";

const CLOCK = Date.UTC(2026, 8, 26, 20, 30);

const SEED = 20260926;

const MISSED = new Set([3, 7]);

const root = fileURLToPath(new URL("../..", import.meta.url));

test("record the showcase", async ({ page }, testInfo) => {
  const shots = new Showcase(page, join(root, "packaging/repo", testInfo.project.name));

  await page.addInitScript(applySeed, seedPayload({ now: CLOCK }));
  await page.addInitScript(installShowcase, { randomSeed: SEED, clockStart: CLOCK });
  await page.goto("/");

  const button = (name: string | RegExp, exact = false) =>
    page.getByRole("button", { name, exact });
  const start = button("Start", true);
  const counts = page.getByRole("group", { name: "Number of questions" });

  const startRun = async (): Promise<void> => {
    await start.click();
    await expect(page.getByRole("progressbar")).toBeVisible();
  };

  await expect(start).toBeEnabled();
  await counts.getByRole("button", { name: "10", exact: true }).click();

  await shots.top();
  await shots.shot("01_Setup_Reading");

  await pickFormat(page, "Meaning");
  await shots.top();
  await shots.shot("02_Setup_Meaning");

  await pickFormat(page, "Visualize");
  await shots.top();
  await shots.shot("03_Setup_Visualize");

  await pickFormat(page, "Listening");
  await shots.top();
  await shots.shot("04_Setup_Listening");

  await pickFormat(page, "Assemble");
  await shots.top();
  await shots.shot("05_Setup_Assemble");

  await pickFormat(page, "Reading", "Kanji to kana");
  await page.getByRole("group", { name: "Difficulty" }).getByRole("button", { name: /^Advanced/ }).click();
  await button("10s", true).click();
  await shots.reveal(page.getByText("Difficulty", { exact: true }), 12);
  await shots.shot("06_Setup_RunOptions");
  await button("Off", true).first().click();

  await button("Advanced settings").click();
  await expect(button("Back to setup")).toBeVisible();
  await button("Expand all").click();
  await shots.top();
  await shots.shot("07_Setup_Advanced");
  await button("Back to setup").click();
  await expect(start).toBeEnabled();

  await startRun();
  await answering(page);
  await shots.top();
  await shots.shot("08_Quiz_KanjiKana");

  await button("Show a hint").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shots.shot("09_Quiz_Hint");
  await button("Close the hint").click();
  await quitRun(page);

  // One still per remaining format, each on the first question of its run.
  const formats: [string, string, string][] = [
    ["10_Quiz_KanaKanji", "Reading", "Kana to kanji"],
    ["11_Quiz_KanjiMeaning", "Meaning", "Kanji to romaji"],
    ["12_Quiz_MeaningKanji", "Meaning", "Romaji to kanji"],
    ["13_Quiz_KanaMeaning", "Meaning", "Kana to romaji"],
    ["14_Quiz_MeaningKana", "Meaning", "Romaji to kana"],
    ["15_Quiz_ImageKanji", "Visualize", "Image to kanji"],
    ["16_Quiz_ImageKana", "Visualize", "Image to kana"],
    ["17_Quiz_SoundKana", "Listening", "Sound to kana"],
    ["18_Quiz_SoundKanji", "Listening", "Sound to kanji"]
  ];
  for (const [name, category, direction] of formats) {
    await pickFormat(page, category, direction);
    await startRun();
    await answering(page);
    await shots.top();
    await shots.shot(name);
    await quitRun(page);
  }

  await pickFormat(page, "Listening", "Kanji to sound");
  await startRun();
  await button("Recording 2").click();
  await shots.top();
  await shots.shot("19_Quiz_KanjiSound");
  await quitRun(page);

  // Calendar words with the whole-block sets held back, as in the promo: each
  // splits into four to six blocks (曜 into 日 and 翟, 火 into three). The shot
  // is mid-build, the first kanji done and the next half assembled, so the
  // pieces show in the slots and in the pile.
  await pickFormat(page, "Assemble");
  await button("Clear", true).click();
  await button(/^Calendar/).click();
  // A narrow screen folds a set's subcategories away.
  const unfold = button("Show Calendar", true);
  if (await unfold.isVisible()) await unfold.click();
  for (const held of ["Days", "Months", "Weeks", "Years"]) {
    await button(new RegExp(`^${held} \\d`)).click();
  }
  await startRun();
  const blocks = await blocksInOrder(page);
  for (const block of blocks.slice(0, Math.max(1, blocks.length - 2))) await block.click();
  await shots.top();
  await shots.shot("20_Quiz_Assemble");
  await quitRun(page);
  // Back to the seeded sets, the pool the runs after this one draw from.
  await button("Clear", true).click();
  for (const set of [/^Nature/, /^Food/, /^Calendar/]) await button(set).click();

  await pickFormat(page, "Reading", "Kanji to kana");
  await page.getByRole("group", { name: "Answer style" }).getByRole("button", { name: /^Typing/ }).click();
  await startRun();
  const field = page.getByRole("textbox", { name: "Answer" });
  await field.fill("はな");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Wrong").first()).toBeVisible();
  await shots.top();
  await shots.shot("21_Quiz_Typing_Incorrect");

  await button("Quit", true).first().click();
  await expect(page.getByLabel("Quit this run?")).toBeVisible();
  await shots.shot("22_Quiz_QuitConfirm");
  await confirmQuit(page);

  await page.getByRole("group", { name: "Answer style" }).getByRole("button", { name: /^Multiple choice/ }).click();
  await startRun();
  for (let question = 1; question <= 10; question += 1) {
    await shots.advance(2600 + question * 310);
    await answerChoice(page, !MISSED.has(question));
    if (question < 10) await moveOn(page, question, 10);
    else if (MISSED.has(question)) await button("See the score").click();
  }

  await expect(splash(page)).toBeVisible();
  await shots.snap("23_Result_Splash", "allow");
  await splash(page).click();
  await expect(splash(page)).toBeHidden();
  await expect(button("See past runs")).toBeVisible();
  await shots.top();
  await shots.shot("24_Result_Score");

  await button("See past runs").click();
  await button("All", true).click();
  await shots.top();
  await shots.shot("25_Reports_All");

  await button("Select every run shown").click();
  await shots.reveal(page.getByText(/Mistakes by/).first());
  await shots.shot("26_Reports_Mistakes");
  await shots.top();

  await page.getByRole("tab", { name: "Chart" }).click();
  await page.getByRole("textbox", { name: "Search words" }).fill("雨");
  const card = page.getByRole("group", { name: /^雨, あめ/ });
  await card.getByRole("button", { name: "Turn 雨 over" }).click();
  await shots.reveal(card, 60);
  await shots.shot("27_Chart_Cards");

  await page.getByRole("textbox", { name: "Search words" }).fill("");
  await button("Export flashcards").click();
  await shots.top();
  await shots.shot("28_Chart_Flashcards");

  await page.getByRole("tab", { name: "Marketplace" }).click();
  await expect(button(/^Details of N5 Base/)).toBeVisible();
  await shots.top();
  await shots.shot("29_Marketplace");

  const sheet = button("Settings", true);
  if (await sheet.isVisible()) {
    await sheet.click();
    await shots.shot("30_Settings_Menu");
    await page.keyboard.press("Escape");
  } else {
    await button("High contrast", true).click();
    await shots.shot("30_Marketplace_HighContrast");
    await button("High contrast", true).click();
  }

  console.log(`  ${shots.count} stills in packaging/repo/${testInfo.project.name}`);
});
