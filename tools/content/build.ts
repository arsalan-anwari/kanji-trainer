import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAttribution, renderLicence } from "./attribution.ts";
import { CACHE_DIR } from "./fetch.ts";
import { acceptedReadings, indexByWrittenForm, isMatch, lookupWord, parseJmdict } from "./jmdict.ts";
import { parseKanjidic, readingClassOf } from "./kanjidic.ts";
import { decompose, parseKradfile } from "./kradfile.ts";
import { parseKanjivg, partsOf } from "./kanjivg.ts";
import type { Kanjivg } from "./kanjivg.ts";
import { parseAnimcjk, type Animcjk } from "./animcjk.ts";
import { loadManifest } from "./sources.ts";
import {
  countBySet,
  kanjiIn,
  loadComponentList,
  loadKanjiList,
  loadWordList,
  missingOverlay,
  packSource,
  readOverlay,
  OVERLAY_DIR,
  SET_IDS,
  wordId
} from "./validate.ts";
import type { Lookup } from "./jmdict.ts";
import type { Kanjidic } from "./kanjidic.ts";
import type { Kradfile } from "./kradfile.ts";
import type { ComponentRow, KanjiRow, WordRow } from "./validate.ts";
import type { Content, Kanji, Part, Source, Word } from "../../src/lib/content/types.ts";
import { audioPath } from "../../src/lib/packs/url.ts";
import { shapeOf } from "../../src/lib/content/sets.ts";
import { sentenceRomaji } from "../../src/lib/quiz/romaji.ts";
import { isBase, parsePackInfo, type PackInfo, type PackMeta } from "../../src/lib/packs/catalog.ts";

export function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const PACKS_DIR = fileURLToPath(new URL("../../data/packs/", import.meta.url));

export function packOutput(pack: string): string {
  return join(PACKS_DIR, pack);
}

export function clipExists(word: Word): boolean {
  return existsSync(join(packOutput(word.pack), audioPath(word)));
}

export const OVERRIDE_DIRS = ["audio", "images"];


export function applyOverrides(pack: string): void {
  for (const dir of OVERRIDE_DIRS) {
    const from = join(packSource(pack), dir);
    if (existsSync(from)) cpSync(from, join(packOutput(pack), dir), { recursive: true });
  }
}

export function packIds(): string[] {
  const root = join(OVERLAY_DIR, "packs");
  if (!existsSync(root)) throw missingOverlay(root);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "pack.json")))
    .map((entry) => entry.name)
    .sort(byCodePoint);
}

export function loadPackInfo(pack: string): PackInfo {
  const where = `data/overlay/packs/${pack}/pack.json`;
  const info = parsePackInfo(JSON.parse(readOverlay(join(packSource(pack), "pack.json"))));
  if (info === null) throw new Error(`${where}: needs id, level, a known theme, version and title`);
  if (info.id !== pack) throw new Error(`${where}: id "${info.id}" must match its folder "${pack}"`);
  return info;
}

export function packMeta(info: PackInfo, content: Content, description: string): PackMeta {
  return { ...info, words: content.words.length, kanji: content.kanji.length, description };
}

export const DESCRIPTION_FILE = "description.md";

export function copyDescription(pack: string): string {
  const from = join(packSource(pack), DESCRIPTION_FILE);
  if (!existsSync(from)) return "";
  copyFileSync(from, join(packOutput(pack), DESCRIPTION_FILE));
  return DESCRIPTION_FILE;
}

export function readCachedText(name: string): string {
  try {
    return readFileSync(join(CACHE_DIR, name), "utf8");
  } catch {
    throw new Error(`${name} is not in .cache/content — run "npm run content:fetch" first`);
  }
}

export function readCached(name: string): unknown {
  return JSON.parse(readCachedText(name));
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
  pack: string,
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
    const where = `data/overlay/packs/${pack}/words.tsv row ${position + 1}`;
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
      shape: shapeOf(row.written),
      hasAudio: false,
      set: row.set,
      subcategory: row.subcategory,
      level: row.level,
      pack,
      file: row.file,
      ...(row.example === null
        ? {}
        : {
            example: {
              japanese: row.example.japanese,
              romaji: sentenceRomaji(row.example.kana),
              english: row.example.english
            }
          })
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

export function buildParts(
  written: readonly string[],
  kanjivg: Kanjivg,
  animcjk: Animcjk = new Map(),
  known: ReadonlySet<string> = new Set()
): Record<string, Part[]> {
  const characters = [...new Set(written.flatMap(kanjiIn))].sort(byCodePoint);
  return Object.fromEntries(
    characters.map((character) => [character, partsOf(character, kanjivg, animcjk, known)])
  );
}

export function piecesOf(parts: Readonly<Record<string, Part[]>>): string[] {
  const pieces = new Set<string>();
  for (const cut of Object.values(parts)) {
    if (cut.length < 2) continue;
    for (const part of cut) pieces.add(part.element);
  }
  return [...pieces].sort(byCodePoint);
}

export function buildTaughtComponents(
  rows: readonly ComponentRow[],
  parts: Readonly<Record<string, Part[]>>
): string[] {
  const named = new Set(rows.map((row) => row.character));
  const problems = Object.entries(parts).flatMap(([character, cut]) =>
    cut.length < 2
      ? []
      : cut
          .filter((part) => !named.has(part.element))
          .map(
            (part) => `data/overlay/shared/components.tsv: "${part.element}", a piece of "${character}", has no row`
          )
  );
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return [...named].sort(byCodePoint);
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
  parts: Record<string, Part[]>,
  taughtComponents: string[],
  generated: string
): Content {
  return {
    level,
    generated,
    sources: sources.map(toSource),
    kanji,
    words,
    parts,
    taughtComponents
  };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keeps the date of the content already on disk when nothing else changed, so
 * a rebuild of the same overlay writes the same bytes and the pack's archive
 * keeps its sha256: an untouched pack never shows as an update.
 */
export function keptDate(content: Content, previous: unknown): Content {
  if (typeof previous !== "object" || previous === null || !("generated" in previous)) return content;
  const generated = previous.generated;
  if (typeof generated !== "string") return content;
  const same = JSON.stringify({ ...previous, generated: "" }) === JSON.stringify({ ...content, generated: "" });
  return same ? { ...content, generated } : content;
}

function previousContent(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function levelClashes(words: readonly Word[]): string[] {
  const problems: string[] = [];
  const ids = new Map<string, Word>();
  const labels = new Map<string, Word>();
  for (const word of words) {
    const twin = ids.get(`${word.level}|${word.id}`);
    if (twin !== undefined && twin.pack !== word.pack) {
      problems.push(`${word.id} is in both ${twin.pack} and ${word.pack}; a word lives in exactly one pack`);
    }
    const namesake = labels.get(`${word.level}|${word.meaning}`);
    if (namesake !== undefined && namesake.pack !== word.pack) {
      problems.push(
        `${word.id} (${word.pack}) and ${namesake.id} (${namesake.pack}) both mean "${word.meaning}" — give one of them its own meaning column`
      );
    }
    ids.set(`${word.level}|${word.id}`, word);
    labels.set(`${word.level}|${word.meaning}`, word);
  }
  return problems;
}

export type BuiltPack = { info: PackInfo; content: Content };

export function kanjiClashes(packs: readonly BuiltPack[]): string[] {
  const problems: string[] = [];
  const shipped = new Map<string, { pack: PackInfo; row: string }>();
  for (const { info, content } of [...packs].sort((a, b) => Number(isBase(b.info)) - Number(isBase(a.info)))) {
    for (const entry of content.kanji) {
      const key = `${info.level}|${entry.character}`;
      const row = JSON.stringify(entry);
      const first = shipped.get(key);
      if (first === undefined) {
        shipped.set(key, { pack: info, row });
      } else if (isBase(first.pack)) {
        problems.push(`data/overlay/packs/${info.id}/kanji.tsv: "${entry.character}" already ships in ${first.pack.id}`);
      } else if (first.row !== row) {
        problems.push(
          `data/overlay/packs/${info.id}/kanji.tsv: "${entry.character}" differs from its row in ${first.pack.id}; copy the level and look across`
        );
      }
    }
  }
  return problems;
}

function buildPack(
  info: PackInfo,
  manifest: ReturnType<typeof loadManifest>,
  index: Lookup,
  kradfile: Kradfile,
  kanjidic: Kanjidic,
  kanjivg: Kanjivg,
  animcjk: Animcjk,
  baseKanji: ReadonlySet<string>
): BuiltPack {
  const pack = info.id;
  mkdirSync(packOutput(pack), { recursive: true });
  applyOverrides(pack);
  const kanjiRows = loadKanjiList(pack);
  const tags = new Set([...baseKanji, ...kanjiRows.map((row) => row.character)]);
  const wordRows = loadWordList(pack, tags, info.theme === "kana");
  const offLevel = wordRows.filter((row) => row.level !== info.level);
  if (offLevel.length > 0) {
    throw new Error(`data/overlay/packs/${pack}/words.tsv: ${offLevel.length} row(s) are not ${info.level}, the level pack.json names`);
  }

  const words = buildWords(pack, wordRows, index, tags, kanjidic, clipExists);
  const pieceRows = loadComponentList();
  const parts = buildParts(
    words.map((word) => word.written),
    kanjivg,
    animcjk,
    new Set(pieceRows.map((row) => row.character))
  );
  const content = buildContent(
    info.level,
    manifest.sources,
    buildKanji(kanjiRows, kradfile, kanjidic),
    words,
    parts,
    buildTaughtComponents(pieceRows, parts),
    today()
  );
  return { info, content };
}

function writePack({ info, content: built }: BuiltPack): PackMeta {
  const out = packOutput(info.id);
  const content = keptDate(built, previousContent(join(out, "content.json")));
  const meta = packMeta(info, content, copyDescription(info.id));
  writeFileSync(join(out, "content.json"), `${JSON.stringify(content, null, 2)}\n`);
  writeFileSync(join(out, "pack.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(out, "ATTRIBUTION.md"), renderAttribution(content.sources));
  writeFileSync(join(out, "LICENSE"), renderLicence(content.sources));

  const sizes = countBySet(content.words);
  process.stdout.write(
    `${info.id}: ${content.kanji.length} kanji, ${content.words.length} words, ${content.taughtComponents.length} taught components\n`
  );
  for (const id of SET_IDS) {
    if (sizes[id] > 0) process.stdout.write(`  ${id.padEnd(12)} ${String(sizes[id]).padStart(3)}\n`);
  }
  return meta;
}

export function baseKanjiOf(infos: readonly PackInfo[], level: string): Set<string> {
  const base = infos.find((info) => isBase(info) && info.level === level);
  return new Set(base === undefined ? [] : loadKanjiList(base.id).map((row) => row.character));
}

function main(): void {
  const manifest = loadManifest();
  const index = indexByWrittenForm(parseJmdict(readCached("jmdict-eng-common.json")));
  const kradfile = parseKradfile(readCached("kradfile.json"));
  const kanjidic = parseKanjidic(readCached("kanjidic2.json"));
  const kanjivg = parseKanjivg(readCachedText("kanjivg.xml"));
  const animcjk = parseAnimcjk(readCachedText("animcjk-ja.txt"));
  const infos = packIds().map(loadPackInfo);
  const built = infos.map((info) =>
    buildPack(info, manifest, index, kradfile, kanjidic, kanjivg, animcjk, baseKanjiOf(infos, info.level))
  );
  const problems = [...levelClashes(built.flatMap((pack) => pack.content.words)), ...kanjiClashes(built)];
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const packs = built.map(writePack);
  writeFileSync(join(PACKS_DIR, "index.json"), `${JSON.stringify(packs.map((pack) => pack.id), null, 2)}\n`);
  process.stdout.write(`${packs.length} pack(s) built, 0 unresolved rows\n`);
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
    set: "places",
    subcategory: "buildings",
    level: "N5",
    meaning,
    file: "w",
    clue: "",
    note: "",
    example: null
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
      expect(buildWords("n5-base", [row("日本", "にほん")], index, levelKanji)[0].glosses).toEqual(["Japan"]);
    });

    test("labels a word with the first gloss when the curator filled nothing in", () => {
      expect(buildWords("n5-base", [row("日本", "にほん")], index, levelKanji)[0].meaning).toBe("Japan");
    });

    test("prefers the curator's meaning over the gloss", () => {
      const built = buildWords("n5-base", [row("日本", "にほん", "the country")], index, levelKanji);
      expect(built[0].meaning).toBe("the country");
      expect(built[0].glosses).toEqual(["Japan"]);
    });

    test("refuses two words of a level that would answer one meaning question", () => {
      expect(() =>
        buildWords("n5-base", [row("日本", "にほん", "sweets"), row("お菓子", "おかし")], index, levelKanji)
      ).toThrow(/お菓子 \(おかし\) and 日本 \(にほん\) both mean "sweets"/);
    });

    test("refuses a clue that names the meaning it is hinting at", () => {
      expect(() =>
        buildWords(
          "n5-base",
          [{ ...row("日本", "にほん"), clue: "The country called Japan." }],
          index,
          levelKanji
        )
      ).toThrow(/has a clue that says "Japan"/);
    });

    test("refuses a label too long to read on a tile", () => {
      const wordy = "a".repeat(MEANING_LIMIT + 1);
      expect(() => buildWords("n5-base", [row("日本", "にほん", wordy)], index, levelKanji)).toThrow(
        new RegExp(`is labelled "${wordy}", ${MEANING_LIMIT + 1} characters`)
      );
    });

    test("builds the id from the written form and the reading", () => {
      expect(buildWords("n5-base", [row("日本", "にほん")], index, levelKanji)[0].id).toBe("日本|にほん");
    });

    test("tags a word only with the kanji the level teaches", () => {
      expect(buildWords("n5-base", [row("お菓子", "おかし")], index, levelKanji)[0].kanji).toEqual(["子"]);
    });

    test("fails on a reading JMdict does not have, naming the row", () => {
      expect(() => buildWords("n5-base", [row("日本", "にっぽん")], index, levelKanji)).toThrow(
        /row 1: 日本 \(にっぽん\) — JMdict has "日本" but not with the reading "にっぽん"/
      );
    });

    test("fails rather than silently dropping a usually-kana word", () => {
      expect(() => buildWords("n5-base", [row("葉書", "はがき")], index, levelKanji)).toThrow(/usually kana/);
    });

    test("keeps every reading JMdict accepts, the curated one first", () => {
      const [built] = buildWords("n5-base", [row("日本", "にほん")], index, levelKanji);
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
      expect(buildWords("n5-base", [row("本", "ほん")], single, levelKanji, readings)[0].readingClass).toBe(
        "on"
      );
    });

    test("leaves a compound with no reading class, since it is read as a whole", () => {
      expect(buildWords("n5-base", [row("日本", "にほん")], index, levelKanji)[0].readingClass).toBeUndefined();
    });

    test("lets two words of different levels share a label", () => {
      const other = { ...row("お菓子", "おかし", "Japan"), level: "N4" };
      expect(buildWords("n5-base", [row("日本", "にほん"), other], index, levelKanji)).toHaveLength(2);
    });

    test("reports every unresolved row, not only the first", () => {
      expect(() =>
        buildWords("n5-base", [row("日本", "にっぽん"), row("葉書", "はがき")], index, levelKanji)
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
    const piece = (element: string): Part => ({ element, rect: [0, 0, 2, 4], strokes: [] });
    const kanji = (character: string, elements: string[]): Record<string, Part[]> => ({
      [character]: elements.map(piece)
    });

    test("ships every curated piece, sorted by code point", () => {
      expect(
        buildTaughtComponents(
          [
            { character: "木", name: "tree" },
            { character: "亻", name: "person" }
          ],
          kanji("休", ["亻", "木"])
        )
      ).toEqual(["亻", "木"]);
    });

    test("fails on a piece of a cut kanji that has no row, naming both", () => {
      expect(() => buildTaughtComponents([{ character: "木", name: "tree" }], kanji("休", ["亻", "木"]))).toThrow(
        /"亻", a piece of "休", has no row/
      );
    });

    test("asks no row for a kanji that stays one block", () => {
      expect(buildTaughtComponents([], kanji("一", ["一"]))).toEqual([]);
    });

    test("lists the pieces of cut kanji only", () => {
      expect(piecesOf({ ...kanji("休", ["亻", "木"]), ...kanji("一", ["一"]) })).toEqual(["亻", "木"]);
    });

    test("orders by code point, which no locale data can shift under us", () => {
      expect(["本", "日", "明"].sort(byCodePoint)).toEqual(["日", "明", "本"]);
    });
  });

  describe("building the packs of one level together", () => {
    const pack = (id: string, theme: PackInfo["theme"], words: Word[], kanji: Kanji[] = []): BuiltPack => ({
      info: { id, level: "N5", theme, version: "1.0.0", title: id, taxonomy: 1 },
      content: buildContent("N5", [], kanji, words, {}, [], "2026-09-25")
    });
    const built = (id: string, rows: WordRow[], tags: Set<string>) => buildWords(id, rows, index, tags);
    const kanjiRow = (character: string, look = ""): Kanji => ({
      character,
      level: "N3",
      look,
      components: [character],
      on: [],
      kun: []
    });

    test("tags an optional pack's word with the base kanji and its own", () => {
      const [word] = built("n5-plus", [row("お菓子", "おかし")], new Set(["子", "菓"]));
      expect(word?.kanji).toEqual(["菓", "子"]);
    });

    test("refuses one word in two packs of a level", () => {
      const base = built("n5-base", [row("日本", "にほん")], levelKanji);
      const plus = built("n5-plus", [row("日本", "にほん", "Nippon")], levelKanji);
      expect(levelClashes([...base, ...plus])).toEqual([
        "日本|にほん is in both n5-base and n5-plus; a word lives in exactly one pack"
      ]);
    });

    test("refuses one meaning label in two packs of a level", () => {
      const base = built("n5-base", [row("日本", "にほん", "sweets")], levelKanji);
      const plus = built("n5-plus", [row("お菓子", "おかし")], levelKanji);
      expect(levelClashes([...base, ...plus])).toEqual([
        'お菓子|おかし (n5-plus) and 日本|にほん (n5-base) both mean "sweets" — give one of them its own meaning column'
      ]);
    });

    test("lets plus and extra ship the same kanji row, and nothing else", () => {
      const plus = pack("n5-plus", "plus", [], [kanjiRow("家", "a roof")]);
      const extra = pack("n5-extra", "extra", [], [kanjiRow("家", "a roof")]);
      expect(kanjiClashes([plus, extra])).toEqual([]);
      const other = pack("n5-extra", "extra", [], [kanjiRow("家", "a house")]);
      expect(kanjiClashes([plus, other])).toEqual([
        'data/overlay/packs/n5-extra/kanji.tsv: "家" differs from its row in n5-plus; copy the level and look across'
      ]);
    });

    test("never repeats a base kanji in another pack of the level", () => {
      const base = pack("n5-base", "base", [], [kanjiRow("日")]);
      const plus = pack("n5-plus", "plus", [], [kanjiRow("日")]);
      expect(kanjiClashes([plus, base])).toEqual([
        'data/overlay/packs/n5-plus/kanji.tsv: "日" already ships in n5-base'
      ]);
    });
  });

  describe("buildContent", () => {
    test("carries only the six published fields of each source", () => {
      const manifest = loadManifest();
      const content = buildContent("N5", manifest.sources, [], [], {}, [], "2026-09-19");
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

  describe("keptDate", () => {
    const content = buildContent("N5", [], [], [], {}, [], "2026-09-26");

    test("keeps the old date when the rest of the content is unchanged", () => {
      const previous = JSON.parse(JSON.stringify({ ...content, generated: "2026-09-19" }));
      expect(keptDate(content, previous).generated).toBe("2026-09-19");
    });

    test("takes the new date when anything else changed, or nothing was built before", () => {
      const previous = JSON.parse(JSON.stringify({ ...content, level: "N4", generated: "2026-09-19" }));
      expect(keptDate(content, previous).generated).toBe("2026-09-26");
      expect(keptDate(content, null).generated).toBe("2026-09-26");
    });
  });
}
