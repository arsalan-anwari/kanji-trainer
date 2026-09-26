import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Part, Word } from "../../src/lib/content/types";

export type ShowcaseInit = {
  randomSeed: number;
  clockStart: number;
};

declare global {
  interface Window {
    __showcase: { advance: (ms: number) => void };
    __heard: string;
  }
}

// Remembers the path of the last clip played. The app fetches a clip, keeps it
// as a blob url and plays that, so the path is carried from fetch to play.
export function installClipTap(): void {
  const paths = new WeakMap<Blob, string>();
  const urls = new Map<string, string>();
  window.__heard = "";

  const fetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await fetch(input, init);
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!path.includes("/audio/")) return response;
    const blob = response.blob.bind(response);
    response.blob = async () => {
      const value = await blob();
      paths.set(value, path);
      return value;
    };
    return response;
  };

  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    const url = create(object);
    const path = object instanceof Blob ? paths.get(object) : undefined;
    if (path !== undefined) urls.set(url, path);
    return url;
  };

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    window.__heard = urls.get(this.src) ?? this.src;
    return play.call(this);
  };
}

export function installShowcase(init: ShowcaseInit): void {
  let state = init.randomSeed;
  Math.random = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let current = init.clockStart;
  const RealDate = Date;
  window.Date = new Proxy(RealDate, {
    construct: (target, args: unknown[]) =>
      args.length === 0
        ? new target(current)
        : new (target as unknown as new (...rest: unknown[]) => Date)(...args),
    get: (target, property) =>
      property === "now" ? () => current : Reflect.get(target, property)
  }) as DateConstructor;

  window.__showcase = {
    advance: (ms) => {
      current += ms;
    }
  };

  const css = `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    html { scroll-behavior: auto !important; }
  `;

  const paint = (): void => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
}

export class Showcase {
  private taken = 0;

  constructor(
    private readonly page: Page,
    private readonly dir: string
  ) {}

  async advance(ms: number): Promise<void> {
    await this.page.evaluate((value) => window.__showcase.advance(value), ms);
  }

  async top(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  async reveal(target: Locator, offset = 20): Promise<void> {
    await target.first().evaluate((element, gap) => {
      const header = document.querySelector<HTMLElement>(".scrim")?.offsetHeight ?? 0;
      const box = element.getBoundingClientRect();
      if (box.top >= header && box.bottom <= window.innerHeight) return;
      window.scrollTo(0, Math.max(0, window.scrollY + box.top - header - gap));
    }, offset);
  }

  async settle(): Promise<void> {
    await this.page.waitForLoadState("networkidle").catch(() => undefined);
    await this.page.evaluate(() => document.fonts.ready);
    await this.page
      .waitForFunction(() => [...document.images].every((image) => image.complete))
      .catch(() => undefined);
    let previous = "";
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const current = await this.page.evaluate(() => document.body.innerHTML);
      if (current === previous) return;
      previous = current;
      await this.page.waitForTimeout(150);
    }
  }

  async shot(name: string): Promise<void> {
    await this.settle();
    await this.snap(name);
  }

  async snap(name: string, animations: "disabled" | "allow" = "disabled"): Promise<void> {
    await this.page.screenshot({
      path: `${this.dir}/${name}.png`,
      animations,
      caret: "hide"
    });
    this.taken += 1;
    console.log(`  ${name}.png`);
  }

  get count(): number {
    return this.taken;
  }
}

// Every word of every pack, so the right answer can be looked up from what the
// prompt shows.
const packs = fileURLToPath(new URL("../../data/packs/", import.meta.url));
const ids: string[] = JSON.parse(readFileSync(`${packs}index.json`, "utf8"));
const contents: { words: Word[]; parts: Record<string, Part[]> }[] = ids.map((id) =>
  JSON.parse(readFileSync(`${packs}${id}/content.json`, "utf8"))
);
const words = contents.flatMap((content) => content.words);
const parts = new Map(contents.flatMap((content) => Object.entries(content.parts)));

// A word's picture and recording share one path under the pack.
const isAssetOf = (path: string, word: Word): boolean =>
  path.includes(`/${word.pack}/`) && path.includes(`/${word.set}/${word.subcategory}/${word.file}.`);

export async function forgetHeard(page: Page): Promise<void> {
  await page.evaluate(() => (window.__heard = ""));
}

async function heard(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__heard !== "");
  return page.evaluate(() => {
    const path = window.__heard;
    window.__heard = "";
    return path;
  });
}

const answers = (page: Page): Locator =>
  page.getByRole("group", { name: "Answers" }).getByRole("button");

export async function answering(page: Page): Promise<void> {
  await expect(answers(page).first()).toBeEnabled();
}

// The words a prompt can stand for: a picture and a recording by their path,
// text by what it reads. A recording is only known once it has played, which
// needs installClipTap.
async function prompted(page: Page): Promise<Word[]> {
  const picture = page.locator("main img[alt='A picture illustrating the word']");
  if (await picture.count()) {
    const src = (await picture.first().getAttribute("src")) ?? "";
    return words.filter((word) => isAssetOf(src, word));
  }
  const board = page.locator("main .board").first();
  if (!(await board.count())) {
    const path = await heard(page);
    return words.filter((word) => isAssetOf(path, word));
  }
  const text = (await board.innerText()).replace(/\s+/g, "");
  return words.filter(
    (word) => word.written === text || word.reading === text || word.meaning.replace(/\s+/g, "") === text
  );
}

async function tileLabels(page: Page): Promise<string[]> {
  const texts = await answers(page).allInnerTexts();
  return texts.map((text) => text.trim().split("\n").slice(1).join(" ").trim());
}

export async function rightSlot(page: Page): Promise<number> {
  const matches = await prompted(page);
  const labels = await tileLabels(page);
  const slot = labels.findIndex((label) =>
    matches.some((word) => [word.written, word.reading, word.meaning].includes(label))
  );
  return Math.max(0, slot);
}

// The recording tile that plays the prompted word, found by playing each in
// turn through `tap`.
export async function rightRecording(
  page: Page,
  tap: (target: Locator) => Promise<void>
): Promise<void> {
  const matches = await prompted(page);
  await forgetHeard(page);
  for (let slot = 1; slot <= 4; slot += 1) {
    await tap(page.getByRole("button", { name: `Recording ${slot}`, exact: true }));
    const path = await heard(page);
    if (matches.some((word) => isAssetOf(path, word))) return;
  }
}

// The blocks that build the prompted word, in slot order: each character's
// parts, or the character itself for kana.
export async function blocksInOrder(page: Page): Promise<Locator[]> {
  const [word] = await prompted(page);
  if (word === undefined) return [];
  const pile = page.getByRole("group", { name: "Blocks" });
  return [...word.written]
    .flatMap((character) => parts.get(character)?.map((part) => part.element) ?? [character])
    .map((element) => pile.locator(`[aria-label="${element}"], [aria-label^="${element},"]`).first());
}

export async function answerChoice(page: Page, correct: boolean): Promise<void> {
  await answering(page);
  const right = await rightSlot(page);
  await answers(page).nth(correct ? right : (right + 1) % 4).click();
}

// Moves past the verdict of the question just answered. A right answer moves
// on by itself, a wrong one waits for Continue.
export async function moveOn(page: Page, question: number, total: number): Promise<void> {
  const last = question === total;
  const wrong = page.getByText("Wrong", { exact: true });
  const moved = last ? page.getByText("Run finished").or(splash(page)) : page.getByText(`${question + 1} / ${total}`);
  await expect(wrong.or(moved).first()).toBeVisible();
  if (!(await wrong.isVisible())) return;
  await page.getByRole("button", { name: last ? "See the score" : "Continue" }).click();
}

export async function quitRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Quit", exact: true }).first().click();
  await confirmQuit(page);
}

export async function confirmQuit(page: Page): Promise<void> {
  await page.getByLabel("Quit this run?").getByRole("button", { name: "Quit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
}

// Picks a question format: its category, then a direction inside it.
export async function pickFormat(page: Page, category: string, direction?: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${category}`) }).first().click();
  if (direction !== undefined) {
    await page.getByRole("button", { name: new RegExp(`^${direction}`) }).first().click();
  }
}

export function splash(page: Page): Locator {
  return page.getByText("Tap anywhere to skip");
}
