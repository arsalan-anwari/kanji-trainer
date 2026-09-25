import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTsv } from "./tsv.ts";
import type { Kanji, Word } from "../../src/lib/content/types.ts";
import {
  countBySet,
  isSetId,
  isSubcategoryOf,
  SET_IDS,
  SUBCATEGORIES
} from "../../src/lib/content/sets.ts";

export { countBySet, isSetId, isSubcategoryOf, SET_IDS, SUBCATEGORIES };

export const OVERLAY_DIR = fileURLToPath(new URL("../../data/overlay/", import.meta.url));

export const SHARED_DIR = join(OVERLAY_DIR, "shared");

export function packSource(pack: string): string {
  return join(OVERLAY_DIR, "packs", pack);
}

export function missingOverlay(path: string): Error {
  return new Error(`${path} is missing. data/ is not in git: run "scripts/sync_data.sh --download" after a clone.`);
}

export function readOverlay(path: string): string {
  if (!existsSync(path)) throw missingOverlay(path);
  return readFileSync(path, "utf8");
}

export const KANJI_COLUMNS = ["character", "level", "look"] as const;

export type KanjiRow = Pick<Kanji, "character" | "level" | "look">;

const HAN = /^\p{Script=Han}$/u;

export function isSingleKanji(cell: string): boolean {
  return [...cell].length === 1 && HAN.test(cell);
}

export function parseKanjiList(text: string, where: string): KanjiRow[] {
  const rows = parseTsv(text, KANJI_COLUMNS, where);
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const kanji: KanjiRow[] = [];

  rows.forEach(([character, level, look], index) => {
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
    kanji.push({ character, level, look });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return kanji;
}

export function loadKanjiList(pack: string): KanjiRow[] {
  const where = `data/overlay/packs/${pack}/kanji.tsv`;
  return parseKanjiList(readOverlay(join(packSource(pack), "kanji.tsv")), where);
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
  const where = "data/overlay/shared/components.tsv";
  return parseComponentList(readOverlay(join(SHARED_DIR, "components.tsv")), where);
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
  const where = "data/overlay/shared/bound-readings.tsv";
  return parseBoundReadings(readOverlay(join(SHARED_DIR, "bound-readings.tsv")), where);
}

export const WORD_COLUMNS = [
  "written",
  "reading",
  "set",
  "subcategory",
  "level",
  "meaning",
  "file",
  "clue",
  "note"
] as const;

export type WordRow = Pick<Word, "written" | "reading" | "set" | "subcategory" | "level" | "clue"> & {
  meaning: string;
  file: string;
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

/** Lowercase letters and digits in dash-joined runs: safe as a path segment on every platform. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  const named = new Map<string, number>();
  const words: WordRow[] = [];

  rows.forEach(([written, reading, set, subcategory, level, meaning, file, clue, note], index) => {
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
    if (!SLUG.test(file)) {
      const hint = meaning === "" ? "" : `, e.g. "${slugOf(meaning)}"`;
      say(`"${written}" has file "${file}", which must be lowercase letters, digits and dashes${hint}`);
      return;
    }
    if (!isSetId(set)) {
      say(`"${written}" names unknown set "${set}"`);
      return;
    }
    if (!isSubcategoryOf(set, subcategory)) {
      say(
        `"${written}" names subcategory "${subcategory}", which is not one of ${set}: ${SUBCATEGORIES[set].join(", ")}`
      );
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
    const other = named.get(file);
    if (other !== undefined) {
      say(`"${written}" has file "${file}", already used on line ${other}`);
      return;
    }
    seen.set(id, line);
    named.set(file, line);
    words.push({ written, reading, set, subcategory, level, meaning, file, clue, note });
  });

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return words;
}

export function loadWordList(pack: string, levelKanji: ReadonlySet<string>): WordRow[] {
  const where = `data/overlay/packs/${pack}/words.tsv`;
  return parseWordList(
    readOverlay(join(packSource(pack), "words.tsv")),
    where,
    levelKanji,
    loadBoundReadings()
  );
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const list = (body: string) => `character\tlevel\tlook\n${body}`;

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
      expect(parseKanjiList(list("日\tN5\t\n月\tN5\t\n"), "t")).toEqual([
        { character: "日", level: "N5", look: "" },
        { character: "月", level: "N5", look: "" }
      ]);
    });

    test("names both the line and the first sighting of a duplicate", () => {
      expect(() => parseKanjiList(list("日\tN5\t\n月\tN5\t\n日\tN5\t\n"), "t")).toThrow(
        /line 4: "日" already appears on line 2/
      );
    });

    test("rejects a cell holding a whole word", () => {
      expect(() => parseKanjiList(list("日本\tN5\t\n"), "t")).toThrow(
        /"日本" is not exactly one kanji/
      );
    });

    test("rejects a row with no level", () => {
      expect(() => parseKanjiList(list("日\t\t\n"), "t")).toThrow(/"日" has no level/);
    });

    test("reports every bad row at once rather than only the first", () => {
      expect(() => parseKanjiList(list("あ\tN5\t\nA\tN5\t\n"), "t")).toThrow(/あ[\s\S]*A/);
    });
  });

  describe("the committed N5 kanji list", () => {
    const kanji = loadKanjiList("n5-base");

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
    const list = (body: string) =>
      `written\treading\tset\tsubcategory\tlevel\tmeaning\tfile\tclue\tnote\n${body}`;

    test("returns one row per word, keeping the curator's note", () => {
      expect(
        parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\t\tw1\t\tcountry\n"), "t", levelKanji)
      ).toEqual([
        {
          written: "日本",
          reading: "にほん",
          set: "places",
          subcategory: "buildings",
          level: "N5",
          meaning: "",
          file: "w1",
          clue: "",
          note: "country"
        }
      ]);
    });

    test("accepts a word whose other kanji is outside the level list", () => {
      expect(parseWordList(list("食堂\tしょくどう\tplaces\tbuildings\tN5\t\tw2\t\t\n"), "t", levelKanji)).toHaveLength(1);
    });

    test("rejects a word built only from kanji outside the level list", () => {
      expect(() => parseWordList(list("銀行\tぎんこう\tplaces\tbuildings\tN5\t\tw3\t\t\n"), "t", levelKanji)).toThrow(
        /"銀行" contains no kanji from the level list/
      );
    });

    test("rejects a kana-only word, which has no form to test", () => {
      expect(() => parseWordList(list("とても\tとても\tdescribing\tsize\tN5\t\tw4\t\t\n"), "t", levelKanji)).toThrow(
        /contains no kanji from the level list/
      );
    });

    test("rejects an unknown set id", () => {
      expect(() => parseWordList(list("日本\tにほん\tcountries\tbuildings\tN5\t\tw5\t\t\n"), "t", levelKanji)).toThrow(
        /names unknown set "countries"/
      );
    });

    test("rejects a subcategory that belongs to another set", () => {
      expect(() =>
        parseWordList(list("日本\tにほん\tplaces\tweather\tN5\t\tw6\t\t\n"), "t", levelKanji)
      ).toThrow(/names subcategory "weather", which is not one of places/);
    });

    test("rejects a reading that is not kana", () => {
      expect(() => parseWordList(list("日本\t日本\tplaces\tbuildings\tN5\t\tw7\t\t\n"), "t", levelKanji)).toThrow(
        /is not kana/
      );
    });

    test("rejects two rows that would collide on one id", () => {
      expect(() =>
        parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\t\tw8\t\t\n日本\tにほん\tnature\tlandscape\tN5\t\tw9\t\t\n"), "t", levelKanji)
      ).toThrow(/"日本\|にほん" already appears on line 2/);
    });

    test("carries the curator's meaning override when the column is filled", () => {
      const [row] = parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\tJapan\tw10\t\t\n"), "t", levelKanji);
      expect(row.meaning).toBe("Japan");
    });

    test("accepts the same written form under a second reading", () => {
      expect(
        parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\t\tw11\t\t\n日本\tにっぽん\tplaces\tbuildings\tN5\t\tw12\t\t\n"), "t", levelKanji)
      ).toHaveLength(2);
    });

    test("rejects a reading the curator marked bound, naming the reason", () => {
      const bound = [{ written: "本", reading: "ほん", why: "a counter, not a word" }];
      expect(() =>
        parseWordList(list("本\tほん\tplaces\tbuildings\tN5\t\tw13\t\t\n"), "t", levelKanji, bound)
      ).toThrow(/"本" \(ほん\) is a bound reading, not a word — a counter, not a word/);
    });

    test("refuses a file name that is not a plain slug, suggesting one", () => {
      expect(() =>
        parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\tJapan\t\t\t\n"), "t", levelKanji)
      ).toThrow(/has file "", which must be lowercase letters, digits and dashes, e.g. "japan"/);
      expect(() =>
        parseWordList(list("日本\tにほん\tplaces\tbuildings\tN5\t\tJapan.png\t\t\n"), "t", levelKanji)
      ).toThrow(/has file "Japan.png"/);
    });

    test("refuses two words of one pack sharing a file, whatever their subcategory", () => {
      expect(() =>
        parseWordList(
          list("日本\tにほん\tplaces\tbuildings\tN5\t\tsame\t\t\n食堂\tしょくどう\tfood\tgeneral\tN5\t\tsame\t\t\n"),
          "t",
          levelKanji
        )
      ).toThrow(/"食堂" has file "same", already used on line 2/);
    });

    test("slugs a label the way the media files are named", () => {
      expect(slugOf("10,000")).toBe("10-000");
      expect(slugOf("big, before a noun")).toBe("big-before-a-noun");
    });

    test("leaves the same written form under another reading alone", () => {
      const bound = [{ written: "本", reading: "ほん", why: "a counter, not a word" }];
      expect(
        parseWordList(list("本\tもと\tplaces\tbuildings\tN5\t\tw14\t\t\n"), "t", levelKanji, bound)
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
      expect(components.length).toBe(126);
      expect(components.every((row) => row.name !== "")).toBe(true);
    });
  });

  describe("the committed N5 word list", () => {
    const levelKanji = new Set(loadKanjiList("n5-base").map((row) => row.character));
    const words = loadWordList("n5-base", levelKanji);
    const sizes = countBySet(words);

    test("parses every row against the committed kanji list", () => {
      expect(words.length).toBe(197);
    });

    test("holds the set sizes the curator last agreed to", () => {
      expect(sizes).toEqual({
        numbers: 23,
        calendar: 55,
        time: 12,
        people: 19,
        position: 14,
        body: 0,
        actions: 19,
        places: 19,
        nature: 6,
        describing: 18,
        objects: 10,
        food: 2
      });
    });

    test("files every word under a subcategory of its own set", () => {
      expect(words.filter((row) => !isSubcategoryOf(row.set, row.subcategory))).toEqual([]);
    });

    test("accounts for every word in exactly one set", () => {
      expect(SET_IDS.reduce((total, id) => total + sizes[id], 0)).toBe(words.length);
    });

    test("tags every row N5", () => {
      expect([...new Set(words.map((row) => row.level))]).toEqual(["N5"]);
    });
  });
}
