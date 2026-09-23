import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAttribution, renderLicence } from "./attribution.ts";
import { CACHE_DIR } from "./fetch.ts";
import { acceptedReadings, indexByWrittenForm, isMatch, lookupWord, parseJmdict } from "./jmdict.ts";
import { parseKanjidic, readingClassOf } from "./kanjidic.ts";
import { componentFrequency, decompose, parseKradfile } from "./kradfile.ts";
import { loadManifest } from "./sources.ts";
import {
  countBySet,
  kanjiIn,
  loadComponentList,
  loadKanjiList,
  loadWordList,
  SET_IDS,
  wordId
} from "./validate.ts";
import type { Lookup } from "./jmdict.ts";
import type { Kanjidic } from "./kanjidic.ts";
import type { Kradfile } from "./kradfile.ts";
import type { ComponentRow, KanjiRow, WordRow } from "./validate.ts";
import type { Content, Kanji, Source, Word } from "../../src/lib/content/types.ts";
import { audioUrl } from "../../src/lib/quiz/hints.ts";

export function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const OUTPUT_DIR = fileURLToPath(new URL("../../data/content/", import.meta.url));

export const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

export function clipExists(word: Word): boolean {
  return existsSync(join(DATA_DIR, audioUrl(word)));
}

/** Hand-curated media under content/ that is laid over data/ on every build. */
export const OVERRIDE_DIRS = ["audio", "images"];

export function applyOverrides(): void {
  const content = fileURLToPath(new URL("../../content/", import.meta.url));
  for (const dir of OVERRIDE_DIRS) {
    if (existsSync(join(content, dir))) cpSync(join(content, dir), join(DATA_DIR, dir), { recursive: true });
  }
}

const LEVEL = "n5";

export function readCached(name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, name), "utf8"));
  } catch {
    throw new Error(`${name} is not in .cache/content — run "npm run content:fetch" first`);
  }
}

const NO_READINGS = { on: [], kun: [] };

export const MEANING_LIMIT = 24;

export function clueNames(clue: string, meaning: string): boolean {
  const escaped = meaning.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(clue);
}

export function shortGloss(gloss: string): string {
  return gloss
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWords(
  rows: readonly WordRow[],
  index: Lookup,
  levelKanji: ReadonlySet<string>,
  kanjidic: Kanjidic = new Map(),
  hasClip: (word: Word) => boolean = () => false
): Word[] {
  const problems: string[] = [];
  const words: Word[] = [];
  const labelled = new Map<string, string>();

  rows.forEach((row, position) => {
    const where = `content/base/${row.level.toLowerCase()}/${row.level.toLowerCase()}-words.tsv row ${position + 1}`;
    const result = lookupWord(index, row.written, row.reading);
    if (!isMatch(result)) {
      problems.push(`${where}: ${row.written} (${row.reading}) — ${result.detail}`);
      return;
    }
    const characters = [...row.written];
    // Only a one-character word has a single reading class: a compound is read
    // as a whole, and 大学 is neither an on word nor a kun word.
    const readingClass =
      characters.length === 1
        ? readingClassOf(kanjidic.get(row.written) ?? NO_READINGS, row.reading)
        : null;
    const kanji = kanjiIn(row.written).filter((character) => levelKanji.has(character));
    const kanjiCount = (kanji.length >= 2 ? 2 : 1) as 1 | 2;
    const hasOkurigana = row.written.length > kanji.length;
    const meaning = row.meaning === "" ? shortGloss(result.glosses[0]) : row.meaning;
    const label = `${row.level}|${meaning}`;
    const twin = labelled.get(label);
    if (meaning === "") {
      problems.push(`${where}: ${row.written} (${row.reading}) has no meaning to label it with`);
      return;
    }
    if (meaning.length > MEANING_LIMIT) {
      problems.push(
        `${where}: ${row.written} (${row.reading}) is labelled "${meaning}", ${meaning.length} characters — shorten it to ${MEANING_LIMIT} in the meaning column`
      );
      return;
    }
    if (twin !== undefined) {
      problems.push(
        `${where}: ${row.written} (${row.reading}) and ${twin} both mean "${meaning}" — give one of them its own meaning column`
      );
      return;
    }
    if (clueNames(row.clue, meaning)) {
      problems.push(
        `${where}: ${row.written} (${row.reading}) has a clue that says "${meaning}", which is the answer it is meant to hint at`
      );
      return;
    }
    labelled.set(label, `${row.written} (${row.reading})`);

    const word: Word = {
      id: wordId(row.written, row.reading),
      written: row.written,
      reading: row.reading,
      readings: acceptedReadings(result.entry, row.written, row.reading),
      ...(readingClass === null ? {} : { readingClass }),
      glosses: result.glosses,
      meaning,
      clue: row.clue,
      kanji,
      kanjiCount,
      hasOkurigana,
      hasAudio: false,
      set: row.set,
      subcategory: row.subcategory,
      level: row.level
    };
    words.push({ ...word, hasAudio: hasClip(word) });
  });

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} curated row(s) did not build:\n${problems.join("\n")}`
    );
  }
  return words;
}

export function buildKanji(
  rows: readonly KanjiRow[],
  kradfile: Kradfile,
  kanjidic: Kanjidic = new Map()
): Kanji[] {
  const problems: string[] = [];
  const kanji: Kanji[] = [];

  for (const row of rows) {
    const components = decompose(kradfile, row.character);
    if (components.length === 0) {
      problems.push(`KRADFILE decomposes "${row.character}" into nothing`);
      continue;
    }
    const readings = kanjidic.get(row.character);
    if (readings === undefined) {
      problems.push(`KANJIDIC2 has no entry for "${row.character}"`);
      continue;
    }
    kanji.push({
      character: row.character,
      level: row.level,
      look: row.look,
      components,
      on: readings.on,
      kun: readings.kun
    });
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return kanji.sort((a, b) => byCodePoint(a.character, b.character));
}

export function buildTaughtComponents(
  rows: readonly ComponentRow[],
  kradfile: Kradfile,
  levelKanji: readonly string[]
): string[] {
  const counts = componentFrequency(kradfile, levelKanji);
  const problems: string[] = [];
  const taught: string[] = [];

  for (const row of rows) {
    const shared = counts.get(row.character) ?? 0;
    if (shared < 2) {
      problems.push(
        `content/components.tsv: "${row.character}" (${row.name}) occurs in ${shared} kanji of the level, so it is not worth teaching as a component`
      );
      continue;
    }
    taught.push(row.character);
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return taught.sort(byCodePoint);
}

function toSource(source: Source): Source {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    licence: source.licence,
    licenceUrl: source.licenceUrl,
    version: source.version
  };
}

export function buildContent(
  level: string,
  sources: readonly Source[],
  kanji: Kanji[],
  words: Word[],
  taughtComponents: string[],
  generated: string
): Content {
  return {
    level,
    generated,
    sources: sources.map(toSource),
    kanji,
    words,
    taughtComponents
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function main(): void {
  applyOverrides();
  const manifest = loadManifest();
  const kanjiRows = loadKanjiList(LEVEL);
  const levelKanji = new Set(kanjiRows.map((row) => row.character));
  const wordRows = loadWordList(LEVEL, levelKanji);
  const index = indexByWrittenForm(parseJmdict(readCached("jmdict-eng-common.json")));
  const kradfile = parseKradfile(readCached("kradfile.json"));
  const kanjidic = parseKanjidic(readCached("kanjidic2.json"));

  const characters = kanjiRows.map((row) => row.character);
  const content = buildContent(
    LEVEL.toUpperCase(),
    manifest.sources,
    buildKanji(kanjiRows, kradfile, kanjidic),
    buildWords(wordRows, index, levelKanji, kanjidic, clipExists),
    buildTaughtComponents(loadComponentList(), kradfile, characters),
    today()
  );

  mkdirSync(join(OUTPUT_DIR, "base", LEVEL), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "base", LEVEL, `${LEVEL}.json`), `${JSON.stringify(content, null, 2)}\n`);
  writeFileSync(join(OUTPUT_DIR, "ATTRIBUTION.md"), renderAttribution(content.sources));
  writeFileSync(join(OUTPUT_DIR, "LICENSE"), renderLicence(content.sources));

  const sizes = countBySet(wordRows);
  process.stdout.write(
    `${content.kanji.length} kanji, ${content.words.length} words, ${content.taughtComponents.length} taught components\n`
  );
  for (const id of SET_IDS) {
    process.stdout.write(`  ${id.padEnd(12)} ${String(sizes[id]).padStart(3)}\n`);
  }
  process.stdout.write("0 unresolved rows, ATTRIBUTION.md and LICENSE regenerated\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const dictionary = {
    version: "t",
    words: [
      {
        id: "1",
        kanji: [{ text: "日本", tags: [] }],
        kana: [{ text: "にほん", tags: [], appliesToKanji: ["*"] }],
        sense: [{ misc: [], appliesToKanji: ["*"], gloss: [{ lang: "eng", text: "Japan" }] }]
      },
      {
        id: "2",
        kanji: [{ text: "お菓子", tags: [] }],
        kana: [{ text: "おかし", tags: [], appliesToKanji: ["*"] }],
        sense: [{ misc: [], appliesToKanji: ["*"], gloss: [{ lang: "eng", text: "sweets" }] }]
      },
      {
        id: "3",
        kanji: [{ text: "葉書", tags: [] }],
        kana: [{ text: "はがき", tags: [], appliesToKanji: ["*"] }],
        sense: [{ misc: ["uk"], appliesToKanji: ["*"], gloss: [{ lang: "eng", text: "postcard" }] }]
      }
    ]
  };
  const index = indexByWrittenForm(parseJmdict(dictionary));
  const levelKanji = new Set(["日", "本", "子"]);
  const row = (written: string, reading: string, meaning = ""): WordRow => ({
    written,
    reading,
    expansion: "base",
    set: "places",
    subcategory: "buildings",
    level: "N5",
    meaning,
    clue: "",
    note: ""
  });

  describe("shortGloss", () => {
    test("drops the parenthetical JMdict hangs off a sense", () => {
      expect(shortGloss("water (esp. cool or cold)")).toBe("water");
    });

    test("drops a parenthetical that opens the gloss", () => {
      expect(shortGloss("(the) day before yesterday")).toBe("day before yesterday");
    });

    test("closes the gap a parenthetical in the middle leaves behind", () => {
      expect(shortGloss("older (male) sibling")).toBe("older sibling");
    });

    test("leaves a gloss with no parenthetical alone", () => {
      expect(shortGloss("Japan")).toBe("Japan");
    });
  });

  describe("buildWords", () => {
    test("attaches every English sense JMdict carries as its own entry", () => {
      expect(buildWords([row("日本", "にほん")], index, levelKanji)[0].glosses).toEqual(["Japan"]);
    });

    test("labels a word with the first gloss when the curator filled nothing in", () => {
      expect(buildWords([row("日本", "にほん")], index, levelKanji)[0].meaning).toBe("Japan");
    });

    test("prefers the curator's meaning over the gloss", () => {
      const built = buildWords([row("日本", "にほん", "the country")], index, levelKanji);
      expect(built[0].meaning).toBe("the country");
      expect(built[0].glosses).toEqual(["Japan"]);
    });

    test("refuses two words of a level that would answer one meaning question", () => {
      expect(() =>
        buildWords([row("日本", "にほん", "sweets"), row("お菓子", "おかし")], index, levelKanji)
      ).toThrow(/お菓子 \(おかし\) and 日本 \(にほん\) both mean "sweets"/);
    });

    test("refuses a clue that names the meaning it is hinting at", () => {
      expect(() =>
        buildWords(
          [{ ...row("日本", "にほん"), clue: "The country called Japan." }],
          index,
          levelKanji
        )
      ).toThrow(/has a clue that says "Japan"/);
    });

    test("refuses a label too long to read on a tile", () => {
      const wordy = "a".repeat(MEANING_LIMIT + 1);
      expect(() => buildWords([row("日本", "にほん", wordy)], index, levelKanji)).toThrow(
        new RegExp(`is labelled "${wordy}", ${MEANING_LIMIT + 1} characters`)
      );
    });

    test("builds the id from the written form and the reading", () => {
      expect(buildWords([row("日本", "にほん")], index, levelKanji)[0].id).toBe("日本|にほん");
    });

    test("tags a word only with the kanji the level teaches", () => {
      expect(buildWords([row("お菓子", "おかし")], index, levelKanji)[0].kanji).toEqual(["子"]);
    });

    test("fails on a reading JMdict does not have, naming the row", () => {
      expect(() => buildWords([row("日本", "にっぽん")], index, levelKanji)).toThrow(
        /row 1: 日本 \(にっぽん\) — JMdict has "日本" but not with the reading "にっぽん"/
      );
    });

    test("fails rather than silently dropping a usually-kana word", () => {
      expect(() => buildWords([row("葉書", "はがき")], index, levelKanji)).toThrow(/usually kana/);
    });

    test("keeps every reading JMdict accepts, the curated one first", () => {
      const [built] = buildWords([row("日本", "にほん")], index, levelKanji);
      expect(built.readings).toEqual(["にほん"]);
    });

    test("tags a one-character word with the class its reading belongs to", () => {
      const single = indexByWrittenForm(
        parseJmdict({
          version: "t",
          words: [
            {
              id: "4",
              kanji: [{ text: "本", tags: [] }],
              kana: [{ text: "ほん", tags: [], appliesToKanji: ["*"] }],
              sense: [{ misc: [], appliesToKanji: ["*"], gloss: [{ lang: "eng", text: "book" }] }]
            }
          ]
        })
      );
      const readings = parseKanjidic({
        characters: [
          {
            literal: "本",
            readingMeaning: {
              groups: [
                {
                  readings: [
                    { type: "ja_on", value: "ホン" },
                    { type: "ja_kun", value: "もと" }
                  ]
                }
              ]
            }
          }
        ]
      });
      expect(buildWords([row("本", "ほん")], single, levelKanji, readings)[0].readingClass).toBe(
        "on"
      );
    });

    test("leaves a compound with no reading class, since it is read as a whole", () => {
      expect(buildWords([row("日本", "にほん")], index, levelKanji)[0].readingClass).toBeUndefined();
    });

    test("lets two words of different levels share a label", () => {
      const other = { ...row("お菓子", "おかし", "Japan"), level: "N4" };
      expect(buildWords([row("日本", "にほん"), other], index, levelKanji)).toHaveLength(2);
    });

    test("reports every unresolved row, not only the first", () => {
      expect(() =>
        buildWords([row("日本", "にっぽん"), row("葉書", "はがき")], index, levelKanji)
      ).toThrow(/2 curated row\(s\)/);
    });
  });

  const kradfile = parseKradfile({
    version: "t",
    kanji: { 明: ["日", "月"], 時: ["日", "土", "寸"], 本: ["木", "一"], 林: ["木", "木"] }
  });

  const kanjidic = parseKanjidic({
    characters: [
      {
        literal: "本",
        readingMeaning: {
          groups: [
            {
              readings: [
                { type: "ja_on", value: "ホン" },
                { type: "ja_kun", value: "もと" }
              ]
            }
          ]
        }
      },
      {
        literal: "明",
        readingMeaning: {
          groups: [{ readings: [{ type: "ja_on", value: "メイ" }] }]
        }
      }
    ]
  });

  describe("clueNames", () => {
    test("catches a clue that gives the answer away", () => {
      expect(clueNames("The country east of Korea, called Japan.", "Japan")).toBe(true);
    });

    test("lets a clue past that only shares letters with the answer", () => {
      expect(clueNames("Somebody you like and spend time with.", "one")).toBe(false);
      expect(clueNames("Coins and notes.", "money")).toBe(false);
    });

    test("treats a punctuated label as one phrase", () => {
      expect(clueNames("A hundred hundreds.", "10,000")).toBe(false);
      expect(clueNames("Worth 10,000 yen.", "10,000")).toBe(true);
    });
  });

  describe("buildKanji", () => {
    test("carries the on and kun readings of every kanji", () => {
      const [built] = buildKanji([{ character: "本", level: "N5", look: "" }], kradfile, kanjidic);
      expect(built.on).toEqual(["ホン"]);
      expect(built.kun).toEqual(["もと"]);
    });

    test("fails on a kanji KANJIDIC2 does not hold", () => {
      expect(() => buildKanji([{ character: "林", level: "N5", look: "" }], kradfile, kanjidic)).toThrow(
        /KANJIDIC2 has no entry for "林"/
      );
    });

    test("sorts the level's kanji so a rebuild does not churn the diff", () => {
      const built = buildKanji(
        [
          { character: "本", level: "N5", look: "" },
          { character: "明", level: "N5", look: "" }
        ],
        kradfile,
        kanjidic
      );
      expect(built.map((entry) => entry.character)).toEqual(["明", "本"]);
    });

    test("gives every kanji at least one component", () => {
      const built = buildKanji([{ character: "明", level: "N5", look: "" }], kradfile, kanjidic);
      expect(built[0].components).toEqual(["日", "月"]);
    });

    test("fails on a kanji KRADFILE does not decompose", () => {
      expect(() => buildKanji([{ character: "々", level: "N5", look: "" }], kradfile, kanjidic)).toThrow(
        /no decomposition for "々"/
      );
    });
  });

  describe("buildTaughtComponents", () => {
    const characters = ["明", "時", "本", "林"];

    test("keeps a component two kanji of the level share", () => {
      expect(
        buildTaughtComponents([{ character: "日", name: "sun" }], kradfile, characters)
      ).toEqual(["日"]);
    });

    test("refuses a component only one kanji of the level uses", () => {
      expect(() =>
        buildTaughtComponents([{ character: "寸", name: "measure" }], kradfile, characters)
      ).toThrow(/"寸" \(measure\) occurs in 1 kanji of the level/);
    });

    test("refuses a component no kanji of the level uses", () => {
      expect(() =>
        buildTaughtComponents([{ character: "魚", name: "fish" }], kradfile, characters)
      ).toThrow(/occurs in 0 kanji of the level/);
    });

    test("ships only the characters, never the curator's English name", () => {
      const taught = buildTaughtComponents(
        [{ character: "木", name: "tree" }, { character: "日", name: "sun" }],
        kradfile,
        characters
      );
      expect(taught).toEqual(["日", "木"]);
    });

    test("orders by code point, which no locale data can shift under us", () => {
      expect(["本", "日", "明"].sort(byCodePoint)).toEqual(["日", "明", "本"]);
    });
  });

  describe("buildContent", () => {
    test("carries only the six published fields of each source", () => {
      const manifest = loadManifest();
      const content = buildContent("N5", manifest.sources, [], [], [], "2026-09-19");
      expect(Object.keys(content.sources[0]).sort()).toEqual([
        "id",
        "licence",
        "licenceUrl",
        "title",
        "url",
        "version"
      ]);
    });
  });
}
