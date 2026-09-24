import { isSetId, isSubcategoryKey } from "../content/sets";
import type { SetId } from "../content/sets";

export type Format =
  | "kanji-kana"
  | "kana-kanji"
  | "kanji-meaning"
  | "meaning-kanji"
  | "kana-meaning"
  | "meaning-kana"
  | "image-kanji"
  | "image-kana"
  | "audio-kana"
  | "audio-kanji"
  | "kanji-audio";
export type Surface = "written" | "reading" | "meaning" | "image" | "audio";
export type Category = "reading" | "meaning" | "visualize" | "listening";
export type AnswerStyle = "choice" | "typing";
export type WordShape = "1-kanji" | "2-kanji" | "okurigana";
export type Difficulty = "beginner" | "advanced" | "expert";

export type RunSettings = {
  level: string;
  sets: SetId[];
  /**
   * The (set, subcategory) pairs a run may draw on, as `set/subcategory`.
   * Empty means every subcategory of the chosen sets.
   */
  subcategories: string[];
  format: Format;
  answerStyle: AnswerStyle;
  choiceCount: number;
  /** 0 asks every eligible word exactly once. */
  questionCount: number;
  /** Word shape filters. Empty array means allow all. */
  wordShapes: WordShape[];
  /** Word ids held back by hand. Empty means every word the filters allow. */
  excludedWords: string[];
  /** How believable the wrong answers are. */
  difficulty: Difficulty;
  perQuestionSeconds: number;
  totalSeconds: number;
};

export const DIFFICULTIES: readonly Difficulty[] = ["beginner", "advanced", "expert"];

export const CATEGORIES: readonly Category[] = ["reading", "meaning", "visualize", "listening"];

export const DIRECTIONS_BY_CATEGORY: Record<Category, readonly Format[]> = {
  reading: ["kanji-kana", "kana-kanji"],
  meaning: ["kanji-meaning", "meaning-kanji", "kana-meaning", "meaning-kana"],
  visualize: ["image-kanji", "image-kana"],
  listening: ["audio-kana", "audio-kanji", "kanji-audio"]
};

export const FORMATS: readonly Format[] = CATEGORIES.flatMap(
  (category) => DIRECTIONS_BY_CATEGORY[category]
);

const CATEGORY_OF: Record<Format, Category> = Object.fromEntries(
  CATEGORIES.flatMap((category) => DIRECTIONS_BY_CATEGORY[category].map((format) => [format, category]))
) as Record<Format, Category>;

export function categoryOf(format: Format): Category {
  return CATEGORY_OF[format];
}

const SIDES: Record<Format, { prompt: Surface; answer: Surface }> = {
  "kanji-kana": { prompt: "written", answer: "reading" },
  "kana-kanji": { prompt: "reading", answer: "written" },
  "kanji-meaning": { prompt: "written", answer: "meaning" },
  "meaning-kanji": { prompt: "meaning", answer: "written" },
  "kana-meaning": { prompt: "reading", answer: "meaning" },
  "meaning-kana": { prompt: "meaning", answer: "reading" },
  "image-kanji": { prompt: "image", answer: "written" },
  "image-kana": { prompt: "image", answer: "reading" },
  "audio-kana": { prompt: "audio", answer: "reading" },
  "audio-kanji": { prompt: "audio", answer: "written" },
  "kanji-audio": { prompt: "written", answer: "audio" }
};

export function promptSurface(format: Format): Surface {
  return SIDES[format].prompt;
}

export function answerSurface(format: Format): Surface {
  return SIDES[format].answer;
}

export function usesAudio(format: Format): boolean {
  return categoryOf(format) === "listening";
}

export function isJapanese(surface: Surface): boolean {
  return surface === "written" || surface === "reading";
}

export const ANSWER_STYLES: readonly AnswerStyle[] = ["choice", "typing"];

export function answerStylesFor(format: Format): readonly AnswerStyle[] {
  return answerSurface(format) === "audio" ? ["choice"] : ANSWER_STYLES;
}
export const CHOICE_COUNTS: readonly number[] = [4];

export const QUESTION_COUNT_ROWS: readonly (readonly number[])[] = [
  [10, 20, 30, 40, 50],
  [60, 80, 100, 150, 200]
];

export const QUESTION_COUNTS: readonly number[] = QUESTION_COUNT_ROWS.flat();

export const ONE_PASS = 0;

export const CUSTOM_COUNT_MIN = 5;
export const CUSTOM_COUNT_MAX = 500;
export const CUSTOM_COUNT_STEP = 5;

export const CUSTOM_COUNT_VALUES: readonly number[] = Array.from(
  { length: (CUSTOM_COUNT_MAX - CUSTOM_COUNT_MIN) / CUSTOM_COUNT_STEP + 1 },
  (_, index) => CUSTOM_COUNT_MIN + index * CUSTOM_COUNT_STEP
);

export const PER_QUESTION_SECONDS: readonly number[] = [0, 5, 10, 15];
export const TOTAL_SECONDS: readonly number[] = [0, 60, 120, 300];

export const CUSTOM_PER_QUESTION_MAX = 100;
export const CUSTOM_TOTAL_MINUTES_MAX = 100;

export function isCustomTime(seconds: number, options: readonly number[]): boolean {
  return seconds > 0 && !options.includes(seconds);
}

export function remainingMs(limitSeconds: number, elapsedMs: number): number | null {
  return limitSeconds === 0 ? null : Math.max(0, limitSeconds * 1000 - elapsedMs);
}

const WARNING_MS = 5000;

export function isNearlyOut(leftMs: number | null, limitSeconds: number): boolean {
  return leftMs !== null && limitSeconds * 1000 > WARNING_MS && leftMs > 0 && leftMs <= WARNING_MS;
}

function normalizeSeconds(seconds: number, max: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(max, Math.max(0, Math.round(seconds)));
}

export const DEFAULT_SETTINGS: RunSettings = {
  level: "N5",
  sets: [],
  subcategories: [],
  format: "kanji-kana",
  answerStyle: "choice",
  choiceCount: 4,
  questionCount: 20,
  wordShapes: [],
  excludedWords: [],
  difficulty: "beginner",
  perQuestionSeconds: 0,
  totalSeconds: 0
};

export function isCustomCount(count: number): boolean {
  return count > 0 && !QUESTION_COUNTS.includes(count);
}

export function clampCustomCount(count: number): number {
  if (!Number.isFinite(count)) return CUSTOM_COUNT_MIN;
  const stepped = Math.round(count / CUSTOM_COUNT_STEP) * CUSTOM_COUNT_STEP;
  return Math.min(CUSTOM_COUNT_MAX, Math.max(CUSTOM_COUNT_MIN, stepped));
}

function normalizeCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_SETTINGS.questionCount;
  const whole = Math.round(count);
  if (whole === ONE_PASS) return ONE_PASS;
  if (QUESTION_COUNTS.includes(whole)) return whole;
  return Math.min(CUSTOM_COUNT_MAX, Math.max(CUSTOM_COUNT_MIN, whole));
}

export function normalizeSettings(settings: RunSettings): {
  settings: RunSettings;
  notes: string[];
} {
  const notes: string[] = [];
  const next: RunSettings = { ...settings };

  if (!CHOICE_COUNTS.includes(next.choiceCount)) {
    next.choiceCount = DEFAULT_SETTINGS.choiceCount;
  }

  next.questionCount = normalizeCount(next.questionCount);
  next.perQuestionSeconds = normalizeSeconds(next.perQuestionSeconds, CUSTOM_PER_QUESTION_MAX);
  next.totalSeconds = normalizeSeconds(next.totalSeconds, CUSTOM_TOTAL_MINUTES_MAX * 60);
  if (!answerStylesFor(next.format).includes(next.answerStyle)) next.answerStyle = "choice";

  return { settings: next, notes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickSets(value: unknown): SetId[] {
  if (!Array.isArray(value)) return [];
  const out: SetId[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && isSetId(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

function pickText(value: unknown, keep: (entry: string) => boolean): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && keep(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

export function pickSubcategories(value: unknown): string[] {
  return pickText(value, isSubcategoryKey);
}

export function pickWordIds(value: unknown): string[] {
  return pickText(value, (entry) => entry !== "");
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

export const WORD_SHAPES: readonly WordShape[] = ["1-kanji", "2-kanji", "okurigana"];

function pickWordShapes(value: unknown): WordShape[] {
  if (!Array.isArray(value)) return [];
  const out: WordShape[] = [];
  for (const entry of value) {
    if (WORD_SHAPES.includes(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

export function parseSettings(stored: unknown): RunSettings {
  if (!isRecord(stored)) return { ...DEFAULT_SETTINGS };
  const count = stored.questionCount;
  const choices = stored.choiceCount;
  const perQuestion = stored.perQuestionSeconds;
  const total = stored.totalSeconds;
  return normalizeSettings({
    level:
      typeof stored.level === "string" && stored.level !== ""
        ? stored.level
        : DEFAULT_SETTINGS.level,
    sets: pickSets(stored.sets),
    subcategories: pickSubcategories(stored.subcategories),
    format: pick(stored.format, FORMATS, DEFAULT_SETTINGS.format),
    answerStyle: pick(stored.answerStyle, ANSWER_STYLES, DEFAULT_SETTINGS.answerStyle),
    choiceCount: typeof choices === "number" ? choices : DEFAULT_SETTINGS.choiceCount,
    questionCount: typeof count === "number" ? count : DEFAULT_SETTINGS.questionCount,
    wordShapes: pickWordShapes(stored.wordShapes),
    excludedWords: pickWordIds(stored.excludedWords),
    difficulty: pick(stored.difficulty, DIFFICULTIES, DEFAULT_SETTINGS.difficulty),
    perQuestionSeconds: typeof perQuestion === "number" ? perQuestion : 0,
    totalSeconds: typeof total === "number" ? total : 0
  }).settings;
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test("leaves a typed run answering a kanji alone, IME entry is on the learner's machine", () => {
    const wanted: RunSettings = {
      ...DEFAULT_SETTINGS,
      format: "kana-kanji",
      answerStyle: "typing"
    };
    expect(normalizeSettings(wanted).settings.answerStyle).toBe("typing");
  });

  test("answers a recording by picking it, since a sound cannot be typed", () => {
    const wanted: RunSettings = { ...DEFAULT_SETTINGS, format: "kanji-audio", answerStyle: "typing" };
    expect(normalizeSettings(wanted).settings.answerStyle).toBe("choice");
    expect(answerStylesFor("kanji-audio")).toEqual(["choice"]);
  });

  test("lets a heard word be typed, as its kana or its kanji", () => {
    for (const format of ["audio-kana", "audio-kanji"] as const) {
      const wanted: RunSettings = { ...DEFAULT_SETTINGS, format, answerStyle: "typing" };
      expect(normalizeSettings(wanted).settings.answerStyle).toBe("typing");
    }
  });

  test("leaves a typed reading run alone", () => {
    const wanted: RunSettings = { ...DEFAULT_SETTINGS, answerStyle: "typing" };
    expect(normalizeSettings(wanted).settings.answerStyle).toBe("typing");
  });

  test("keeps a length off the ladder, clamped to what a run can hold", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, questionCount: 7 }).settings.questionCount).toBe(
      7
    );
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, questionCount: 900 }).settings.questionCount).toBe(
      CUSTOM_COUNT_MAX
    );
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, questionCount: 2 }).settings.questionCount).toBe(
      CUSTOM_COUNT_MIN
    );
  });

  test("keeps a single pass over the pool, which is length zero", () => {
    expect(
      normalizeSettings({ ...DEFAULT_SETTINGS, questionCount: ONE_PASS }).settings.questionCount
    ).toBe(ONE_PASS);
  });

  test("refuses a choice count the quiz screen cannot lay out", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, choiceCount: 3 }).settings.choiceCount).toBe(4);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, choiceCount: 2 }).settings.choiceCount).toBe(4);
  });

  test("reads back settings that were stored by this app", () => {
    const wanted: RunSettings = {
      level: "N5",
      sets: ["numbers", "actions"],
      subcategories: ["numbers/digits", "numbers/counters"],
      format: "kana-kanji",
      answerStyle: "choice",
      choiceCount: 4,
      questionCount: 50,
      wordShapes: ["1-kanji"],
      excludedWords: ["一|いち"],
      difficulty: "expert",
      perQuestionSeconds: 10,
      totalSeconds: 120
    };
    expect(parseSettings(wanted)).toEqual(wanted);
  });

  test("leaves both clocks off for settings stored before timing existed", () => {
    const { perQuestionSeconds, totalSeconds, ...legacy } = DEFAULT_SETTINGS;
    expect([perQuestionSeconds, totalSeconds]).toEqual([0, 0]);
    expect(parseSettings(legacy)).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps a time limit whole, never negative, and under the custom ceiling", () => {
    const read = parseSettings({ perQuestionSeconds: 7.4, totalSeconds: -30 });
    expect([read.perQuestionSeconds, read.totalSeconds]).toEqual([7, 0]);
    const long = parseSettings({ perQuestionSeconds: 999, totalSeconds: 999_999 });
    expect(long.perQuestionSeconds).toBe(CUSTOM_PER_QUESTION_MAX);
    expect(long.totalSeconds).toBe(CUSTOM_TOTAL_MINUTES_MAX * 60);
  });

  test("counts a clock down from its limit and stops at zero", () => {
    expect(remainingMs(0, 4000)).toBeNull();
    expect(remainingMs(5, 1200)).toBe(3800);
    expect(remainingMs(5, 9000)).toBe(0);
  });

  test("warns once a clock is down to its last five seconds, unless that is all it ever had", () => {
    expect(isNearlyOut(null, 0)).toBe(false);
    expect(isNearlyOut(9000, 10)).toBe(false);
    expect(isNearlyOut(4000, 10)).toBe(true);
    expect(isNearlyOut(0, 10)).toBe(false);
    expect(isNearlyOut(4000, 5)).toBe(false);
  });

  test("marks a time off the preset row as custom, and off as not custom", () => {
    expect(isCustomTime(10, PER_QUESTION_SECONDS)).toBe(false);
    expect(isCustomTime(7, PER_QUESTION_SECONDS)).toBe(true);
    expect(isCustomTime(0, TOTAL_SECONDS)).toBe(false);
  });

  test("replaces anything stored that is not a setting this app knows", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("numbers")).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings({
        sets: ["numbers", "kitchen", 4, "numbers"],
        subcategories: ["numbers/digits", "numbers/weather", 7, "numbers/digits"],
        format: "sentence",
        excludedWords: ["一|いち", "", 9, "一|いち"],
        difficulty: "impossible"
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sets: ["numbers"],
      subcategories: ["numbers/digits"],
      excludedWords: ["一|いち"]
    });
  });

  test("names the two sides of every format the app offers", () => {
    expect(FORMATS.map(promptSurface)).toEqual([
      "written",
      "reading",
      "written",
      "meaning",
      "reading",
      "meaning",
      "image",
      "image",
      "audio",
      "audio",
      "written"
    ]);
    expect(FORMATS.map(answerSurface)).toEqual([
      "reading",
      "written",
      "meaning",
      "written",
      "meaning",
      "reading",
      "written",
      "reading",
      "reading",
      "written",
      "audio"
    ]);
  });

  test("groups every format under exactly one category", () => {
    expect(FORMATS.map(categoryOf)).toEqual([
      "reading",
      "reading",
      "meaning",
      "meaning",
      "meaning",
      "meaning",
      "visualize",
      "visualize",
      "listening",
      "listening",
      "listening"
    ]);
    expect(FORMATS.filter(usesAudio)).toEqual(["audio-kana", "audio-kanji", "kanji-audio"]);
  });

  test("calls only a meaning or a picture latin, so the quiz screen knows what to tag", () => {
    expect(isJapanese("written")).toBe(true);
    expect(isJapanese("reading")).toBe(true);
    expect(isJapanese("meaning")).toBe(false);
    expect(isJapanese("image")).toBe(false);
    expect(isJapanese("audio")).toBe(false);
  });

  test("offers a custom length ladder the roller can step through", () => {
    expect(CUSTOM_COUNT_VALUES[0]).toBe(CUSTOM_COUNT_MIN);
    expect(CUSTOM_COUNT_VALUES.at(-1)).toBe(CUSTOM_COUNT_MAX);
    expect(clampCustomCount(7)).toBe(5);
    expect(clampCustomCount(Number.NaN)).toBe(CUSTOM_COUNT_MIN);
    expect(isCustomCount(20)).toBe(false);
    expect(isCustomCount(35)).toBe(true);
    expect(isCustomCount(ONE_PASS)).toBe(false);
  });
}
