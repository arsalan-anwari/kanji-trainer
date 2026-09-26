import { expect, test, type Page } from "@playwright/test";
import { applySeed, seedPayload } from "./seed";
import { installStage, Stage } from "./stage";
import {
  answering,
  blocksInOrder,
  forgetHeard,
  installClipTap,
  rightRecording,
  rightSlot
} from "../showcase/drive";

const intro = { title: "Kanji Trainer", lines: ["JLPT vocabulary, written in kanji"] };

const outro = {
  title: "Kanji Trainer",
  lines: [
    "Free and open source. Desktop, tablet and phone",
    "github.com/arsalan-anwari/kanji-trainer"
  ]
};

const QUESTIONS = 10;

type Kind = "choice" | "recording" | "blocks";

const TOUR: [caption: string, category: string, direction: string, kind: Kind][] = [
  ["Reading: see the kana, pick the kanji", "Reading", "Kana to kanji", "choice"],
  ["Meaning: see the word, pick what it means", "Meaning", "Kanji to romaji", "choice"],
  ["Or see the meaning, pick the word", "Meaning", "Romaji to kanji", "choice"],
  ["From the reading to the meaning", "Meaning", "Kana to romaji", "choice"],
  ["And from the meaning to the reading", "Meaning", "Romaji to kana", "choice"],
  ["Visualize: see a picture, pick the word", "Visualize", "Image to kanji", "choice"],
  ["Or pick how it is read", "Visualize", "Image to kana", "choice"],
  ["Listening: hear the word, pick its reading", "Listening", "Sound to kana", "choice"],
  ["Or pick how it is written", "Listening", "Sound to kanji", "choice"],
  ["Or see the word, pick the right recording", "Listening", "Kanji to sound", "recording"],
  ["Assemble: build the word from its pieces", "Assemble", "", "blocks"]
];

const answers = (page: Page) => page.getByRole("group", { name: "Answers" }).getByRole("button");

async function question(page: Page, number: number): Promise<void> {
  await expect(page.getByText(`${number} / ${QUESTIONS}`)).toBeVisible();
  await answering(page);
}

test("record the promo", async ({ page }) => {
  const stage = new Stage(page);

  await page.addInitScript(applySeed, seedPayload());
  await page.addInitScript(installStage, intro);
  await page.addInitScript(installClipTap);
  await page.goto("/");

  const button = (name: string | RegExp, exact = false) =>
    page.getByRole("button", { name, exact });
  const start = button("Start", true);
  await expect(start).toBeEnabled();

  await stage.beat(650);
  await stage.hideCard();

  await stage.caption("Twelve question types, in five groups");
  for (const category of ["Meaning", "Visualize", "Listening", "Assemble", "Reading"]) {
    await stage.tap(button(new RegExp(`^${category}`)).first(), 300);
  }
  stage.mark("formats");

  await stage.caption("Pick whole sets, or single subcategories");
  await stage.tap(button("Clear", true), 260);
  await stage.tap(button(/^Nature/), 260);
  await stage.tap(button(/^Food/), 260);
  await stage.tap(button(/^Calendar/), 360);
  stage.mark("sets");

  await stage.caption("Harder difficulty, closer wrong answers");
  const difficulty = page.getByRole("group", { name: "Difficulty" });
  await stage.tap(difficulty.getByRole("button", { name: /^Advanced/ }), 420);
  await stage.caption("A time trial per question or per run, if you want one");
  await stage.tap(button("15s", true), 360);
  await stage.tap(button("Off", true).first(), 200);
  await stage.tap(
    page.getByRole("group", { name: "Number of questions" }).getByRole("button", { name: "10", exact: true }),
    260
  );
  stage.mark("options");

  // One question of every other format, answered right, then quit.
  const quit = async (): Promise<void> => {
    await stage.tap(button("Quit", true).first(), 240);
    await stage.tap(page.getByLabel("Quit this run?").getByRole("button", { name: "Quit", exact: true }), 260);
  };

  for (const [caption, category, direction, kind] of TOUR) {
    await stage.caption(caption);
    await stage.tap(button(new RegExp(`^${category}`)).first(), 180);
    if (direction !== "") await stage.tap(button(new RegExp(`^${direction}`)).first(), 220);
    if (kind === "blocks") {
      // Every word in these two splits into four to six blocks (曜 into 日 and
      // 翟, 火 into three), so the build shows off more than one whole block.
      await stage.tap(button("Clear", true), 160);
      await stage.tap(button(/^Calendar/), 160);
      for (const held of ["Days", "Months", "Weeks", "Years"]) {
        await stage.tap(button(new RegExp(`^${held} \\d`)), 140);
      }
    }
    await forgetHeard(page);
    await stage.tap(start, 500);
    const verdict = page.getByText(/^(Correct|Wrong)$/).first().textContent({ timeout: 20_000 });

    if (kind === "recording") {
      await rightRecording(page, (target) => stage.tap(target, 650, true));
      await stage.tap(button("Check"), 1100, true);
    } else if (kind === "blocks") {
      for (const block of await blocksInOrder(page)) await stage.tap(block, 320, true);
      await stage.beat(800);
    } else {
      await answering(page);
      await stage.beat(700);
      await stage.tap(answers(page).nth(await rightSlot(page)), 1000, true);
    }
    stage.mark(`${[category, direction].filter(Boolean).join(" ")}: ${await verdict}`);
    await quit();
  }

  await stage.caption("And the classic: see the kanji, pick the reading");
  // Back to the sets picked at the start, a pool big enough for ten questions.
  await stage.tap(button("Clear", true), 140);
  for (const set of [/^Nature/, /^Food/, /^Calendar/]) await stage.tap(button(set), 140);
  await stage.tap(button(/^Reading/).first(), 180);
  await stage.tap(button(/^Kanji to kana/), 300);
  await stage.tap(start, 550);
  await stage.frame("main .board", 180);

  await question(page, 1);
  await stage.beat(450);
  await stage.tap(answers(page).nth(await rightSlot(page)), 900, true);

  await question(page, 2);
  await stage.caption("Stuck? The bulb gives a hint");
  await stage.tap(button("Show a hint"), 1500);
  await stage.tap(button("Close the hint"), 300);

  await stage.caption("A miss shows the reading and the meaning");
  await stage.tap(answers(page).nth(((await rightSlot(page)) + 1) % 4), 1400, true);
  await stage.tap(button("Continue"), 200);
  stage.mark("run");

  await stage.caption("Ctrl and / turns on keyboard mode");
  await stage.press("Control+/", 480);
  await stage.caption("Then keys 1 to 4 pick an answer");
  for (let number = 3; number <= QUESTIONS; number += 1) {
    await question(page, number);
    await stage.press(String((await rightSlot(page)) + 1), 380);
  }
  await stage.press("Control+Shift+/", 200);
  await stage.hideCaption();
  stage.mark("keyboard run");

  await stage.beat(3000);
  stage.mark("splash");

  await stage.caption("Finish a run and it gets scored and saved");
  await stage.beat(900);
  await stage.tap(page.getByRole("tab", { name: "Report" }), 300);
  await stage.caption("Every run kept, on your device only");
  await stage.tap(button("All", true), 500);
  await stage.tap(button("Select every run shown"), 400);
  await stage.caption("See which words and sets trip you up");
  await stage.show(page.getByText(/Mistakes by/).first(), 1300);
  await stage.scroll(0, 300);
  stage.mark("reports");

  await stage.caption("Export runs to a .kj-report file for another device");
  await stage.tap(button("Run actions"), 420);
  const saved = page.waitForEvent("download");
  await stage.tap(button(/^Export/), 700);
  await saved;
  stage.mark("export");

  await stage.tap(page.getByRole("tab", { name: "Chart" }), 300);
  await stage.caption("Every word on a flip card, with a recording");
  const search = page.getByRole("textbox", { name: "Search words" });
  await stage.tap(search, 120);
  await stage.type("雨");
  const card = page.getByRole("group", { name: /^雨, あめ/ });
  await stage.tap(card.getByRole("button", { name: "Play 雨" }), 900);
  await stage.caption("Turn it over for an example sentence");
  await stage.tap(card.getByRole("button", { name: "Turn 雨 over" }), 1600);
  stage.mark("chart");

  await stage.caption("Or print them as double-sided flashcards");
  await search.fill("");
  await stage.scroll(0, 240);
  await stage.tap(button("Export flashcards"), 500);
  await stage.tap(button("Download as PDF"), 500);
  await stage.tap(page.getByRole("group", { name: "Cards per page" }).getByRole("button", { name: "2×2" }), 1200);
  await page.keyboard.press("Escape");
  stage.mark("flashcards");

  await stage.tap(page.getByRole("tab", { name: "Marketplace" }), 300);
  await stage.caption("Add packs of words. Everything works offline");
  await stage.beat(1500);
  stage.mark("market");

  await stage.caption("Light, dark, or system theme");
  const theme = page.getByRole("button", { name: /^Theme:/ });
  await stage.tap(theme, 700);
  await stage.tap(theme, 700);
  await stage.tap(theme, 300);

  await stage.caption("Scale the whole app to fit the screen it is on");
  const zoomOut = button("Zoom out");
  const zoomIn = button("Zoom in");
  await stage.tap(zoomOut, 260);
  await stage.tap(zoomOut, 480);
  await stage.tap(zoomIn, 260);
  await stage.tap(zoomIn, 480);

  await stage.caption("Or a high contrast palette, when that reads easier");
  const contrast = button("High contrast", true);
  await stage.tap(contrast, 900);
  await stage.tap(contrast, 300);
  await stage.hideCaption();
  stage.mark("appearance");

  await stage.card(outro, 5000);
  stage.mark("end");
});
