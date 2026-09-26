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
import { loadKanjiList, packSource } from "../../tools/content/validate.ts";
import { audioPath, imagePath } from "../../src/lib/packs/url.ts";
import { parsePackMeta } from "../../src/lib/packs/catalog.ts";
import { mergeContents } from "../../src/lib/content/load.ts";
import type { Content, Word } from "../../src/lib/content/types.ts";
import { buildQuestions, suitsFormat } from "../../src/lib/quiz/questions.ts";
import { DEFAULT_SETTINGS, FORMATS, isAssembly, showsWritten, usesAudio } from "../../src/lib/quiz/settings.ts";
import { shapesOf } from "../../src/lib/quiz/assemble.ts";
import { componentIndex } from "../../src/lib/quiz/similarity.ts";

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

const ADDED_IN_7_2 = [
  "待つ|まつ",
  "お手洗い|おてあらい",
  "字引|じびき",
  "家庭|かてい",
  "傘|かさ",
  "便利|べんり",
  "酒|さけ",
  "皿|さら",
  "嫌|いや",
  "差す|さす",
  "背|せ",
  "辺|へん",
  "戸|と",
  "零|れい",
  "縦|たて",
  "飴|あめ",
  "コピー|コピー"
];

const PENDING_PICTURES = ["n5-plus/to-wait", "n5-extra/umbrella", "n5-extra/convenient"];

function skiplist(pack: string, set: string): Set<string> {
  const path = join(packSource(pack), "prompts", set, "skiplist.txt");
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => (line.split("#")[0] ?? "").trim())
      .filter((line) => line !== "")
  );
}

const pictures = LEVEL.flatMap((id, index) =>
  (packs[index]?.content.words ?? []).map((word) => ({
    key: `${id}/${word.file}`,
    judged: skiplist(id, word.set).has(`${word.file}.png`)
  }))
);

describe("the N5 packs together", () => {
  test("file every word and every meaning label in exactly one pack", () => {
    expect(levelClashes(packs.flatMap((pack) => pack.content.words))).toEqual([]);
  });

  test("ship one identical row per kanji, and never a base kanji twice", () => {
    expect(kanjiClashes(packs)).toEqual([]);
  });

  test("keep every judged picture out of the next image run", () => {
    expect(pictures.filter((picture) => !picture.judged && !PENDING_PICTURES.includes(picture.key))).toEqual([]);
  });

  test("list a picture as pending only until its skiplist names it", () => {
    expect(pictures.filter((picture) => picture.judged && PENDING_PICTURES.includes(picture.key))).toEqual([]);
    expect(PENDING_PICTURES.filter((key) => !pictures.some((picture) => picture.key === key))).toEqual([]);
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

  test("shows every word in an example sentence", () => {
    expect(content.words.filter((word) => word.example === undefined).map((word) => word.id)).toEqual([]);
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

function contentOf(id: string): Content {
  const content = packs[LEVEL.indexOf(id)]?.content;
  if (content === undefined) throw new Error(`${id} is not built`);
  return content;
}

function shapesWithBase(id: string) {
  const base = contentOf("n5-base");
  const own = id === "n5-base" ? base : contentOf(id);
  return shapesOf({ ...base.parts, ...own.parts }, [...base.kanji, ...own.kanji]);
}

describe.each(["n5-base", "n5-plus", "n5-extra"])("assembling the %s words", (id) => {
  test("needs only the parts of base and the pack itself", () => {
    const shapes = shapesWithBase(id);
    expect(
      contentOf(id)
        .words.filter((word) => !suitsFormat(word, "kana-assemble", shapes))
        .map((word) => word.id)
    ).toEqual([]);
  });
});

describe("the n5-kana words", () => {
  const unwritten = FORMATS.filter((format) => !showsWritten(format));

  test("leave four formats that never show a written form", () => {
    expect(unwritten).toEqual(["kana-meaning", "meaning-kana", "image-kana", "audio-kana"]);
  });

  test("suit exactly the formats that never show a written form", () => {
    const misfits = contentOf("n5-kana").words.filter(
      (word) =>
        FORMATS.filter((format) => suitsFormat(word, format, shapesWithBase("n5-base"))).join() !== unwritten.join()
    );
    expect(misfits.map((word) => word.id)).toEqual([]);
  });
});

describe("the words added in phase 7.2", () => {
  const level = mergeContents(LEVEL.map(contentOf));
  const components = componentIndex(level.kanji);
  const added = LEVEL.flatMap((id) =>
    contentOf(id)
      .words.filter((word) => ADDED_IN_7_2.includes(word.id))
      .map((word) => ({ id, word }))
  );

  function ask(word: Word, format: (typeof FORMATS)[number], shapes: ReturnType<typeof shapesOf>) {
    const settings = {
      ...DEFAULT_SETTINGS,
      sets: [word.set],
      excludedWords: level.words.filter((other) => other.id !== word.id).map((other) => other.id),
      format,
      difficulty: "expert" as const,
      questionCount: 1
    };
    return buildQuestions(settings, level.words, () => 0.5, components, shapes)[0];
  }

  test("are all seventeen", () => {
    expect(added).toHaveLength(17);
  });

  test.each(added.map(({ id, word }) => [word.written, id, word] as const))(
    "ask %s (%s) in every format it suits, with the right answer among the choices",
    (_, id, word) => {
      const shapes = shapesWithBase(id);
      const formats = FORMATS.filter((format) => suitsFormat(word, format, shapes));
      expect(formats.length).toBeGreaterThan(0);
      for (const format of formats) {
        const question = ask(word, format, shapes);
        expect([format, question?.wordId]).toEqual([format, word.id]);
        if (isAssembly(format)) {
          expect([format, question?.puzzle === undefined]).toEqual([format, false]);
          continue;
        }
        expect([format, question?.choices.length]).toEqual([format, DEFAULT_SETTINGS.choiceCount]);
        expect([format, question?.choices.filter((choice) => choice === question.answer).length]).toEqual([format, 1]);
      }
    }
  );

  test("never offer 雨 as a sound-alike distractor for 飴 in a listening run", () => {
    const candy = added.find(({ word }) => word.written === "飴");
    const rain = level.words.find((word) => word.written === "雨");
    if (candy === undefined || rain === undefined) throw new Error("飴 or 雨 is missing");
    const shapes = shapesWithBase(candy.id);
    for (const format of FORMATS.filter((entry) => usesAudio(entry) && suitsFormat(candy.word, entry, shapes))) {
      const question = ask(candy.word, format, shapes);
      expect([format, question?.choices.includes(rain.written)]).toEqual([format, false]);
    }
  });

  test("keep 嫌 and 嫌い apart by their meaning labels", () => {
    const labels = level.words
      .filter((word) => word.written === "嫌" || word.written === "嫌い")
      .map((word) => word.meaning);
    expect(new Set(labels).size).toBe(2);
  });
});
