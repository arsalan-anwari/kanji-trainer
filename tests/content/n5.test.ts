import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderAttribution, renderLicence } from "../../tools/content/attribution.ts";
import {
  buildContent,
  buildKanji,
  buildTaughtComponents,
  buildWords,
  OUTPUT_DIR,
  readCached
} from "../../tools/content/build.ts";
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

const WHERE = "data/content/n5.json";

const read = (name: string) => readFileSync(join(OUTPUT_DIR, name), "utf8");

function loadContent() {
  if (!existsSync(join(OUTPUT_DIR, "n5.json"))) {
    throw new Error(
      "data/content/ is generated and is not in git. Run \"npm run content:build\" to regenerate it, or \"scripts/sync_data.sh --download\" to fetch the published copy."
    );
  }
  return parseContent(JSON.parse(read("n5.json")), WHERE);
}

const content = loadContent();

const kanjiRows = loadKanjiList("n5");
const levelKanji = new Set(kanjiRows.map((row) => row.character));
const wordRows = loadWordList("n5", levelKanji);

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
    expect(content.words.filter((word) => word.gloss === "")).toEqual([]);
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
    expect([...sizes].filter(([, size]) => size === 0).map(([id]) => id)).toEqual(["body"]);
  });

  test("stays small enough to parse instantly on WebKitGTK and low-end Android", () => {
    expect(Buffer.byteLength(read("n5.json"))).toBeLessThan(200 * 1024);
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
    const rebuilt = buildContent(
      "N5",
      loadManifest().sources,
      buildKanji(kanjiRows, kradfile, kanjidic),
      buildWords(wordRows, index, levelKanji, kanjidic),
      buildTaughtComponents(
        loadComponentList(),
        kradfile,
        kanjiRows.map((row) => row.character)
      ),
      content.generated
    );
    expect(`${JSON.stringify(rebuilt, null, 2)}\n`).toBe(read("n5.json"));
  });
});
