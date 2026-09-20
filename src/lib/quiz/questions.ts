import type { Word } from "../content/types";
import { normalizeReading } from "./romaji";
import { answerSurface, DEFAULT_SETTINGS, promptSurface } from "./settings";
import type { Format, RunSettings, WordShape } from "./settings";

export type Question = {
  index: number;
  wordId: string;
  prompt: string;
  answer: string;
  /** Every surface a typed answer may give. One entry when the answer is a form. */
  accepted: string[];
  choices: string[];
};

export type Answer = {
  wordId: string;
  correct: boolean;
  elapsedMs: number;
  given: string;
};

export function promptOf(word: Word, format: Format): string {
  return word[promptSurface(format)];
}

export function answerOf(word: Word, format: Format): string {
  return word[answerSurface(format)];
}

export function acceptedOf(word: Word, format: Format): string[] {
  return answerSurface(format) === "reading" ? word.readings : [answerOf(word, format)];
}

export function atLevel(words: readonly Word[], level: string): Word[] {
  const wanted = level.toLowerCase();
  return words.filter((word) => word.level.toLowerCase() === wanted);
}

/**
 * The one shape a word has. A word with kana after its kanji is okurigana even
 * when it carries two kanji, so the three shapes never overlap.
 */
export function wordShape(word: Word): WordShape {
  if (word.hasOkurigana) return "okurigana";
  return word.kanjiCount === 1 ? "1-kanji" : "2-kanji";
}

/**
 * A word is in play when its set is chosen, every kanji in it is chosen, and
 * its reading belongs to the class being asked for. Requiring every kanji is
 * what keeps 学校 out of a run built from 学 alone.
 */
export function eligibleWords(settings: RunSettings, words: readonly Word[]): Word[] {
  const sets = new Set(settings.sets);
  const kanji = new Set(settings.kanji);
  const shapes = new Set(settings.wordShapes);
  const excluded = new Set(settings.excludedWords);
  return atLevel(words, settings.level).filter((word) => {
    if (excluded.has(word.id)) return false;
    if (!sets.has(word.set)) return false;
    if (kanji.size > 0 && !word.kanji.every((character) => kanji.has(character))) return false;
    if (shapes.size > 0 && !shapes.has(wordShape(word))) return false;
    return true;
  });
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function buildChoices(
  target: Word,
  pool: readonly Word[],
  reserve: readonly Word[],
  format: Format,
  count: number,
  rng: () => number
): string[] {
  const answer = answerOf(target, format);
  const taken = new Set([answer]);
  const choices = [answer];

  const candidates = [...shuffle(pool, rng), ...shuffle(reserve, rng)];
  for (const candidate of candidates) {
    if (choices.length >= count) break;
    const surface = answerOf(candidate, format);
    if (taken.has(surface)) continue;
    taken.add(surface);
    choices.push(surface);
  }

  return shuffle(choices, rng);
}

function distinctSurfaces(words: readonly Word[], format: Format): number {
  return new Set(words.map((word) => answerOf(word, format))).size;
}

export function buildQuestions(
  settings: RunSettings,
  words: readonly Word[],
  rng: () => number = Math.random
): Question[] {
  const pool = eligibleWords(settings, words);
  if (pool.length === 0) return [];

  const everything = atLevel(words, settings.level);
  const distractors =
    distinctSurfaces(pool, settings.format) >= settings.choiceCount ? pool : everything;

  const total = settings.questionCount > 0 ? settings.questionCount : pool.length;
  const questions: Question[] = [];
  let bag: Word[] = [];

  for (let index = 0; index < total; index += 1) {
    if (bag.length === 0) bag = shuffle(pool, rng);
    const target = bag[bag.length - 1];
    bag.pop();
    questions.push({
      index,
      wordId: target.id,
      prompt: promptOf(target, settings.format),
      answer: answerOf(target, settings.format),
      accepted: acceptedOf(target, settings.format),
      choices:
        settings.answerStyle === "choice"
          ? buildChoices(
              target,
              distractors,
              everything,
              settings.format,
              settings.choiceCount,
              rng
            )
          : []
    });
  }

  return questions;
}

export function checkChoice(question: Question, choice: string): boolean {
  return choice === question.answer;
}

export function checkTyped(question: Question, typed: string): boolean {
  return question.accepted.includes(normalizeReading(typed));
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function word(id: string, set: Word["set"], extra: Partial<Word> = {}): Word {
    return {
      id: `${id}|${id}`,
      written: id,
      reading: `${id}reading`,
      readings: [`${id}reading`],
      glosses: [id],
      meaning: id,
      kanji: [id],
      kanjiCount: 1,
      hasOkurigana: false,
      set,
      level: "N5",
      ...extra
    };
  }

  const numbers = ["一", "二", "三", "四", "五", "六"].map((id) => word(id, "numbers"));
  const actions = ["行", "見", "聞"].map((id) => word(id, "actions"));
  const all = [...numbers, ...actions];

  describe("choosing the words a run may draw from", () => {
    test("keeps only the selected sets", () => {
      const settings = { ...DEFAULT_SETTINGS, sets: ["actions" as const] };
      expect(eligibleWords(settings, all)).toHaveLength(3);
    });

    test("keeps only the selected level", () => {
      const other = { ...word("山", "nature"), level: "N4" };
      const settings = { ...DEFAULT_SETTINGS, sets: ["nature" as const] };
      expect(eligibleWords(settings, [other])).toHaveLength(0);
    });

    test("keeps a word only when every kanji in it was picked", () => {
      const compound = word("学校", "places", { kanji: ["学", "校"] });
      const settings = {
        ...DEFAULT_SETTINGS,
        sets: ["places" as const],
        kanji: ["学"]
      };
      expect(eligibleWords(settings, [compound])).toHaveLength(0);
      expect(eligibleWords({ ...settings, kanji: ["学", "校"] }, [compound])).toHaveLength(1);
    });

    test("keeps the three shapes apart, so okurigana is not a single kanji", () => {
      const pool = [
        word("上", "position"),
        word("学校", "places", { kanji: ["学", "校"], kanjiCount: 2 }),
        word("上げる", "actions", { kanji: ["上"], hasOkurigana: true })
      ];
      const sets = ["position", "places", "actions"] as const;
      const settings = { ...DEFAULT_SETTINGS, sets: [...sets] };
      const writtenOf = (shape: WordShape) =>
        eligibleWords({ ...settings, wordShapes: [shape] }, pool).map((found) => found.written);
      expect(writtenOf("1-kanji")).toEqual(["上"]);
      expect(writtenOf("2-kanji")).toEqual(["学校"]);
      expect(writtenOf("okurigana")).toEqual(["上げる"]);
      expect(eligibleWords(settings, pool)).toHaveLength(3);
    });

    test("holds back a word the learner deselected by hand", () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        sets: ["numbers" as const],
        excludedWords: ["一|一", "二|二"]
      };
      const kept = eligibleWords(settings, all).map((word) => word.written);
      expect(kept).toEqual(["三", "四", "五", "六"]);
    });

    test("ignores an exclusion naming a word of another level", () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        sets: ["numbers" as const],
        excludedWords: ["山|山"]
      };
      expect(eligibleWords(settings, all)).toHaveLength(6);
    });

    test("draws on every kanji of the chosen sets when none was picked", () => {
      const settings = { ...DEFAULT_SETTINGS, sets: ["numbers" as const], kanji: [] };
      expect(eligibleWords(settings, all)).toHaveLength(6);
    });
  });

  describe("building a run", () => {
    const settings = { ...DEFAULT_SETTINGS, sets: ["numbers" as const], questionCount: 10 };

    test("asks exactly as many questions as were configured", () => {
      expect(buildQuestions(settings, all, seeded(1))).toHaveLength(10);
    });

    test("asks every eligible word once on a single pass", () => {
      const asked = buildQuestions({ ...settings, questionCount: 0 }, all, seeded(1));
      expect(asked).toHaveLength(6);
      expect(new Set(asked.map((question) => question.wordId)).size).toBe(6);
    });

    test("offers four distinct choices with the answer among them", () => {
      for (const question of buildQuestions(settings, all, seeded(2))) {
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices).toContain(question.answer);
      }
    });

test("asks the written form and answers the reading on kanji to reading", () => {
      const [question] = buildQuestions(settings, all, seeded(3));
      expect(question.prompt).not.toContain("reading");
      expect(question.answer).toContain("reading");
    });

    test("swaps the sides on kana to kanji", () => {
      const [question] = buildQuestions({ ...settings, format: "kana-kanji" }, all, seeded(3));
      expect(question.prompt).toContain("reading");
      expect(question.answer).not.toContain("reading");
    });

    test("asks the written form and answers the meaning on kanji to meaning", () => {
      const pool = [word("水", "nature", { meaning: "water" })];
      const [question] = buildQuestions(
        { ...settings, sets: ["nature"], format: "kanji-meaning" },
        pool,
        seeded(3)
      );
      expect(question.prompt).toBe("水");
      expect(question.answer).toBe("water");
      expect(question.accepted).toEqual(["water"]);
    });

    test("asks the reading and answers the meaning on kana to meaning", () => {
      const pool = [word("水", "nature", { reading: "みず", meaning: "water" })];
      const [question] = buildQuestions(
        { ...settings, sets: ["nature"], format: "kana-meaning" },
        pool,
        seeded(3)
      );
      expect(question.prompt).toBe("みず");
      expect(question.answer).toBe("water");
    });

    test("asks the meaning and answers the written form on meaning to word", () => {
      const pool = [word("水", "nature", { meaning: "water" })];
      const [question] = buildQuestions(
        { ...settings, sets: ["nature"], format: "meaning-word" },
        pool,
        seeded(3)
      );
      expect(question.prompt).toBe("water");
      expect(question.answer).toBe("水");
    });

    test("accepts every reading only where the reading is the answer", () => {
      const seven = word("七", "numbers", {
        reading: "なな",
        readings: ["なな", "しち"],
        meaning: "seven"
      });
      expect(acceptedOf(seven, "kanji-reading")).toEqual(["なな", "しち"]);
      expect(acceptedOf(seven, "kanji-meaning")).toEqual(["seven"]);
      expect(acceptedOf(seven, "meaning-word")).toEqual(["七"]);
    });

    test("borrows distractors from the whole level when the selection is too small", () => {
      const tiny = { ...settings, sets: ["nature" as const], questionCount: 4 };
      const pool = [word("木", "nature"), ...numbers];
      const questions = buildQuestions(tiny, pool, seeded(4));
      expect(questions).toHaveLength(4);
      for (const question of questions) {
        expect(question.wordId).toBe("木|木");
        expect(question.choices).toHaveLength(4);
        expect(question.choices).toContain(question.answer);
      }
    });

    test("returns nothing when no set was selected", () => {
      expect(buildQuestions({ ...settings, sets: [] }, all, seeded(5))).toEqual([]);
    });

    test("draws every word once before repeating any", () => {
      const asked = buildQuestions({ ...settings, questionCount: 6 }, all, seeded(6)).map(
        (question) => question.wordId
      );
      expect(new Set(asked).size).toBe(6);
    });

    test("leaves the choices empty when the learner is typing", () => {
      const typed = { ...settings, answerStyle: "typing" as const };
      expect(buildQuestions(typed, all, seeded(7))[0].choices).toEqual([]);
    });
  });

  describe("judging an answer", () => {
    const [question] = buildQuestions(
      { ...DEFAULT_SETTINGS, sets: ["numbers"], questionCount: 1 },
      all,
      seeded(8)
    );

    test("accepts the answer surface and refuses another one", () => {
      expect(checkChoice(question, question.answer)).toBe(true);
      expect(checkChoice(question, "nonsense")).toBe(false);
    });

    test("ignores space around a typed answer", () => {
      expect(checkTyped(question, `  ${question.answer} `)).toBe(true);
    });

    test("accepts a reading that was typed as romaji", () => {
      const reading = { ...question, answer: "がっこう", accepted: ["がっこう"] };
      expect(checkTyped(reading, "gakkou")).toBe(true);
      expect(checkTyped(reading, "gakko")).toBe(false);
    });

    test("accepts any reading the word carries, not only the pinned one", () => {
      const seven = word("七", "numbers", {
        reading: "なな",
        readings: ["なな", "しち"]
      });
      const [asked] = buildQuestions(
        { ...DEFAULT_SETTINGS, sets: ["numbers"], answerStyle: "typing", questionCount: 1 },
        [seven],
        seeded(9)
      );
      expect(checkTyped(asked, "しち")).toBe(true);
      expect(checkTyped(asked, "shichi")).toBe(true);
      expect(checkTyped(asked, "はち")).toBe(false);
    });
  });
}
