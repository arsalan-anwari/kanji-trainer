import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAttribution, renderLicence } from "./attribution.ts";
import { CACHE_DIR } from "./fetch.ts";
import { indexByWrittenForm, isMatch, lookupWord, parseJmdict } from "./jmdict.ts";
import { componentFrequency, decompose, parseKradfile } from "./kradfile.ts";
import { loadManifest } from "./sources.ts";
import {
  kanjiIn,
  loadComponentList,
  loadKanjiList,
  loadWordList,
  setSizes,
  SET_IDS,
  wordId
} from "./validate.ts";
import type { Lookup } from "./jmdict.ts";
import type { Kradfile } from "./kradfile.ts";
import type { ComponentRow, KanjiRow, WordRow } from "./validate.ts";
import type { Content, Kanji, Source, Word } from "../../src/lib/content/types.ts";

export function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const OUTPUT_DIR = fileURLToPath(new URL("../../data/content/", import.meta.url));

const LEVEL = "n5";

export function readCached(name: string): unknown {
  try {
    return JSON.parse(readFileSync(join(CACHE_DIR, name), "utf8"));
  } catch {
    throw new Error(`${name} is not in .cache/content — run "npm run content:fetch" first`);
  }
}

export function buildWords(
  rows: readonly WordRow[],
  index: Lookup,
  levelKanji: ReadonlySet<string>
): Word[] {
  const problems: string[] = [];
  const words: Word[] = [];

  rows.forEach((row, position) => {
    const where = `content/${row.level.toLowerCase()}-words.tsv row ${position + 1}`;
    const result = lookupWord(index, row.written, row.reading);
    if (!isMatch(result)) {
      problems.push(`${where}: ${row.written} (${row.reading}) — ${result.detail}`);
      return;
    }
    words.push({
      id: wordId(row.written, row.reading),
      written: row.written,
      reading: row.reading,
      gloss: result.gloss,
      kanji: kanjiIn(row.written).filter((character) => levelKanji.has(character)),
      set: row.set,
      level: row.level
    });
  });

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} curated row(s) do not resolve against JMdict:\n${problems.join("\n")}`
    );
  }
  return words;
}

export function buildKanji(rows: readonly KanjiRow[], kradfile: Kradfile): Kanji[] {
  const problems: string[] = [];
  const kanji: Kanji[] = [];

  for (const row of rows) {
    const components = decompose(kradfile, row.character);
    if (components.length === 0) {
      problems.push(`KRADFILE decomposes "${row.character}" into nothing`);
      continue;
    }
    kanji.push({ character: row.character, level: row.level, components });
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
  const manifest = loadManifest();
  const kanjiRows = loadKanjiList(LEVEL);
  const levelKanji = new Set(kanjiRows.map((row) => row.character));
  const wordRows = loadWordList(LEVEL, levelKanji);
  const index = indexByWrittenForm(parseJmdict(readCached("jmdict-eng-common.json")));
  const kradfile = parseKradfile(readCached("kradfile.json"));

  const characters = kanjiRows.map((row) => row.character);
  const content = buildContent(
    LEVEL.toUpperCase(),
    manifest.sources,
    buildKanji(kanjiRows, kradfile),
    buildWords(wordRows, index, levelKanji),
    buildTaughtComponents(loadComponentList(), kradfile, characters),
    today()
  );

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, `${LEVEL}.json`), `${JSON.stringify(content, null, 2)}\n`);
  writeFileSync(join(OUTPUT_DIR, "ATTRIBUTION.md"), renderAttribution(content.sources));
  writeFileSync(join(OUTPUT_DIR, "LICENSE"), renderLicence(content.sources));

  const sizes = setSizes(wordRows);
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
  const row = (written: string, reading: string): WordRow => ({
    written,
    reading,
    set: "places",
    level: "N5",
    note: ""
  });

  describe("buildWords", () => {
    test("attaches the gloss JMdict carries for the curated reading", () => {
      expect(buildWords([row("日本", "にほん")], index, levelKanji)[0].gloss).toBe("Japan");
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

  describe("buildKanji", () => {
    test("sorts the level's kanji so a rebuild does not churn the diff", () => {
      const built = buildKanji(
        [
          { character: "本", level: "N5" },
          { character: "明", level: "N5" }
        ],
        kradfile
      );
      expect(built.map((entry) => entry.character)).toEqual(["明", "本"]);
    });

    test("gives every kanji at least one component", () => {
      const built = buildKanji([{ character: "明", level: "N5" }], kradfile);
      expect(built[0].components).toEqual(["日", "月"]);
    });

    test("fails on a kanji KRADFILE does not decompose", () => {
      expect(() => buildKanji([{ character: "々", level: "N5" }], kradfile)).toThrow(
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
