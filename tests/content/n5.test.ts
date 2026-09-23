import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { renderAttribution, renderLicence } from "../../tools/content/attribution.ts";
import {
  buildContent,
  buildKanji,
  buildTaughtComponents,
  buildWords,
  clipExists,
  clueNames,
  DATA_DIR,
  OUTPUT_DIR,
  readCached
} from "../../tools/content/build.ts";
import { audioUrl, imageUrl } from "../../src/lib/quiz/hints.ts";
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

const WHERE = "data/content/base/n5/n5.json";

const IMAGE_DIR = fileURLToPath(new URL("../../data/images/", import.meta.url));

const AUDIO_DIR = fileURLToPath(new URL("../../data/audio/base/n5/", import.meta.url));

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
  if (!existsSync(join(OUTPUT_DIR, "base/n5/n5.json"))) {
    throw new Error(
      "data/content/ is generated and is not in git. Run \"npm run content:build\" to regenerate it, or \"scripts/sync_data.sh --download\" to fetch the published copy."
    );
  }
  return parseContent(JSON.parse(read("base/n5/n5.json")), WHERE);
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

  test("gives every word a clue that never names the answer", () => {
    expect(content.words.filter((word) => word.clue === "")).toEqual([]);
    expect(content.words.filter((word) => clueNames(word.clue, word.meaning))).toEqual([]);
  });

  test("describes the shape of every kanji the level teaches", () => {
    expect(content.kanji.filter((entry) => entry.look === "")).toEqual([]);
  });

  test("names a picture file for every word", () => {
    const paths = content.words.map((word) => imageUrl(word));
    expect(new Set(paths).size).toBe(content.words.length);
    for (const path of paths) {
      expect(existsSync(join(IMAGE_DIR, path.replace("/images/", "")))).toBe(true);
    }
  });

  test("flags a clip on exactly the words whose file exists", () => {
    for (const word of content.words) {
      expect([word.id, existsSync(join(DATA_DIR, audioUrl(word)))]).toEqual([word.id, word.hasAudio]);
    }
  });

  test("records where every clip came from, and a gap only where no source had one", () => {
    const rows = readFileSync(join(AUDIO_DIR, "sources.tsv"), "utf8")
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"));
    const bySource = new Map(rows.map(([path, source]) => [path, source]));
    for (const word of content.words) {
      const source = bySource.get(audioUrl(word).replace("/audio/base/n5/", ""));
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

  test("writes only its own folder, so a rebuild leaves the pictures alone", () => {
    expect(OUTPUT_DIR.endsWith("/data/content/")).toBe(true);
    expect(IMAGE_DIR.startsWith(OUTPUT_DIR)).toBe(false);
    expect(readdirSync(OUTPUT_DIR).sort()).toEqual(["ATTRIBUTION.md", "LICENSE", "base"]);
    const isLightPng = (path: string) => path.includes(`${sep}light${sep}`) && path.endsWith(".png");
    expect(countFiles(IMAGE_DIR, isLightPng)).toBe(content.words.length);
  });

  test("stays small enough to parse instantly on WebKitGTK and low-end Android", () => {
    expect(Buffer.byteLength(read("base/n5/n5.json"))).toBeLessThan(200 * 1024);
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
      buildWords(wordRows, index, levelKanji, kanjidic, clipExists),
      buildTaughtComponents(
        loadComponentList(),
        kradfile,
        kanjiRows.map((row) => row.character)
      ),
      content.generated
    );
    expect(`${JSON.stringify(rebuilt, null, 2)}\n`).toBe(read("base/n5/n5.json"));
  });
});
