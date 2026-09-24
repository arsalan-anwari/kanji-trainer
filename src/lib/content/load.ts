import { isSetId, isSubcategoryOf } from "./sets";
import type { Content, Kanji, ReadingClass, Source, Word } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function textList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    const one = text(entry);
    if (one === null) return null;
    out.push(one);
  }
  return out;
}

function list<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const entry of value) {
    const one = parse(entry);
    if (one === null) return null;
    out.push(one);
  }
  return out;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseReadingClass(value: unknown): ReadingClass | null {
  return value === "on" || value === "kun" ? value : null;
}

function parseWord(value: unknown): Word | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const written = text(value.written);
  const reading = text(value.reading);
  const readings = textList(value.readings);
  const glosses = textList(value.glosses);
  const meaning = text(value.meaning);
  const kanji = textList(value.kanji);
  const set = text(value.set);
  const subcategory = text(value.subcategory);
  const level = text(value.level);
  const pack = text(value.pack);
  const file = text(value.file);
  if (pack === null || file === null) return null;
  if (id === null || written === null || reading === null || meaning === null) return null;
  if (glosses === null || glosses.length === 0) return null;
  if (readings === null || !readings.includes(reading)) return null;
  if (kanji === null || set === null || level === null || !isSetId(set)) return null;
  if (subcategory === null || !isSubcategoryOf(set, subcategory)) return null;
  const readingClass = parseReadingClass(value.readingClass);
  const kanjiCount = (kanji.length >= 2 ? 2 : 1) as 1 | 2;
  const hasOkurigana = written.length > kanji.length;
  return {
    id,
    written,
    reading,
    readings,
    ...(readingClass === null ? {} : { readingClass }),
    glosses,
    meaning,
    clue: optionalText(value.clue),
    kanji,
    kanjiCount,
    hasOkurigana,
    hasAudio: value.hasAudio === true,
    set,
    subcategory,
    level,
    pack,
    file
  };
}

function parseKanji(value: unknown): Kanji | null {
  if (!isRecord(value)) return null;
  const character = text(value.character);
  const level = text(value.level);
  const components = textList(value.components);
  const on = textList(value.on);
  const kun = textList(value.kun);
  if (character === null || level === null || components === null) return null;
  if (on === null || kun === null) return null;
  return { character, level, look: optionalText(value.look), components, on, kun };
}

function parseSource(value: unknown): Source | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.title);
  const url = text(value.url);
  const licence = text(value.licence);
  const licenceUrl = text(value.licenceUrl);
  const version = text(value.version);
  if (id === null || title === null || url === null) return null;
  if (licence === null || licenceUrl === null || version === null) return null;
  return { id, title, url, licence, licenceUrl, version };
}

export function parseContent(value: unknown): Content | null {
  if (!isRecord(value)) return null;
  const level = text(value.level);
  const generated = text(value.generated);
  const sources = list(value.sources, parseSource);
  const kanji = list(value.kanji, parseKanji);
  const words = list(value.words, parseWord);
  const taughtComponents = textList(value.taughtComponents);
  if (level === null || generated === null || sources === null) return null;
  if (kanji === null || words === null || taughtComponents === null) return null;
  if (words.length === 0) return null;
  return { level, generated, sources, kanji, words, taughtComponents };
}

function firstBy<T>(lists: readonly (readonly T[])[], key: (item: T) => string): T[] {
  const kept = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (!kept.has(key(item))) kept.set(key(item), item);
    }
  }
  return [...kept.values()];
}

export function mergeContents(contents: readonly Content[]): { words: Word[]; kanji: Kanji[] } {
  return {
    words: firstBy(
      contents.map((content) => content.words),
      (word) => word.id
    ),
    kanji: firstBy(
      contents.map((content) => content.kanji),
      (entry) => entry.character
    )
  };
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const word = {
    id: "一|いち",
    written: "一",
    reading: "いち",
    readings: ["いち"],
    readingClass: "on",
    glosses: ["one", "best"],
    meaning: "one",
    clue: "",
    kanji: ["一"],
    kanjiCount: 1 as const,
    hasOkurigana: false,
    hasAudio: true,
    set: "numbers",
    subcategory: "digits",
    level: "N5",
    pack: "n5-base",
    file: "one"
  };
  const payload = {
    level: "N5",
    generated: "2026-09-19",
    sources: [],
    kanji: [
      { character: "一", level: "N5", look: "", components: ["一"], on: ["イチ"], kun: ["ひと.つ"] }
    ],
    words: [word],
    taughtComponents: ["一"]
  };

  describe("parsing a content payload", () => {
    test("accepts a well formed payload", () => {
      expect(parseContent(payload)?.words[0].reading).toBe("いち");
    });

    test("rejects anything that is not an object", () => {
      expect(parseContent(null)).toBeNull();
      expect(parseContent("N5")).toBeNull();
      expect(parseContent([payload])).toBeNull();
    });

    test("rejects a payload with no words", () => {
      expect(parseContent({ ...payload, words: [] })).toBeNull();
    });

    test("rejects a word tagged with a set the app does not know", () => {
      expect(parseContent({ ...payload, words: [{ ...word, set: "kitchen" }] })).toBeNull();
    });

    test("rejects a word whose subcategory belongs to another set", () => {
      expect(parseContent({ ...payload, words: [{ ...word, subcategory: "weather" }] })).toBeNull();
    });

    test("keeps every accepted reading and the class of the pinned one", () => {
      const parsed = parseContent(payload)?.words[0];
      expect(parsed?.readings).toEqual(["いち"]);
      expect(parsed?.readingClass).toBe("on");
    });

    test("rejects a word whose accepted readings leave out the pinned one", () => {
      expect(parseContent({ ...payload, words: [{ ...word, readings: ["ひとつ"] }] })).toBeNull();
    });

    test("drops a reading class that is neither on nor kun", () => {
      const odd = { ...payload, words: [{ ...word, readingClass: "gikun" }] };
      expect(parseContent(odd)?.words[0].readingClass).toBeUndefined();
    });

    test("keeps every sense as its own entry alongside the one label", () => {
      const parsed = parseContent(payload)?.words[0];
      expect(parsed?.glosses).toEqual(["one", "best"]);
      expect(parsed?.meaning).toBe("one");
    });

    test("rejects a word with no gloss to justify its label", () => {
      expect(parseContent({ ...payload, words: [{ ...word, glosses: [] }] })).toBeNull();
    });

    test("rejects a word missing a reading", () => {
      const { reading, ...rest } = word;
      expect(reading).toBe("いち");
      expect(parseContent({ ...payload, words: [rest] })).toBeNull();
    });

    test("rejects a kanji list holding something other than strings", () => {
      expect(parseContent({ ...payload, words: [{ ...word, kanji: [1] }] })).toBeNull();
    });
  });

  describe("merging the enabled packs", () => {
    const base = parseContent(payload);
    const extra = parseContent({
      ...payload,
      words: [word, { ...word, id: "二|に", written: "二", reading: "に", readings: ["に"], meaning: "two", pack: "n5-food" }],
      kanji: [{ character: "一", level: "N5", look: "later", components: ["一"], on: [], kun: [] }]
    });

    test("puts every pack's words side by side, each word once", () => {
      if (base === null || extra === null) throw new Error("fixtures must parse");
      expect(mergeContents([base, extra]).words.map((entry) => entry.id)).toEqual(["一|いち", "二|に"]);
    });

    test("keeps the first pack's entry for a kanji two packs teach", () => {
      if (base === null || extra === null) throw new Error("fixtures must parse");
      const { kanji } = mergeContents([base, extra]);
      expect(kanji).toHaveLength(1);
      expect(kanji[0]?.look).toBe("");
    });

    test("holds nothing when no pack is enabled", () => {
      expect(mergeContents([])).toEqual({ words: [], kanji: [] });
    });
  });

  describe("the committed N5 content file", () => {
    test("parses as content the app can run on", async () => {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(new URL("../../../data/packs/n5-base/content.json", import.meta.url), "utf8");
      const content = parseContent(JSON.parse(raw));
      expect(content?.level).toBe("N5");
      expect(content?.words).toHaveLength(184);
      expect(content?.kanji).toHaveLength(79);
    });
  });
}
