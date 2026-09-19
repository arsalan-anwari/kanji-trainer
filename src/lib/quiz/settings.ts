import { isSetId } from "../content/sets";
import type { SetId } from "../content/sets";

export type Format = "kanji-reading" | "kana-kanji";
export type AnswerStyle = "choice" | "typing";

export type RunSettings = {
  level: string;
  sets: SetId[];
  /** The kanji a run may draw on. Empty means every kanji of the chosen sets. */
  kanji: string[];
  format: Format;
  answerStyle: AnswerStyle;
  choiceCount: number;
  /** 0 asks every eligible word exactly once. */
  questionCount: number;
};

export const FORMATS: readonly Format[] = ["kanji-reading", "kana-kanji"];
export const ANSWER_STYLES: readonly AnswerStyle[] = ["choice", "typing"];
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

export const DEFAULT_SETTINGS: RunSettings = {
  level: "N5",
  sets: [],
  kanji: [],
  format: "kanji-reading",
  answerStyle: "choice",
  choiceCount: 4,
  questionCount: 20
};

export function typingAllowed(format: Format): boolean {
  return format === "kanji-reading";
}

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

  if (next.answerStyle === "typing" && !typingAllowed(next.format)) {
    next.answerStyle = "choice";
    notes.push("setup.notes.kanjiNeedsChoice");
  }

  if (!CHOICE_COUNTS.includes(next.choiceCount)) {
    next.choiceCount = DEFAULT_SETTINGS.choiceCount;
  }

  next.questionCount = normalizeCount(next.questionCount);

  return { settings: next, notes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickSets(value: unknown): SetId[] {
  if (!Array.isArray(value)) return [];
  const out: SetId[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && isSetId(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

function pickKanji(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && [...entry].length === 1 && !out.includes(entry)) {
      out.push(entry);
    }
  }
  return out;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

export function parseSettings(stored: unknown): RunSettings {
  if (!isRecord(stored)) return { ...DEFAULT_SETTINGS };
  const count = stored.questionCount;
  const choices = stored.choiceCount;
  return normalizeSettings({
    level:
      typeof stored.level === "string" && stored.level !== ""
        ? stored.level
        : DEFAULT_SETTINGS.level,
    sets: pickSets(stored.sets),
    kanji: pickKanji(stored.kanji),
    format: pick(stored.format, FORMATS, DEFAULT_SETTINGS.format),
    answerStyle: pick(stored.answerStyle, ANSWER_STYLES, DEFAULT_SETTINGS.answerStyle),
    choiceCount: typeof choices === "number" ? choices : DEFAULT_SETTINGS.choiceCount,
    questionCount: typeof count === "number" ? count : DEFAULT_SETTINGS.questionCount
  }).settings;
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test("moves a typed run back to multiple choice when the answer is a kanji", () => {
    const wanted: RunSettings = {
      ...DEFAULT_SETTINGS,
      format: "kana-kanji",
      answerStyle: "typing"
    };
    const { settings, notes } = normalizeSettings(wanted);
    expect(settings.answerStyle).toBe("choice");
    expect(notes).toContain("setup.notes.kanjiNeedsChoice");
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
      sets: ["numbers", "verbs"],
      kanji: ["一", "二"],
      format: "kana-kanji",
      answerStyle: "choice",
      choiceCount: 4,
      questionCount: 50
    };
    expect(parseSettings(wanted)).toEqual(wanted);
  });

  test("replaces anything stored that is not a setting this app knows", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("numbers")).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings({
        sets: ["numbers", "kitchen", 4, "numbers"],
        kanji: ["一", "学校", 7, "一"],
        format: "sentence"
      })
    ).toEqual({ ...DEFAULT_SETTINGS, sets: ["numbers"], kanji: ["一"] });
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
