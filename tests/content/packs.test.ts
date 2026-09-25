import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  clueNames,
  DESCRIPTION_FILE,
  kanjiClashes,
  levelClashes,
  loadPackInfo,
  packOutput
} from "../../tools/content/build.ts";
import { contentProblems, parseContent } from "../../tools/content/content.ts";
import { loadKanjiList } from "../../tools/content/validate.ts";
import { audioPath, imagePath } from "../../src/lib/packs/url.ts";
import { parsePackMeta } from "../../src/lib/packs/catalog.ts";

const LEVEL = ["n5-base", "n5-plus", "n5-extra", "n5-kana"];

const OPTIONAL = LEVEL.filter((pack) => pack !== "n5-base");

const baseKanji = new Set(loadKanjiList("n5-base").map((row) => row.character));

function built(pack: string) {
  const where = `data/packs/${pack}/content.json`;
  const path = join(packOutput(pack), "content.json");
  if (!existsSync(path)) {
    throw new Error(`${where} is missing. Run "npm run content:build" or "scripts/sync_data.sh --download".`);
  }
  return { info: loadPackInfo(pack), content: parseContent(JSON.parse(readFileSync(path, "utf8")), where) };
}

const packs = LEVEL.map(built);

describe("the N5 packs together", () => {
  test("file every word and every meaning label in exactly one pack", () => {
    expect(levelClashes(packs.flatMap((pack) => pack.content.words))).toEqual([]);
  });

  test("ship one identical row per kanji, and never a base kanji twice", () => {
    expect(kanjiClashes(packs)).toEqual([]);
  });
});

describe.each(OPTIONAL)("the shipped %s pack", (id) => {
  const pack = packs[LEVEL.indexOf(id)];
  if (pack === undefined) throw new Error(`${id} is not built`);
  const { content } = pack;
  const out = packOutput(id);

  test("narrows at the trust boundary with base and its own kanji", () => {
    expect(contentProblems(content, `data/packs/${id}/content.json`, baseKanji)).toEqual([]);
  });

  test("gives every word a clue that never names the answer", () => {
    expect(content.words.filter((word) => word.clue === "" || clueNames(word.clue, word.meaning))).toEqual([]);
  });

  test("describes the shape of every kanji it ships", () => {
    expect(content.kanji.filter((entry) => entry.look === "")).toEqual([]);
  });

  test("names a picture for every word", () => {
    for (const word of content.words) {
      expect([word.id, existsSync(join(out, imagePath(word)))]).toEqual([word.id, true]);
    }
  });

  test("flags a clip on exactly the words whose file exists", () => {
    for (const word of content.words) {
      expect([word.id, existsSync(join(out, audioPath(word)))]).toEqual([word.id, word.hasAudio]);
    }
  });

  test("describes itself with the counts its content holds", () => {
    expect(parsePackMeta(JSON.parse(readFileSync(join(out, "pack.json"), "utf8")))).toEqual({
      ...loadPackInfo(id),
      words: content.words.length,
      kanji: content.kanji.length,
      description: DESCRIPTION_FILE
    });
  });
});

describe("the shipped n5-kana pack", () => {
  const kana = packs[LEVEL.indexOf("n5-kana")]?.content;

  test("holds only kana words, none of them tagged with a kanji", () => {
    expect(kana?.words.filter((word) => word.shape !== "kana" || word.kanji.length > 0)).toEqual([]);
    expect(kana?.kanji).toEqual([]);
  });
});
