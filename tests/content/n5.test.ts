import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAttribution, renderLicence } from "../../tools/content/attribution.ts";
import {
  buildContent,
  buildKanji,
  buildParts,
  buildTaughtComponents,
  buildWords,
  clipExists,
  clueNames,
  DESCRIPTION_FILE,
  loadPackInfo,
  packOutput,
  readCached,
  readCachedText
} from "../../tools/content/build.ts";
import { parseKanjivg } from "../../tools/content/kanjivg.ts";
import { parseAnimcjk } from "../../tools/content/animcjk.ts";
import { audioPath, imagePath } from "../../src/lib/packs/url.ts";
import { parsePackMeta } from "../../src/lib/packs/catalog.ts";
import { CACHE_DIR } from "../../tools/content/fetch.ts";
import { indexByWrittenForm, parseJmdict } from "../../tools/content/jmdict.ts";
import { parseKradfile } from "../../tools/content/kradfile.ts";
import { parseKanjidic } from "../../tools/content/kanjidic.ts";
import { loadManifest } from "../../tools/content/sources.ts";
import { contentProblems, parseContent } from "../../tools/content/content.ts";
import {
  loadComponentList,
  loadKanjiList,
  loadWordList,
  SET_IDS
} from "../../tools/content/validate.ts";

const PACK = "n5-base";

const WHERE = `data/packs/${PACK}/content.json`;

const OUTPUT_DIR = packOutput(PACK);

const IMAGE_DIR = join(OUTPUT_DIR, "images");

const AUDIO_DIR = join(OUTPUT_DIR, "audio");

const read = (name: string) => readFileSync(join(OUTPUT_DIR, name), "utf8");

function countFiles(dir: string, matches: (path: string) => boolean): number {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (total, entry) =>
      total +
      (entry.isDirectory()
        ? countFiles(join(dir, entry.name), matches)
        : matches(join(dir, entry.name))
          ? 1
          : 0),
    0
  );
}

function loadContent() {
  if (!existsSync(join(OUTPUT_DIR, "content.json"))) {
    throw new Error(
      "data/packs/ is generated and is not in git. Run \"npm run content:build\" to regenerate it, or \"scripts/sync_data.sh --download\" to fetch the published copy."
    );
  }
  return parseContent(JSON.parse(read("content.json")), WHERE);
}

const content = loadContent();

const kanjiRows = loadKanjiList(PACK);
const levelKanji = new Set(kanjiRows.map((row) => row.character));
const wordRows = loadWordList(PACK, levelKanji);

const cacheIsPopulated = existsSync(join(CACHE_DIR, "jmdict-eng-common.json"));

describe("the shipped N5 content", () => {
  test("narrows at the trust boundary without a single rule violation", () => {
    expect(contentProblems(content, WHERE)).toEqual([]);
  });

  test("ships the level tag the curated files carry", () => {
    expect(content.level).toBe("N5");
    expect([...new Set(content.words.map((word) => word.level))]).toEqual(["N5"]);
    expect([...new Set(content.kanji.map((entry) => entry.level))]).toEqual(["N5"]);
  });

  test("ships one kanji entry per curated row, in code point order", () => {
    expect(content.kanji.map((entry) => entry.character)).toEqual(
      [...kanjiRows.map((row) => row.character)].sort()
    );
  });

  test("ships one word per curated row, in curated order", () => {
    expect(content.words.map((word) => `${word.written}|${word.reading}`)).toEqual(
      wordRows.map((row) => `${row.written}|${row.reading}`)
    );
  });

  test("agrees with the curated set assignment for every word", () => {
    const curated = new Map(wordRows.map((row) => [`${row.written}|${row.reading}`, row.set]));
    for (const word of content.words) {
      expect(word.set).toBe(curated.get(word.id));
    }
  });

  test("gives every word an English gloss for the reveal", () => {
    expect(content.words.filter((word) => word.glosses.length === 0)).toEqual([]);
  });

  test("gives every word of the level a label no other word answers to", () => {
    const labels = content.words.map((word) => word.meaning);
    expect(labels.filter((label) => label === "")).toEqual([]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("accepts at least the pinned reading for every word", () => {
    for (const word of content.words) {
      expect(word.readings[0]).toBe(word.reading);
    }
  });

  test("tells on from kun on every one-character word", () => {
    const singles = content.words.filter((word) => [...word.written].length === 1);
    expect(singles.length).toBeGreaterThan(0);
    expect(singles.filter((word) => word.readingClass === undefined)).toEqual([]);
  });

  test("gives every kanji the readings the on and kun setting needs", () => {
    expect(content.kanji.filter((entry) => entry.on.length + entry.kun.length === 0)).toEqual([]);
  });

  test("cuts every kanji a word is written with, the level's or not, into 1 to 4 parts", () => {
    const written = new Set(content.words.flatMap((word) => [...word.written].filter((glyph) => /\p{Script=Han}/u.test(glyph))));
    expect([...written].filter((character) => content.parts[character] === undefined)).toEqual([]);
    const cuts = Object.values(content.parts);
    expect(cuts.filter((cut) => cut.length < 1 || cut.length > 4)).toEqual([]);
    expect(cuts.flat().filter((part) => part.strokes.length === 0)).toEqual([]);
  });

  test("puts 亻 on the left half of 休 and 木 on the right", () => {
    expect(content.parts["休"]?.map((part) => [part.element, part.rect])).toEqual([
      ["亻", [0, 0, 2, 4]],
      ["木", [2, 0, 2, 4]]
    ]);
  });

  test("looks inside KanjiVG's unnamed groups, so 学 is ⺍ over 冖 over 子", () => {
    expect(content.parts["学"]?.map((part) => part.element)).toEqual(["⺍", "冖", "子"]);
    expect(content.parts["曜"]?.map((part) => part.element)).toEqual(["日", "翟"]);
  });

  test("names the pieces KanjiVG leaves unnamed from AnimCJK, so 前 is 䒑 月 刂", () => {
    expect(content.parts["前"]?.map((part) => part.element)).toEqual(["䒑", "月", "刂"]);
    expect(content.parts["電"]?.map((part) => part.element)).toEqual(["雨", "电"]);
    expect(content.parts["年"]).toHaveLength(1);
  });

  test("names every piece in English for a screen reader", () => {
    const names: Record<string, string> = JSON.parse(
      readFileSync(new URL("../../src/lib/assets/local/en/components.json", import.meta.url), "utf8")
    );
    expect(content.taughtComponents.filter((piece) => !(piece in names))).toEqual([]);
  });

  test("ships the curated components as bare characters, not their English names", () => {
    const curated = loadComponentList();
    expect(content.taughtComponents).toEqual([...curated.map((row) => row.character)].sort());
    expect(content.taughtComponents.every((component) => [...component].length === 1)).toBe(true);
  });

  test("covers every set that has words and reports the one that does not", () => {
    const sizes = new Map(SET_IDS.map((id) => [id, 0]));
    for (const word of content.words) {
      sizes.set(word.set, (sizes.get(word.set) ?? 0) + 1);
    }
    expect([...sizes].filter(([, size]) => size === 0).map(([id]) => id)).toEqual([
      "school-work",
      "leisure",
      "society",
      "expressions"
    ]);
  });

  test("gives every word a clue that never names the answer", () => {
    expect(content.words.filter((word) => word.clue === "")).toEqual([]);
    expect(content.words.filter((word) => clueNames(word.clue, word.meaning))).toEqual([]);
  });

  test("shows every word in an example sentence", () => {
    expect(content.words.filter((word) => word.example === undefined).map((word) => word.id)).toEqual([]);
  });

  test("describes the shape of every kanji the level teaches", () => {
    expect(content.kanji.filter((entry) => entry.look === "")).toEqual([]);
  });

  test("names a picture file for every word", () => {
    const paths = content.words.map((word) => imagePath(word));
    expect(new Set(paths).size).toBe(content.words.length);
    for (const path of paths) {
      expect(existsSync(join(OUTPUT_DIR, path))).toBe(true);
    }
  });

  test("files every word under the pack it was built from", () => {
    expect(content.words.filter((word) => word.pack !== PACK)).toEqual([]);
  });

  test("flags a clip on exactly the words whose file exists", () => {
    for (const word of content.words) {
      expect([word.id, existsSync(join(OUTPUT_DIR, audioPath(word)))]).toEqual([word.id, word.hasAudio]);
    }
  });

  test("records where every clip came from, and a gap only where no source had one", () => {
    const rows = readFileSync(join(OUTPUT_DIR, "sources.tsv"), "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"));
    const bySource = new Map(rows.map(([path, source]) => [path, source]));
    for (const word of content.words) {
      const source = bySource.get(audioPath(word).replace("audio/", ""));
      expect([word.id, source === "none"]).toEqual([word.id, !word.hasAudio]);
    }
  });

  test("keeps the clips of the level under 5 MB for Android", () => {
    const size = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce(
        (total, entry) =>
          total + (entry.isDirectory() ? size(join(dir, entry.name)) : statSync(join(dir, entry.name)).size),
        0
      );
    expect(size(AUDIO_DIR)).toBeLessThan(5 * 1024 * 1024);
  });

  test("ships one WebP per word and no leftover png", () => {
    expect(countFiles(IMAGE_DIR, (path) => path.endsWith(".webp"))).toBe(content.words.length);
    expect(countFiles(IMAGE_DIR, (path) => path.endsWith(".png"))).toBe(0);
  });

  test("keeps the whole pack small enough for a first-start download on mobile", () => {
    expect(countFiles(IMAGE_DIR, () => true)).toBe(content.words.length);
    const size = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce(
        (total, entry) =>
          total + (entry.isDirectory() ? size(join(dir, entry.name)) : statSync(join(dir, entry.name)).size),
        0
      );
    expect(size(OUTPUT_DIR)).toBeLessThan(20 * 1024 * 1024);
  });

  test("describes itself with the counts its content holds", () => {
    const meta = parsePackMeta(JSON.parse(read("pack.json")));
    expect(meta).toEqual({
      ...loadPackInfo(PACK),
      words: content.words.length,
      kanji: content.kanji.length,
      description: DESCRIPTION_FILE
    });
    expect(read(DESCRIPTION_FILE)).toContain("# N5 Base");
  });

  test("stays small enough to parse instantly on WebKitGTK and low-end Android", () => {
    expect(Buffer.byteLength(read("content.json"))).toBeLessThan(352 * 1024);
  });
});

describe("the generated attribution", () => {
  const manifest = loadManifest();

  test("carries every source the manifest lists", () => {
    expect(content.sources.map((source) => source.id)).toEqual(
      manifest.sources.map((source) => source.id)
    );
  });

  test("is exactly what the manifest renders to", () => {
    expect(read("ATTRIBUTION.md")).toBe(renderAttribution(content.sources));
    expect(read("LICENSE")).toBe(renderLicence(content.sources));
  });

  test("names every source with its licence, licence url and version", () => {
    const attribution = read("ATTRIBUTION.md");
    for (const source of manifest.sources) {
      expect(attribution).toContain(source.title);
      expect(attribution).toContain(source.url);
      expect(attribution).toContain(source.licence);
      expect(attribution).toContain(source.licenceUrl);
      expect(attribution).toContain(source.version);
    }
  });
});

describe.skipIf(!cacheIsPopulated)("rebuilding from the pinned sources", () => {
  test("reproduces the committed file byte for byte", () => {
    const index = indexByWrittenForm(parseJmdict(readCached("jmdict-eng-common.json")));
    const kradfile = parseKradfile(readCached("kradfile.json"));
    const kanjidic = parseKanjidic(readCached("kanjidic2.json"));
    const words = buildWords(PACK, wordRows, index, levelKanji, kanjidic, clipExists);
    const parts = buildParts(
      words.map((word) => word.written),
      parseKanjivg(readCachedText("kanjivg.xml")),
      parseAnimcjk(readCachedText("animcjk-ja.txt")),
      new Set(loadComponentList().map((row) => row.character))
    );
    const rebuilt = buildContent(
      "N5",
      loadManifest().sources,
      buildKanji(kanjiRows, kradfile, kanjidic),
      words,
      parts,
      buildTaughtComponents(loadComponentList(), parts),
      content.generated
    );
    expect(`${JSON.stringify(rebuilt, null, 2)}\n`).toBe(read("content.json"));
  });
});
