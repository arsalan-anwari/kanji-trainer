import type { Answer } from "./questions";
import { DEFAULT_SETTINGS, parseSettings, type RunSettings } from "./settings";

export type Report = {
  id: string;
  createdAt: string;
  durationMs: number;
  settings: RunSettings;
  answers: Answer[];
};

export type Summary = {
  total: number;
  score: number;
  accuracy: number;
  missedWordIds: string[];
};

export function newReportId(): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 1e6).toString(36);
  return `${stamp}-${noise}`;
}

export function summarize(report: Report): Summary {
  const total = report.answers.length;
  const score = report.answers.filter((answer) => answer.correct).length;
  const missed: string[] = [];
  for (const answer of report.answers) {
    if (answer.correct || missed.includes(answer.wordId)) continue;
    missed.push(answer.wordId);
  }
  return {
    total,
    score,
    accuracy: total === 0 ? 0 : score / total,
    missedWordIds: missed
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAnswer(value: unknown): Answer | null {
  if (!isRecord(value)) return null;
  const { wordId, correct, elapsedMs, given } = value;
  if (typeof wordId !== "string" || wordId === "") return null;
  if (typeof correct !== "boolean" || typeof elapsedMs !== "number") return null;
  if (typeof given !== "string") return null;
  return { wordId, correct, elapsedMs, given };
}

export function parseReport(value: unknown): Report | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, durationMs, answers } = value;
  if (typeof id !== "string" || id === "") return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) return null;
  if (typeof durationMs !== "number") return null;
  if (!Array.isArray(answers)) return null;

  const parsed: Answer[] = [];
  for (const entry of answers) {
    const answer = parseAnswer(entry);
    if (answer === null) return null;
    parsed.push(answer);
  }

  return {
    id,
    createdAt,
    durationMs,
    settings: parseSettings(value.settings),
    answers: parsed
  };
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const report: Report = {
    id: "run-1",
    createdAt: "2026-09-19T10:00:00.000Z",
    durationMs: 60_000,
    settings: { ...DEFAULT_SETTINGS, sets: ["numbers"] },
    answers: [
      { wordId: "一|いち", correct: true, elapsedMs: 900, given: "いち" },
      { wordId: "二|に", correct: false, elapsedMs: 1200, given: "ふた" },
      { wordId: "二|に", correct: false, elapsedMs: 800, given: "じ" },
      { wordId: "三|さん", correct: true, elapsedMs: 700, given: "さん" }
    ]
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
    });
  });

  describe("reading a stored run back", () => {
    test("accepts a run this app wrote", () => {
      expect(parseReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
    });

    test("keeps the difficulty the run was set to", () => {
      const expert = { ...report, settings: { ...report.settings, difficulty: "expert" as const } };
      const read = parseReport(JSON.parse(JSON.stringify(expert)));
      expect(read?.settings.difficulty).toBe("expert");
      expect(parseReport(JSON.parse(JSON.stringify(report)))?.settings.difficulty).toBe("beginner");
    });

    test("refuses anything that is not a run", () => {
      expect(parseReport(null)).toBeNull();
      expect(parseReport({ ...report, id: "" })).toBeNull();
      expect(parseReport({ ...report, createdAt: "the other day" })).toBeNull();
      expect(parseReport({ ...report, answers: "none" })).toBeNull();
      expect(parseReport({ ...report, answers: [{ wordId: "一|いち" }] })).toBeNull();
    });
  });
}
