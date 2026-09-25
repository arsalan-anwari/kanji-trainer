import { SUBCATEGORIES, subcategoryKey } from "../content/sets";
import type { Word } from "../content/types";
import { audioUrl, imageUrl } from "./hints";
import { normalizeReading } from "./romaji";
import { answerSurface, DEFAULT_SETTINGS, DIFFICULTIES, FORMATS, isAssembly, promptSurface, showsWritten, usesAudio } from "./settings";
import { buildPuzzle, canAssemble, shapesOf, type Puzzle, type Shapes } from "./assemble";
import type { Difficulty, Format, RunSettings, Surface, WordShape } from "./settings";
import { similarity, type ComponentIndex } from "./similarity";
import { shuffle } from "./shuffle";

export type Question = {
  index: number;
  wordId: string;
  prompt: string;
  answer: string;
  /** Every surface a typed answer may give. One entry when the answer is a form. */
  accepted: string[];
  choices: string[];
  puzzle?: Puzzle;
};

export type Answer = {
  wordId: string;
  correct: boolean;
  elapsedMs: number;
  given: string;
  timedOut: boolean;
};

function surfaceOf(word: Word, surface: Surface): string {
  if (surface === "image") return imageUrl(word);
  if (surface === "audio") return audioUrl(word);
  return word[surface];
}

export function promptOf(word: Word, format: Format): string {
  return surfaceOf(word, promptSurface(format));
}

export function answerOf(word: Word, format: Format): string {
  const surface = answerSurface(format);
  return surface === "image" ? "" : surfaceOf(word, surface);
}

export function acceptedOf(word: Word, format: Format): string[] {
  const surface = answerSurface(format);
  if (surface === "reading") return word.readings;
  if (surface === "meaning") return word.glosses;
  return [answerOf(word, format)];
}

export function atLevel(words: readonly Word[], level: string): Word[] {
  const wanted = level.toLowerCase();
  return words.filter((word) => word.level.toLowerCase() === wanted);
}

/** Whether the format can ask the word at all, whatever else the run picked. */
export function suitsFormat(word: Word, format: Format, cuts: Shapes = new Map()): boolean {
  if (word.shape === "kana" && showsWritten(format)) return false;
  if (isAssembly(format) && !canAssemble(word, cuts)) return false;
  return word.hasAudio || !usesAudio(format);
}

/** The packs among `words` the format can ask none of. */
export function unsuitedPacks(words: readonly Word[], format: Format, cuts: Shapes = new Map()): string[] {
  const suited = new Set(words.filter((word) => suitsFormat(word, format, cuts)).map((word) => word.pack));
  return [...new Set(words.map((word) => word.pack))].filter((pack) => !suited.has(pack));
}

/**
 * The words the learner picked: set, subcategory, shape and pack chosen, not
 * held back by hand. Some of them the format may still be unable to ask.
 */
export function pickedWords(settings: RunSettings, words: readonly Word[]): Word[] {
  const sets = new Set(settings.sets);
  const subcategories = new Set(settings.subcategories);
  const shapes = new Set(settings.wordShapes);
  const packs = new Set(settings.packs);
  const excluded = new Set(settings.excludedWords);
  return atLevel(words, settings.level).filter((word) => {
    if (excluded.has(word.id)) return false;
    if (!sets.has(word.set)) return false;
    if (subcategories.size > 0 && !subcategories.has(subcategoryKey(word.set, word.subcategory)))
      return false;
    if (packs.size > 0 && !packs.has(word.pack)) return false;
    return shapes.size === 0 || shapes.has(word.shape);
  });
}

/** The picked words the format can ask: what a run draws from. */
export function eligibleWords(
  settings: RunSettings,
  words: readonly Word[],
  cuts: Shapes = new Map()
): Word[] {
  return pickedWords(settings, words).filter((word) => suitsFormat(word, settings.format, cuts));
}

export function startHint(settings: RunSettings, words: readonly Word[]): string {
  const chosen = pickedWords(settings, words);
  const onlyKana = chosen.length > 0 && chosen.every((word) => word.shape === "kana");
  return onlyKana && showsWritten(settings.format) ? "setup.kanaHint" : "setup.startHint";
}

export function similarCount(difficulty: Difficulty): number {
  if (difficulty === "expert") return 3;
  return difficulty === "advanced" ? 1 : 0;
}

function scoredSurface(format: Format): Surface {
  return usesAudio(format) ? "reading" : answerSurface(format);
}

export function soundsAlike(target: Word, candidate: Word): boolean {
  return target.readings.some((reading) => candidate.readings.includes(reading));
}

/**
 * Whether the prompt alone cannot tell the two words apart: 一日 shown on its
 * own is いちにち and ついたち alike, and はし heard is 橋 and 箸 alike.
 */
export function sharesPrompt(target: Word, candidate: Word, format: Format): boolean {
  const heard = promptSurface(format) === "reading" || promptSurface(format) === "audio";
  return (heard && soundsAlike(target, candidate)) || promptOf(target, format) === promptOf(candidate, format);
}

function byScore(
  target: Word,
  candidates: readonly Word[],
  format: Format,
  components: ComponentIndex
): Word[] {
  const surface = scoredSurface(format);
  return candidates
    .map((candidate) => ({ candidate, score: similarity(target, candidate, surface, components) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
}

function crossable(word: Word): string[] | null {
  const glyphs = [...word.written];
  if (glyphs.length !== 2 || word.shape !== "2-kanji") return null;
  return glyphs;
}

export function crossings(
  target: Word,
  others: readonly Word[],
  real: ReadonlySet<string>
): string[] {
  const glyphs = crossable(target);
  if (glyphs === null) return [];
  const crossed: string[] = [];
  for (const other of others) {
    const swap = crossable(other);
    if (swap === null) continue;
    for (const at of [0, 1]) {
      const made = glyphs.map((glyph, index) => (index === at ? swap[at] : glyph)).join("");
      if (made === target.written || real.has(made) || crossed.includes(made)) continue;
      if (swap[at] === glyphs[1 - at]) continue;
      crossed.push(made);
    }
  }
  return crossed;
}

const CROSSING_SLOTS = 1;

function buildChoices(
  target: Word,
  pool: readonly Word[],
  reserve: readonly Word[],
  format: Format,
  count: number,
  rng: () => number,
  difficulty: Difficulty,
  components: ComponentIndex
): string[] {
  const answer = answerOf(target, format);
  const taken = new Set([answer]);
  const choices = [answer];

  const take = (surfaces: readonly string[], limit: number) => {
    for (const surface of surfaces) {
      if (choices.length >= limit) break;
      if (taken.has(surface)) continue;
      taken.add(surface);
      choices.push(surface);
    }
  };

  const surfaces = (candidates: readonly Word[]) =>
    candidates.map((candidate) => answerOf(candidate, format));

  const listening = usesAudio(format);
  const fair = (candidates: readonly Word[]) =>
    candidates.filter(
      (candidate) => !sharesPrompt(target, candidate, format) && !(listening && soundsAlike(target, candidate))
    );
  const drawn = fair(pool);
  const spare = fair(reserve);

  const similar = similarCount(difficulty);
  if (similar > 0) {
    const scored = [...shuffle(drawn, rng), ...shuffle(spare, rng)];
    if (difficulty === "expert" && !listening && answerSurface(format) === "written") {
      const real = new Set(reserve.map((word) => word.written));
      take(crossings(target, scored, real), choices.length + CROSSING_SLOTS);
    }
    take(surfaces(byScore(target, scored, format, components)), Math.min(count, similar + 1));
  }

  const rest = [...shuffle(drawn, rng), ...shuffle(spare, rng)];
  if (listening && difficulty === "beginner") {
    const heardApart = (candidate: Word) => similarity(target, candidate, "reading") === 0;
    take(surfaces(rest.filter(heardApart)), count);
  }
  take(surfaces(rest), count);

  return shuffle(choices, rng);
}

function distinctSurfaces(words: readonly Word[], format: Format): number {
  return new Set(words.map((word) => answerOf(word, format))).size;
}

export function buildQuestions(
  settings: RunSettings,
  words: readonly Word[],
  rng: () => number = Math.random,
  components: ComponentIndex = new Map(),
  shapes: Shapes = new Map()
): Question[] {
  const pool = eligibleWords(settings, words, shapes);
  const assembly = isAssembly(settings.format);
  if (pool.length === 0) return [];

  const everything = atLevel(words, settings.level).filter(
    (word) => word.hasAudio || !usesAudio(settings.format)
  );
  const distractors =
    distinctSurfaces(pool, settings.format) >= settings.choiceCount ? pool : everything;

  const total = settings.questionCount > 0 ? settings.questionCount : pool.length;
  const questions: Question[] = [];
  let bag: Word[] = [];

  for (let index = 0; index < total; index += 1) {
    if (bag.length === 0) bag = shuffle(pool, rng);
    const target = bag[bag.length - 1];
    bag.pop();
    const puzzle = assembly ? buildPuzzle(target, shapes, settings.difficulty, rng) : null;
    questions.push({
      ...(puzzle === null ? {} : { puzzle }),
      index,
      wordId: target.id,
      prompt: promptOf(target, settings.format),
      answer: answerOf(target, settings.format),
      accepted: [
        ...new Set(
          [target, ...words.filter((word) => sharesPrompt(target, word, settings.format))].flatMap((word) =>
            acceptedOf(word, settings.format)
          )
        )
      ],
      choices:
        settings.answerStyle === "choice" && !assembly
          ? buildChoices(
              target,
              distractors,
              everything,
              settings.format,
              settings.choiceCount,
              rng,
              settings.difficulty,
              components
            )
          : []
    });
  }

  return questions;
}

export function checkChoice(question: Question, choice: string): boolean {
  return choice === question.answer;
}

export function checkTyped(question: Question, typed: string, format: Format): boolean {
  if (answerSurface(format) === "reading") {
    return question.accepted.includes(normalizeReading(typed));
  }
  const given = typed.trim().toLowerCase();
  return question.accepted.some((accepted) => accepted.toLowerCase() === given);
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
    const meaning = extra.meaning ?? id;
    return {
      id: `${id}|${id}`,
      written: id,
      reading: `${id}reading`,
      readings: [`${id}reading`],
      glosses: [meaning],
      meaning,
      clue: "",
      kanji: [id],
      shape: "1-kanji",
      hasAudio: true,
      set,
      subcategory: SUBCATEGORIES[set][0],
      level: "N5",
      pack: "n5-base",
      file: meaning,
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

    test("keeps a word only when its subcategory was picked", () => {
      const compound = word("学校", "places", { kanji: ["学", "校"] });
      const settings = {
        ...DEFAULT_SETTINGS,
        sets: ["places" as const],
        subcategories: ["places/transport"]
      };
      expect(eligibleWords(settings, [compound])).toHaveLength(0);
      expect(
        eligibleWords({ ...settings, subcategories: ["places/buildings"] }, [compound])
      ).toHaveLength(1);
    });

    test("keeps the three shapes apart, so okurigana is not a single kanji", () => {
      const pool = [
        word("上", "position"),
        word("学校", "places", { kanji: ["学", "校"], shape: "2-kanji" }),
        word("上げる", "actions", { kanji: ["上"], shape: "okurigana" })
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

    test("offers a kana word only where neither side is the written form", () => {
      const kana = word("とても", "describing", { kanji: [], shape: "kana" });
      const settings = { ...DEFAULT_SETTINGS, sets: ["describing" as const] };
      const offered = FORMATS.filter((format) => eligibleWords({ ...settings, format }, [kana]).length === 1);
      expect(offered).toEqual(["kana-meaning", "meaning-kana", "image-kana", "audio-kana"]);
    });

    test("draws only from the packs asked for, and names a pack the format can ask none of", () => {
      const kana = word("とても", "describing", { kanji: [], shape: "kana", pack: "n5-kana" });
      const hill = word("山", "describing");
      const settings = { ...DEFAULT_SETTINGS, sets: ["describing" as const] };
      expect(eligibleWords({ ...settings, packs: ["n5-kana"], format: "kana-meaning" }, [kana, hill])).toEqual([kana]);
      expect(eligibleWords({ ...settings, packs: [hill.pack], format: "kana-meaning" }, [kana, hill])).toEqual([hill]);
      expect(unsuitedPacks([kana, hill], "kana-kanji")).toEqual(["n5-kana"]);
      expect(unsuitedPacks([kana, hill], "kana-meaning")).toEqual([]);
    });

    test("explains an empty pool of kana words by the format, not the sets", () => {
      const kana = word("とても", "describing", { kanji: [], shape: "kana" });
      const settings = { ...DEFAULT_SETTINGS, sets: ["describing" as const] };
      expect(startHint({ ...settings, format: "kanji-kana" }, [kana])).toBe("setup.kanaHint");
      expect(startHint({ ...DEFAULT_SETTINGS, format: "kanji-kana" }, [kana])).toBe("setup.startHint");
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

    test("draws on every subcategory of the chosen sets when none was picked", () => {
      const settings = { ...DEFAULT_SETTINGS, sets: ["numbers" as const], subcategories: [] };
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

test("asks the written form and answers the reading on kanji to kana", () => {
      const [question] = buildQuestions(settings, all, seeded(3));
      expect(question.prompt).not.toContain("reading");
      expect(question.answer).toContain("reading");
    });

    test("builds a puzzle from the reading on assemble, with no choices", () => {
      const shapes = shapesOf({ 一: [{ element: "一", rect: [0, 0, 4, 4], strokes: ["M0,0"] }] }, []);
      const assembly = { ...settings, format: "kana-assemble" as const };
      const questions = buildQuestions(assembly, all, seeded(3), new Map(), shapes);
      expect(questions.every((question) => question.wordId === "一|一")).toBe(true);
      expect(questions[0].prompt).toBe("一reading");
      expect(questions[0].choices).toEqual([]);
      expect(questions[0].puzzle?.slots.map((slot) => slot.element)).toEqual(["一"]);
    });

    test("leaves out a word whose kanji have no parts on assemble", () => {
      expect(eligibleWords({ ...settings, format: "kana-assemble" }, all)).toEqual([]);
    });

    test("swaps the sides on kana to kanji", () => {
      const [question] = buildQuestions({ ...settings, format: "kana-kanji" }, all, seeded(3));
      expect(question.prompt).toContain("reading");
      expect(question.answer).not.toContain("reading");
    });

    test("asks the written form and answers the meaning on kanji to meaning", () => {
      const pool = [word("水", "nature", { subcategory: "elements", meaning: "water" })];
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

    test("asks the meaning and answers the written form on meaning to kanji", () => {
      const pool = [word("水", "nature", { subcategory: "elements", meaning: "water" })];
      const [question] = buildQuestions(
        { ...settings, sets: ["nature"], format: "meaning-kanji" },
        pool,
        seeded(3)
      );
      expect(question.prompt).toBe("water");
      expect(question.answer).toBe("水");
    });

    test("asks a picture and answers the written form on image to kanji", () => {
      const pool = [word("水", "nature", { subcategory: "elements", meaning: "water" })];
      const [question] = buildQuestions(
        { ...settings, sets: ["nature"], format: "image-kanji" },
        pool,
        seeded(3)
      );
      expect(question.prompt).toBe("/packs/n5-base/images/nature/elements/water.webp");
      expect(question.answer).toBe("水");
    });

    test("accepts every reading only where the reading is the answer, and every gloss where the meaning is", () => {
      const seven = word("七", "numbers", {
        reading: "なな",
        readings: ["なな", "しち"],
        meaning: "seven",
        glosses: ["seven", "7"]
      });
      expect(acceptedOf(seven, "kanji-kana")).toEqual(["なな", "しち"]);
      expect(acceptedOf(seven, "kanji-meaning")).toEqual(["seven", "7"]);
      expect(acceptedOf(seven, "meaning-kanji")).toEqual(["七"]);
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

  describe("choosing distractors by difficulty", () => {
    const schools = [
      word("学校", "places", { kanji: ["学", "校"], shape: "2-kanji" }),
      word("学生", "places", { kanji: ["学", "生"], shape: "2-kanji" }),
      word("大学", "places", { kanji: ["大", "学"], shape: "2-kanji" }),
      word("高校", "places", { kanji: ["高", "校"], shape: "2-kanji" }),
      word("山", "nature"),
      word("川", "nature"),
      word("木", "nature")
    ];
    const settings = {
      ...DEFAULT_SETTINGS,
      sets: ["places" as const, "nature" as const],
      format: "kana-kanji" as const,
      questionCount: 1,
      excludedWords: schools.filter((entry) => entry.written !== "学校").map((entry) => entry.id)
    };
    const target = schools[0];
    const scores = (question: Question) =>
      question.choices
        .filter((choice) => choice !== question.answer)
        .map((choice) => {
          const found = schools.find((entry) => entry.written === choice);
          return found === undefined ? crossing : similarity(target, found, "written");
        });
    const crossing = -1;
    const real = new Set(schools.map((entry) => entry.written));

    test("gives an expert every distractor that scores against the answer", () => {
      const [question] = buildQuestions({ ...settings, difficulty: "expert" }, schools, seeded(11));
      expect(question.choices).toHaveLength(4);
      expect(scores(question).filter((score) => score === 0)).toEqual([]);
    });

    test("crosses two compounds into a string that is no word of the level", () => {
      const made = crossings(target, schools, real);
      expect(made).toEqual(["大校"]);
      expect(made.filter((entry) => real.has(entry))).toEqual([]);
      expect(made).not.toContain(target.written);
      expect(made.every((entry) => [...entry].length === 2)).toBe(true);
    });

    test("crosses nothing into a word that is not two kanji", () => {
      expect(crossings(schools[4], schools, real)).toEqual([]);
      const tail = word("上げる", "actions", { shape: "okurigana" });
      expect(crossings(tail, schools, real)).toEqual([]);
    });

    test("offers an expert one crossed compound where the answer is written", () => {
      const [question] = buildQuestions({ ...settings, difficulty: "expert" }, schools, seeded(11));
      expect(scores(question).filter((score) => score === crossing)).toHaveLength(1);
    });

    test("leaves a beginner the draw it had before difficulty existed", () => {
      const [question] = buildQuestions(settings, schools, seeded(11));
      expect(question.choices).toHaveLength(4);
      expect(scores(question)).toContain(0);
    });

    test("fills one slot on advanced and none on beginner", () => {
      expect(DIFFICULTIES.map(similarCount)).toEqual([0, 1, 3]);
    });
  });

  describe("two words behind one prompt", () => {
    const day = (reading: string, meaning: string) =>
      word("一日", "calendar", { id: `一日|${reading}`, reading, readings: [reading], meaning });
    const oneDay = day("いちにち", "one day");
    const first = day("ついたち", "1st of the month");
    const others = ["二日", "三日", "四日", "五日"].map((id) => word(id, "calendar"));
    const words = [oneDay, first, ...others];
    const settings = {
      ...DEFAULT_SETTINGS,
      sets: ["calendar" as const],
      questionCount: 1,
      excludedWords: [first.id, ...others.map((entry) => entry.id)]
    };

    test("never offers the other word as a wrong choice, so only one choice is right", () => {
      for (const format of ["kanji-kana", "kanji-meaning", "kanji-audio"] as const) {
        for (let seed = 0; seed < 20; seed += 1) {
          const [question] = buildQuestions({ ...settings, format }, words, seeded(seed));
          expect(question.choices).not.toContain(answerOf(first, format));
        }
      }
    });

    test("accepts either word when typed, since the prompt cannot say which was meant", () => {
      const typing = { ...settings, answerStyle: "typing" as const };
      const [reading] = buildQuestions({ ...typing, format: "kanji-kana" }, words, seeded(1));
      expect(checkTyped(reading, "ついたち", "kanji-kana")).toBe(true);
      const [meaning] = buildQuestions({ ...typing, format: "kanji-meaning" }, words, seeded(1));
      expect(meaning.accepted).toEqual(["one day", "1st of the month"]);
    });

    test("keeps the two apart where the prompt differs", () => {
      const typing = { ...settings, answerStyle: "typing" as const };
      const [question] = buildQuestions({ ...typing, format: "meaning-kana" }, words, seeded(1));
      expect(question.accepted).toEqual(["いちにち"]);
    });
  });

  describe("choosing distractors for a word that is heard", () => {
    const heard = (written: string, reading: string, meaning: string) =>
      word(written, "nature", { reading, readings: [reading], meaning, id: `${written}|${reading}` });
    const persimmon = heard("柿", "かき", "persimmon");
    const key = heard("鍵", "かぎ", "key");
    const oyster = heard("牡蠣", "かき", "oyster");
    const summer = heard("夏期", "かきごおり", "shaved ice");
    const hedge = heard("垣", "かきね", "hedge");
    const apart = [
      heard("山", "やま", "mountain"),
      heard("川", "かわ", "river"),
      heard("水", "みず", "water"),
      heard("空", "そら", "sky"),
      heard("森", "もり", "forest")
    ];
    const words = [persimmon, key, oyster, summer, ...apart];
    const settings = {
      ...DEFAULT_SETTINGS,
      sets: ["nature" as const],
      questionCount: 1,
      excludedWords: words.filter((entry) => entry !== persimmon).map((entry) => entry.id)
    };
    const picked = (question: Question) =>
      question.choices
        .filter((choice) => choice !== question.answer)
        .flatMap((choice) =>
          [...words, hedge].filter((entry) =>
            [audioUrl(entry), entry.written, entry.reading].includes(choice)
          )
        );

    test("asks a recording and answers the reading or the written word", () => {
      const [kana] = buildQuestions({ ...settings, format: "audio-kana" }, words, seeded(1));
      expect(kana.prompt).toBe(`/packs/n5-base/audio/nature/${SUBCATEGORIES.nature[0]}/persimmon.mp3`);
      expect(kana.answer).toBe("かき");
      const [recording] = buildQuestions({ ...settings, format: "kanji-audio" }, words, seeded(1));
      expect(recording.prompt).toBe("柿");
      expect(recording.answer).toBe(audioUrl(persimmon));
      expect(recording.accepted).toEqual([audioUrl(persimmon)]);
    });

    test("leaves a word with no recording out of every listening run", () => {
      const silent = [{ ...persimmon, hasAudio: false }, ...apart];
      const open = { ...settings, excludedWords: [] };
      expect(eligibleWords({ ...open, format: "audio-kana" }, silent)).toHaveLength(apart.length);
      expect(eligibleWords({ ...open, format: "kanji-kana" }, silent)).toHaveLength(silent.length);
      const [question] = buildQuestions(
        { ...open, format: "kanji-audio", excludedWords: apart.slice(1).map((entry) => entry.id) },
        silent,
        seeded(2)
      );
      expect(question.choices).toHaveLength(4);
      expect(question.choices).not.toContain(audioUrl(persimmon));
    });

    test("never offers a homophone, which would be a second right answer", () => {
      for (const format of ["audio-kanji", "kanji-audio"] as const) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 1; seed <= 20; seed += 1) {
            const [question] = buildQuestions({ ...settings, format, difficulty }, words, seeded(seed));
            expect(picked(question)).not.toContain(oyster);
            expect(question.choices).toHaveLength(4);
          }
        }
      }
    });

    test("keeps a beginner's distractors clear of anything that sounds close", () => {
      for (const format of ["audio-kana", "audio-kanji", "kanji-audio"] as const) {
        for (let seed = 1; seed <= 20; seed += 1) {
          const [question] = buildQuestions({ ...settings, format }, words, seeded(seed));
          const close = picked(question).filter(
            (entry) => entry !== persimmon && similarity(persimmon, entry, "reading") > 0
          );
          expect(close).toEqual([]);
        }
      }
    });

    test("falls back to close sounds when nothing far enough is left", () => {
      const [question] = buildQuestions(
        { ...settings, format: "audio-kana" },
        [persimmon, key, summer, hedge, apart[0]],
        seeded(3)
      );
      expect(question.choices).toHaveLength(4);
    });

    test("gives an expert minimal pairs scored on the sound, not the writing", () => {
      const [question] = buildQuestions(
        { ...settings, format: "audio-kanji", difficulty: "expert" },
        [...words, hedge],
        seeded(4)
      );
      const distractors = picked(question).filter((entry) => entry !== persimmon);
      expect(distractors.every((entry) => similarity(persimmon, entry, "reading") > 0)).toBe(true);
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
      expect(checkTyped(question, `  ${question.answer} `, DEFAULT_SETTINGS.format)).toBe(true);
    });

    test("accepts a reading that was typed as romaji", () => {
      const reading = { ...question, answer: "がっこう", accepted: ["がっこう"] };
      expect(checkTyped(reading, "gakkou", "kanji-kana")).toBe(true);
      expect(checkTyped(reading, "gakko", "kanji-kana")).toBe(false);
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
      expect(checkTyped(asked, "しち", "kanji-kana")).toBe(true);
      expect(checkTyped(asked, "shichi", "kanji-kana")).toBe(true);
      expect(checkTyped(asked, "はち", "kanji-kana")).toBe(false);
    });

    test("accepts a typed meaning against any gloss, ignoring case", () => {
      const pool = [word("水", "nature", { meaning: "water", glosses: ["water", "H2O"] })];
      const [asked] = buildQuestions(
        {
          ...DEFAULT_SETTINGS,
          sets: ["nature"],
          format: "kanji-meaning",
          answerStyle: "typing",
          questionCount: 1
        },
        pool,
        seeded(10)
      );
      expect(checkTyped(asked, "Water", "kanji-meaning")).toBe(true);
      expect(checkTyped(asked, "h2o", "kanji-meaning")).toBe(true);
      expect(checkTyped(asked, "ice", "kanji-meaning")).toBe(false);
    });
  });
}
