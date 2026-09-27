import { expect, moveOn, test } from "./run";
import type { Page } from "@playwright/test";

// The sets holding the longest meanings and the longest kana words.
const RUNS = [
  { format: "kana-meaning", sets: ["expressions"] },
  { format: "meaning-kana", sets: ["expressions"] },
  { format: "kanji-meaning", sets: ["clothing", "leisure"] },
  { format: "meaning-kanji", sets: ["clothing", "leisure"] }
];

// Text that spills out of the box it is drawn in, or a prompt shrunk past
// reading on its board.
async function misfits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const check = (text: HTMLElement | null, box: Element | null): void => {
      if (text === null || box === null) {
        out.push("missing");
        return;
      }
      // Across from the glyphs, which spill past an element's own box. Down
      // from the line boxes: a Japanese face draws its content area well past
      // a tight line height, though its ink stays inside.
      const range = document.createRange();
      range.selectNodeContents(text);
      const glyphs = range.getBoundingClientRect();
      const top = text.getBoundingClientRect().top;
      const outer = box.getBoundingClientRect();
      if (
        glyphs.left < outer.left - 1 ||
        glyphs.right > outer.right + 1 ||
        top < outer.top - 1 ||
        top + text.offsetHeight > outer.bottom + 1
      ) {
        out.push(`spilled: ${text.textContent}`);
      }
    };
    for (const tile of document.querySelectorAll("[role='group'][aria-label='Answers'] button")) {
      check(tile.querySelector<HTMLElement>(":scope > span:last-child"), tile);
    }
    const guide = document.querySelector(".board-guide");
    const prompt = document.querySelector<HTMLElement>(".board-guide ~ div > span");
    check(prompt, guide);
    // Even the longest greeting, wrapped, stands a tenth of the guide tall.
    if (prompt !== null && guide !== null) {
      const size = parseFloat(getComputedStyle(prompt).fontSize);
      if (size < guide.clientWidth / 10) out.push(`tiny: ${prompt.textContent} at ${size}px`);
    }
    return out;
  });
}

for (const run of RUNS) {
  test(`keeps every ${run.format} prompt and answer inside its box`, async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem("kanji-trainer-disabled-packs", JSON.stringify([]));
      localStorage.setItem(
        "kanji-trainer-settings",
        JSON.stringify({ level: "N5", taxonomy: 1, questionCount: 10, ...settings })
      );
    }, run);
    await page.goto("/");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();

    const choices = page.getByRole("group", { name: "Answers" }).getByRole("button");
    for (let question = 1; question <= 10; question += 1) {
      await expect(page.getByText(`${question} / 10`)).toBeVisible();
      await expect(choices).toHaveCount(4);
      await page.evaluate(() => document.fonts.ready);
      expect(await misfits(page)).toEqual([]);
      await choices.first().click();
      await moveOn(page, question, 10);
    }
  });
}
