import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTsv } from "./tsv.ts";
import type { Kanji, Word } from "../../src/lib/content/types.ts";
import { countBySet, isSetId, SET_IDS } from "../../src/lib/content/sets.ts";

export { countBySet, isSetId, SET_IDS };

export const CONTENT_DIR = fileURLToPath(new URL("../../content/", import.meta.url));

export const KANJI_COLUMNS = ["character", "level"] as const;

export type KanjiRow = Pick<Kanji, "character" | "level">;

const HAN = /^\p{Script=Han}$/u;

export function isSingleKanji(cell: string): boolean {
  return [...cell].length === 1 && HAN.test(cell);
}

export function parseKanjiList(text: string, where: string): KanjiRow[] {
  const rows = parseTsv(text, KANJI_COLUMNS, where);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const kanji: KanjiRow[] = [];

  rows.forEach(([character, level], index) => {
    const line = index + 2;
    if (!isSingleKanji(character)) {
      problems.push(`${where} line ${line}: "${character}" is not exactly one kanji`);
      return;
    }
    if (level === "") {
      problems.push(`${where} line ${line}: "${character}" has no level`);
      return;
    }
    const first = seen.get(character);
    if (first !== undefined) {
      problems.push(`${where} line ${line}: "${character}" already appears on line ${first}`);
      return;
    }
    seen.set(character, line);
    kanji.push({ character, level });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return kanji;
}

export function loadKanjiList(level: string): KanjiRow[] {
  const where = `content/${level}-kanji.tsv`;
  return parseKanjiList(readFileSync(join(CONTENT_DIR, `${level}-kanji.tsv`), "utf8"), where);
}

export const COMPONENT_COLUMNS = ["character", "name"] as const;

export type ComponentRow = {
  character: string;
  name: string;
};

export function parseComponentList(text: string, where: string): ComponentRow[] {
  const rows = parseTsv(text, COMPONENT_COLUMNS, where);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const components: ComponentRow[] = [];

  rows.forEach(([character, name], index) => {
    const line = index + 2;
    if ([...character].length !== 1) {
      problems.push(`${where} line ${line}: "${character}" is not exactly one character`);
      return;
    }
    if (name === "") {
      problems.push(`${where} line ${line}: "${character}" has no name to justify teaching it`);
      return;
    }
    const first = seen.get(character);
    if (first !== undefined) {
      problems.push(`${where} line ${line}: "${character}" already appears on line ${first}`);
      return;
    }
    seen.set(character, line);
    components.push({ character, name });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return components;
}

export function loadComponentList(): ComponentRow[] {
  const where = "content/components.tsv";
  return parseComponentList(readFileSync(join(CONTENT_DIR, "components.tsv"), "utf8"), where);
}

export const BOUND_COLUMNS = ["written", "reading", "why"] as const;

export type BoundRow = {
  written: string;
  reading: string;
  why: string;
};

export function parseBoundReadings(text: string, where: string): BoundRow[] {
  const rows = parseTsv(text, BOUND_COLUMNS, where);
  const problems: string[] = [];
  const bound: BoundRow[] = [];

  rows.forEach(([written, reading, why], index) => {
    const line = index + 2;
    if (written === "" || reading === "") {
      problems.push(`${where} line ${line}: needs both a written form and a reading`);
      return;
    }
    if (why === "") {
      problems.push(`${where} line ${line}: "${written}" has no reason, so nobody can review it`);
      return;
    }
    bound.push({ written, reading, why });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return bound;
}

export function loadBoundReadings(): BoundRow[] {
  const where = "content/bound-readings.tsv";
  return parseBoundReadings(readFileSync(join(CONTENT_DIR, "bound-readings.tsv"), "utf8"), where);
}

export const WORD_COLUMNS = ["written", "reading", "set", "level", "note"] as const;

export type WordRow = Pick<Word, "written" | "reading" | "set" | "level"> & {
  note: string;
};

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

export function isKana(cell: string): boolean {
  return cell !== "" && KANA.test(cell);
}

export function kanjiIn(written: string): string[] {
  return [...new Set([...written].filter(isSingleKanji))];
}

export function wordId(written: string, reading: string): string {
  return `${written}|${reading}`;
}

export function parseWordList(
  text: string,
  where: string,
  levelKanji: ReadonlySet<string>,
  bound: readonly BoundRow[] = []
): WordRow[] {
  const rows = parseTsv(text, WORD_COLUMNS, where);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const words: WordRow[] = [];

  rows.forEach(([written, reading, set, level, note], index) => {
    const line = index + 2;
    const say = (message: string) => problems.push(`${where} line ${line}: ${message}`);

    if (written === "") {
      say("has no written form");
      return;
    }
    if (!isKana(reading)) {
      say(`"${written}" has reading "${reading}", which is not kana`);
      return;
    }
    const kanji = kanjiIn(written);
    const offLevel = kanji.filter((character) => !levelKanji.has(character));
    if (kanji.length === offLevel.length) {
      say(`"${written}" contains no kanji from the level list`);
      return;
    }
    if (!isSetId(set)) {
      say(`"${written}" names unknown set "${set}"`);
      return;
    }
    if (level === "") {
      say(`"${written}" has no level`);
      return;
    }
    const blocked = bound.find((entry) => entry.written === written && entry.reading === reading);
    if (blocked !== undefined) {
      say(`"${written}" (${reading}) is a bound reading, not a word — ${blocked.why}`);
      return;
    }
    const id = wordId(written, reading);
    const first = seen.get(id);
    if (first !== undefined) {
      say(`"${id}" already appears on line ${first}`);
      return;
    }
    seen.set(id, line);
    words.push({ written, reading, set, level, note });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return words;
}

export function loadWordList(level: string, levelKanji: ReadonlySet<string>): WordRow[] {
  const where = `content/${level}-words.tsv`;
  return parseWordList(
    readFileSync(join(CONTENT_DIR, `${level}-words.tsv`), "utf8"),
    where,
    levelKanji,
    loadBoundReadings()
  );
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const list = (body: string) => `character\tlevel\n${body}`;

  describe("isSingleKanji", () => {
    test("accepts a kanji in the basic block", () => {
      expect(isSingleKanji("日")).toBe(true);
    });

    test("counts a non-BMP ideograph as one character, not two halves", () => {
      const beyondBmp = "\u{20B9F}";
      expect(beyondBmp.length).toBe(2);
      expect(isSingleKanji(beyondBmp)).toBe(true);
    });

    test("rejects hiragana", () => {
      expect(isSingleKanji("ひ")).toBe(false);
    });

    test("rejects a latin letter of the right length", () => {
      expect(isSingleKanji("A")).toBe(false);
    });

    test("rejects two kanji in one cell", () => {
      expect(isSingleKanji("日本")).toBe(false);
    });

    test("rejects an empty cell", () => {
      expect(isSingleKanji("")).toBe(false);
    });
  });

  describe("parseKanjiList", () => {
    test("returns one row per kanji", () => {
      expect(parseKanjiList(list("日\tN5\n月\tN5\n"), "t")).toEqual([
        { character: "日", level: "N5" },
        { character: "月", level: "N5" }
      ]);
    });

    test("names both the line and the first sighting of a duplicate", () => {
      expect(() => parseKanjiList(list("日\tN5\n月\tN5\n日\tN5\n"), "t")).toThrow(
        /line 4: "日" already appears on line 2/
      );
    });

    test("rejects a cell holding a whole word", () => {
      expect(() => parseKanjiList(list("日本\tN5\n"), "t")).toThrow(
        /"日本" is not exactly one kanji/
      );
    });

    test("rejects a row with no level", () => {
      expect(() => parseKanjiList(list("日\t\n"), "t")).toThrow(/"日" has no level/);
    });

    test("reports every bad row at once rather than only the first", () => {
      expect(() => parseKanjiList(list("あ\tN5\nA\tN5\n"), "t")).toThrow(/あ[\s\S]*A/);
    });
  });

  describe("the committed N5 kanji list", () => {
    const kanji = loadKanjiList("n5");

    test("holds the 79 kanji of the reconstruction", () => {
      expect(kanji.length).toBe(79);
    });

    test("tags every row N5", () => {
      expect([...new Set(kanji.map((row) => row.level))]).toEqual(["N5"]);
    });
  });

  describe("kanjiIn", () => {
    test("returns the kanji of a mixed word in order", () => {
      expect(kanjiIn("食べ物")).toEqual(["食", "物"]);
    });

    test("returns each kanji once however often it repeats", () => {
      expect(kanjiIn("日曜日")).toEqual(["日", "曜"]);
    });

    test("returns nothing for a kana-only word", () => {
      expect(kanjiIn("とても")).toEqual([]);
    });
  });

  describe("isKana", () => {
    test("accepts hiragana", () => {
      expect(isKana("たべもの")).toBe(true);
    });

    test("accepts a long vowel mark", () => {
      expect(isKana("ラーメン")).toBe(true);
    });

    test("rejects a reading that leaked a kanji", () => {
      expect(isKana("食べもの")).toBe(false);
    });

    test("rejects an empty reading", () => {
      expect(isKana("")).toBe(false);
    });
  });

  describe("parseWordList", () => {
    const levelKanji = new Set(["日", "本", "食"]);
    const list = (body: string) => `written\treading\tset\tlevel\tnote\n${body}`;

    test("returns one row per word, keeping the curator's note", () => {
      expect(
        parseWordList(list("日本\tにほん\tplaces\tN5\tcountry\n"), "t", levelKanji)
      ).toEqual([
        { written: "日本", reading: "にほん", set: "places", level: "N5", note: "country" }
      ]);
    });

    test("accepts a word whose other kanji is outside the level list", () => {
      expect(parseWordList(list("食堂\tしょくどう\tplaces\tN5\t\n"), "t", levelKanji)).toHaveLength(1);
    });

    test("rejects a word built only from kanji outside the level list", () => {
      expect(() => parseWordList(list("銀行\tぎんこう\tplaces\tN5\t\n"), "t", levelKanji)).toThrow(
        /"銀行" contains no kanji from the level list/
      );
    });

    test("rejects a kana-only word, which has no form to test", () => {
      expect(() => parseWordList(list("とても\tとても\tdescribing\tN5\t\n"), "t", levelKanji)).toThrow(
        /contains no kanji from the level list/
      );
    });

    test("rejects an unknown set id", () => {
      expect(() => parseWordList(list("日本\tにほん\tcountries\tN5\t\n"), "t", levelKanji)).toThrow(
        /names unknown set "countries"/
      );
    });

    test("rejects a reading that is not kana", () => {
      expect(() => parseWordList(list("日本\t日本\tplaces\tN5\t\n"), "t", levelKanji)).toThrow(
        /is not kana/
      );
    });

    test("rejects two rows that would collide on one id", () => {
      expect(() =>
        parseWordList(list("日本\tにほん\tplaces\tN5\t\n日本\tにほん\tnature\tN5\t\n"), "t", levelKanji)
      ).toThrow(/"日本\|にほん" already appears on line 2/);
    });

    test("accepts the same written form under a second reading", () => {
      expect(
        parseWordList(list("日本\tにほん\tplaces\tN5\t\n日本\tにっぽん\tplaces\tN5\t\n"), "t", levelKanji)
      ).toHaveLength(2);
    });

    test("rejects a reading the curator marked bound, naming the reason", () => {
      const bound = [{ written: "本", reading: "ほん", why: "a counter, not a word" }];
      expect(() =>
        parseWordList(list("本\tほん\tplaces\tN5\t\n"), "t", levelKanji, bound)
      ).toThrow(/"本" \(ほん\) is a bound reading, not a word — a counter, not a word/);
    });

    test("leaves the same written form under another reading alone", () => {
      const bound = [{ written: "本", reading: "ほん", why: "a counter, not a word" }];
      expect(
        parseWordList(list("本\tもと\tplaces\tN5\t\n"), "t", levelKanji, bound)
      ).toHaveLength(1);
    });
  });

  describe("the committed bound reading list", () => {
    test("keeps 万 (まん) out of the word list, where it is not a word", () => {
      const bound = loadBoundReadings();
      expect(bound.some((row) => row.written === "万" && row.reading === "まん")).toBe(true);
      expect(bound.every((row) => row.why !== "")).toBe(true);
    });
  });

  describe("parseComponentList", () => {
    const list = (body: string) => `character\tname\n${body}`;

    test("keeps the curator's name as the rationale for teaching it", () => {
      expect(parseComponentList(list("日\tsun, day\n"), "t")).toEqual([
        { character: "日", name: "sun, day" }
      ]);
    });

    test("accepts a radical that is not itself a kanji", () => {
      expect(parseComponentList(list("｜\tvertical stroke\n"), "t")).toHaveLength(1);
    });

    test("rejects a component with no name, which records no rationale", () => {
      expect(() => parseComponentList(list("日\t\n"), "t")).toThrow(/has no name/);
    });

    test("rejects a cell holding two characters", () => {
      expect(() => parseComponentList(list("日月\tsun and moon\n"), "t")).toThrow(
        /not exactly one character/
      );
    });

    test("rejects a component listed twice", () => {
      expect(() => parseComponentList(list("日\tsun\n日\tday\n"), "t")).toThrow(
        /already appears on line 2/
      );
    });
  });

  describe("the committed component list", () => {
    test("names every component it teaches", () => {
      const components = loadComponentList();
      expect(components.length).toBe(30);
      expect(components.every((row) => row.name !== "")).toBe(true);
    });
  });

  describe("the committed N5 word list", () => {
    const levelKanji = new Set(loadKanjiList("n5").map((row) => row.character));
    const words = loadWordList("n5", levelKanji);
    const sizes = countBySet(words);

    test("parses every row against the committed kanji list", () => {
      expect(words.length).toBe(185);
    });

    test("holds the set sizes the curator last agreed to", () => {
      expect(sizes).toEqual({
        numbers: 23,
        calendar: 34,
        time: 10,
        people: 14,
        position: 14,
        body: 0,
        actions: 16,
        places: 21,
        nature: 8,
        describing: 24,
        irregulars: 21
      });
    });

    test("accounts for every word in exactly one set", () => {
      expect(SET_IDS.reduce((total, id) => total + sizes[id], 0)).toBe(words.length);
    });

    test("tags every row N5", () => {
      expect([...new Set(words.map((row) => row.level))]).toEqual(["N5"]);
    });
  });
}
