import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseContent } from "../../src/lib/content/load.ts";
import type { Word } from "../../src/lib/content/types.ts";
import { answerOf, buildQuestions } from "../../src/lib/quiz/questions.ts";
import { answerSurface, DEFAULT_SETTINGS, FORMATS, usesAudio } from "../../src/lib/quiz/settings.ts";
import { componentIndex, similarity, SHARED_KANJI } from "../../src/lib/quiz/similarity.ts";

const raw = readFileSync(new URL("../../data/content/base/n5/n5.json", import.meta.url), "utf8");
const content = parseContent(JSON.parse(raw));

if (content === null) {
  throw new Error(
    "data/content/ is generated and is not in git. Run \"npm run content:build\" to regenerate it, or \"scripts/sync_data.sh --download\" to fetch the published copy."
  );
}

const words = content.words;
const components = componentIndex(content.kanji);

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function run(difficulty: (typeof DEFAULT_SETTINGS)["difficulty"], format: (typeof FORMATS)[number]) {
  const settings = {
    ...DEFAULT_SETTINGS,
    sets: ["places" as const],
    format,
    difficulty,
    questionCount: 0
  };
  return buildQuestions(settings, words, seeded(3), components);
}

const writtenForms = new Set(words.map((word) => word.written));

function isCrossing(target: Word, choice: string): boolean {
  const glyphs = [...target.written];
  const made = [...choice];
  if (glyphs.length !== 2 || made.length !== 2 || writtenForms.has(choice)) return false;
  return glyphs.filter((glyph, at) => glyph === made[at]).length === 1;
}

function distractorScores(
  questions: ReturnType<typeof run>,
  format: (typeof FORMATS)[number]
): number[] {
  const surface = usesAudio(format) ? "reading" : answerSurface(format);
  const scores: number[] = [];
  for (const question of questions) {
    const target = words.find((word) => word.id === question.wordId) as Word;
    for (const choice of question.choices) {
      if (choice === question.answer) continue;
      const candidate = words.find((word) => answerOf(word, format) === choice);
      if (candidate !== undefined) {
        scores.push(similarity(target, candidate, surface, components));
        continue;
      }
      scores.push(isCrossing(target, choice) ? SHARED_KANJI : 0);
    }
  }
  return scores;
}

describe("an expert run over the places set", () => {
  for (const format of FORMATS) {
    test(`leaves no distractor discardable on sight on ${format}`, () => {
      const questions = run("expert", format);
      expect(questions.length).toBeGreaterThan(0);
      expect(distractorScores(questions, format).filter((score) => score === 0)).toEqual([]);
    });
  }

  test("offers a crossed compound no level word is written as", () => {
    const crossed = run("expert", "kana-kanji").flatMap((question) => {
      const target = words.find((word) => word.id === question.wordId) as Word;
      return question.choices.filter(
        (choice) => choice !== question.answer && !writtenForms.has(choice)
      );
    });
    expect(crossed.length).toBeGreaterThan(0);
    expect(crossed.filter((choice) => writtenForms.has(choice))).toEqual([]);
  });

  test("still lets a beginner meet a distractor that shares nothing", () => {
    expect(distractorScores(run("beginner", "kanji-kana"), "kanji-kana")).toContain(0);
  });
});
