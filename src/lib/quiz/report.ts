import type { Answer } from "./questions";
import type { Word } from "../content/types";
import {
  DEFAULT_SETTINGS,
  EXAM_PARTS,
  examOf,
  FORMATS,
  isExam,
  parseSettings,
  type ExamPart,
  type Format,
  type RunFormat,
  type RunSettings
} from "./settings";

export type Report = {
  id: string;
  createdAt: string;
  durationMs: number;
  settings: RunSettings;
  answers: Answer[];
  packs: string[];
};

export const LEGACY_PACKS = ["n5-base"];

export type PartScore = { part: ExamPart; score: number; total: number };

export type Summary = {
  total: number;
  unreached: number;
  parts: PartScore[];
  score: number;
  accuracy: number;
  averageMs: number;
  timedOut: number;
  missedWordIds: string[];
  timedOutWordIds: string[];
};

export function newReportId(): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 1e6).toString(36);
  return `${stamp}-${noise}`;
}

function partsOf(report: Report): PartScore[] {
  const exam = isExam(report.settings.format) ? examOf(report.settings.level) : null;
  if (exam === null) return [];
  return EXAM_PARTS.map(([part, format]) => ({
    part,
    total: exam[part],
    score: report.answers.filter((answer) => answer.correct && answer.format === format).length
  }));
}

export function summarize(report: Report): Summary {
  const answered = report.answers.length;
  const total = isExam(report.settings.format) ? Math.max(answered, report.settings.questionCount) : answered;
  const score = report.answers.filter((answer) => answer.correct).length;
  const missed: string[] = [];
  for (const answer of report.answers) {
    if (answer.correct || missed.includes(answer.wordId)) continue;
    missed.push(answer.wordId);
  }
  const timedOut = report.answers.filter((answer) => answer.timedOut);
  const totalMs = report.answers.reduce((sum, answer) => sum + answer.elapsedMs, 0);
  return {
    total,
    unreached: total - answered,
    parts: partsOf(report),
    score,
    accuracy: total === 0 ? 0 : score / total,
    averageMs: answered === 0 ? 0 : Math.round(totalMs / answered),
    timedOut: timedOut.length,
    missedWordIds: missed,
    timedOutWordIds: [...new Set(timedOut.map((answer) => answer.wordId))]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCounted(report: Report, enabled: readonly string[]): boolean {
  return report.packs.every((pack) => enabled.includes(pack));
}

export function packsOf(wordIds: readonly string[], words: readonly Pick<Word, "id" | "pack">[]): string[] {
  const wanted = new Set(wordIds);
  return [...new Set(words.filter((word) => wanted.has(word.id)).map((word) => word.pack))].sort();
}

function parsePacks(value: unknown): string[] {
  if (!Array.isArray(value)) return [...LEGACY_PACKS];
  const packs = value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
  return packs.length === 0 ? [...LEGACY_PACKS] : packs;
}

function parseAnswer(value: unknown, runFormat: RunFormat): Answer | null {
  if (!isRecord(value)) return null;
  const { wordId, correct, elapsedMs, given } = value;
  if (typeof wordId !== "string" || wordId === "") return null;
  if (typeof correct !== "boolean" || typeof elapsedMs !== "number") return null;
  if (typeof given !== "string") return null;
  const format = FORMATS.find((entry) => entry === value.format) ?? (isExam(runFormat) ? null : runFormat);
  if (format === null) return null;
  return { wordId, format, correct, elapsedMs, given, timedOut: value.timedOut === true };
}

export function parseReport(value: unknown): Report | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, durationMs, answers } = value;
  if (typeof id !== "string" || id === "") return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  if (typeof durationMs !== "number") return null;
  if (!Array.isArray(answers)) return null;

  const settings = parseSettings(value.settings);
  const parsed: Answer[] = [];
  for (const entry of answers) {
    const answer = parseAnswer(entry, settings.format);
    if (answer === null) return null;
    parsed.push(answer);
  }

  return {
    id,
    createdAt,
    durationMs,
    settings,
    answers: parsed,
    packs: parsePacks(value.packs)
  };
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;
  const { runSettings } = await import("./settings");

  const report: Report = {
    id: "run-1",
    createdAt: "2026-09-19T10:00:00.000Z",
    durationMs: 60_000,
    settings: { ...DEFAULT_SETTINGS, sets: ["numbers"] },
    answers: [
      { wordId: "一|いち", format: "kanji-kana", correct: true, elapsedMs: 900, given: "いち", timedOut: false },
      { wordId: "二|に", format: "kanji-kana", correct: false, elapsedMs: 1200, given: "ふた", timedOut: false },
      { wordId: "二|に", format: "kanji-kana", correct: false, elapsedMs: 800, given: "じ", timedOut: false },
      { wordId: "三|さん", format: "kanji-kana", correct: true, elapsedMs: 700, given: "さん", timedOut: false }
    ],
    packs: ["n5-base"]
  };

  describe("summarising a finished run", () => {
    test("counts the answers that were right", () => {
      const summary = summarize(report);
      expect(summary.total).toBe(4);
      expect(summary.score).toBe(2);
      expect(summary.accuracy).toBe(0.5);
    });

    test("names each missed word once", () => {
      expect(summarize(report).missedWordIds).toEqual(["二|に"]);
    });

    test("gives an accuracy of zero for a run with no answers", () => {
      expect(summarize({ ...report, answers: [] }).accuracy).toBe(0);
      expect(summarize({ ...report, answers: [] }).averageMs).toBe(0);
    });

    test("averages the time per answer and counts the ones that ran out of time", () => {
      const timed: Report = {
        ...report,
        answers: [
          ...report.answers,
          { wordId: "四|よん", format: "kanji-kana", correct: false, elapsedMs: 5000, given: "", timedOut: true },
          { wordId: "四|よん", format: "kanji-kana", correct: false, elapsedMs: 5000, given: "", timedOut: true }
        ]
      };
      const summary = summarize(timed);
      expect(summary.averageMs).toBe(Math.round((900 + 1200 + 800 + 700 + 10_000) / 6));
      expect(summary.timedOut).toBe(2);
      expect(summary.timedOutWordIds).toEqual(["四|よん"]);
      expect(summary.missedWordIds).toEqual(["二|に", "四|よん"]);
    });
  });

  describe("summarising an exam", () => {
    const exam = runSettings({ ...DEFAULT_SETTINGS, format: "exam" });
    const answer = (format: Format, correct: boolean): Report["answers"][number] => ({
      wordId: `${format}-${correct}`,
      format,
      correct,
      elapsedMs: 50_000,
      given: "",
      timedOut: false
    });

    test("counts the questions the clock cut off as wrong, out of all 21", () => {
      const cut: Report = {
        ...report,
        durationMs: 1_200_000,
        settings: exam,
        answers: [
          ...Array.from({ length: 6 }, () => answer("kanji-kana", true)),
          answer("kanji-kana", false),
          ...Array.from({ length: 4 }, () => answer("kana-kanji", true)),
          answer("kana-kanji", false),
          ...Array.from({ length: 3 }, () => answer("kanji-meaning", true))
        ]
      };
      const summary = summarize(cut);
      expect(summary.total).toBe(21);
      expect(summary.score).toBe(13);
      expect(summary.unreached).toBe(6);
      expect(summary.accuracy).toBe(13 / 21);
      expect(summary.averageMs).toBe(50_000);
      expect(summary.parts).toEqual([
        { part: "reading", score: 6, total: 7 },
        { part: "writing", score: 4, total: 5 },
        { part: "meaning", score: 3, total: 9 }
      ]);
    });

    test("splits nothing into parts for a run that is no exam", () => {
      expect(summarize(report).parts).toEqual([]);
      expect(summarize(report).unreached).toBe(0);
    });
  });

  describe("reading a stored run back", () => {
    test("accepts a run this app wrote", () => {
      expect(parseReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
    });

    test("files each answer of a run saved before 1.2 under the run's format", () => {
      const legacy = JSON.parse(JSON.stringify(report));
      for (const answer of legacy.answers) delete answer.format;
      expect(parseReport(legacy)).toEqual(report);
    });

    test("refuses an exam answer that does not say which part it was", () => {
      const exam = JSON.parse(JSON.stringify({ ...report, settings: { ...report.settings, format: "exam" } }));
      expect(parseReport(exam)?.settings.format).toBe("exam");
      delete exam.answers[0].format;
      expect(parseReport(exam)).toBeNull();
    });

    test("reads a run saved before timing existed as untimed", () => {
      const legacy = JSON.parse(JSON.stringify(report));
      for (const answer of legacy.answers) delete answer.timedOut;
      delete legacy.settings.perQuestionSeconds;
      delete legacy.settings.totalSeconds;
      expect(parseReport(legacy)).toEqual(report);
    });

    test("keeps which answers ran out of time", () => {
      const timed: Report = {
        ...report,
        answers: [{ wordId: "四|よん", format: "kanji-kana", correct: false, elapsedMs: 5000, given: "", timedOut: true }]
      };
      expect(parseReport(JSON.parse(JSON.stringify(timed)))?.answers[0]?.timedOut).toBe(true);
    });

    test("keeps the difficulty the run was set to", () => {
      const expert = { ...report, settings: { ...report.settings, difficulty: "expert" as const } };
      const read = parseReport(JSON.parse(JSON.stringify(expert)));
      expect(read?.settings.difficulty).toBe("expert");
      expect(parseReport(JSON.parse(JSON.stringify(report)))?.settings.difficulty).toBe("beginner");
    });

    test("files a run saved before packs existed under the N5 base", () => {
      const { packs, ...legacy } = report;
      expect(packs).toEqual(["n5-base"]);
      expect(parseReport(JSON.parse(JSON.stringify(legacy)))?.packs).toEqual(["n5-base"]);
    });

    test("keeps the packs a run drew from", () => {
      const mixed = { ...report, packs: ["n5-base", "n5-food"] };
      expect(parseReport(JSON.parse(JSON.stringify(mixed)))?.packs).toEqual(["n5-base", "n5-food"]);
    });
  });

  describe("counting a run only while its packs are in use", () => {
    const food = { ...report, id: "run-2", packs: ["n5-base", "n5-food"] };

    test("counts a run whose every pack is enabled", () => {
      expect(isCounted(food, ["n5-base", "n5-food"])).toBe(true);
    });

    test("leaves out a run once one of its packs is off or removed", () => {
      const counted = [report, food].filter((entry) => isCounted(entry, ["n5-base"]));
      expect(counted.map((entry) => entry.id)).toEqual(["run-1"]);
      expect(counted.flatMap((entry) => entry.answers)).toHaveLength(4);
    });

    test("names the packs of the words a run asked, each once", () => {
      const words = [
        { id: "一|いち", pack: "n5-base" },
        { id: "寿司|すし", pack: "n5-food" },
        { id: "二|に", pack: "n5-base" }
      ];
      expect(packsOf(["寿司|すし", "一|いち", "一|いち"], words)).toEqual(["n5-base", "n5-food"]);
    });
  });

  describe("refusing what is not a run", () => {
    test("refuses anything that is not a run", () => {
      expect(parseReport(null)).toBeNull();
      expect(parseReport({ ...report, id: "" })).toBeNull();
      expect(parseReport({ ...report, createdAt: "the other day" })).toBeNull();
      expect(parseReport({ ...report, answers: "none" })).toBeNull();
      expect(parseReport({ ...report, answers: [{ wordId: "一|いち" }] })).toBeNull();
    });
  });
}
