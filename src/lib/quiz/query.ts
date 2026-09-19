import type { Report } from "./report";
import type { AnswerStyle, Format } from "./settings";
import { ANSWER_STYLES, FORMATS } from "./settings";

export const WINDOWS = ["all", "today", "week"] as const;

export type Window = (typeof WINDOWS)[number];

export type ReportQuery = {
  window: Window;
  formats: Format[];
  answerStyles: AnswerStyle[];
  levels: string[];
};

export const ANY_QUERY: ReportQuery = {
  window: "all",
  formats: [],
  answerStyles: [],
  levels: []
};

export const FORMAT_TAGS = FORMATS;
export const ANSWER_STYLE_TAGS = ANSWER_STYLES;

const DAY_MS = 86_400_000;

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function withinWindow(createdAt: string, window: Window, now: number): boolean {
  if (window === "all") return true;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  const today = startOfDay(now);
  return window === "today" ? at >= today : at >= today - 6 * DAY_MS;
}

function matches<T>(chosen: readonly T[], value: T): boolean {
  return chosen.length === 0 || chosen.includes(value);
}

export function queryReports(
  reports: readonly Report[],
  query: ReportQuery,
  now: number = Date.now()
): Report[] {
  return reports.filter((report) => {
    if (!withinWindow(report.createdAt, query.window, now)) return false;
    if (!matches(query.formats, report.settings.format)) return false;
    if (!matches(query.answerStyles, report.settings.answerStyle)) return false;
    return matches(query.levels, report.settings.level);
  });
}

export function activeFilters(query: ReportQuery): number {
  return (
    query.formats.length + query.answerStyles.length + query.levels.length
  );
}

export function toggle<T>(chosen: readonly T[], value: T): T[] {
  return chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value];
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;
  const { DEFAULT_SETTINGS } = await import("./settings");

  const now = Date.parse("2026-09-19T12:00:00.000Z");

  function report(createdAt: string, settings: Partial<Report["settings"]> = {}): Report {
    return {
      id: createdAt,
      createdAt,
      durationMs: 1000,
      settings: { ...DEFAULT_SETTINGS, sets: ["numbers"], ...settings },
      answers: []
    };
  }

  const runs = [
    report("2026-09-19T09:00:00.000Z"),
    report("2026-09-17T09:00:00.000Z", { format: "kana-kanji" }),
    report("2026-08-01T09:00:00.000Z", { answerStyle: "typing" })
  ];

  describe("filtering past runs", () => {
    test("keeps everything when nothing is chosen", () => {
      expect(queryReports(runs, ANY_QUERY, now)).toHaveLength(3);
      expect(activeFilters(ANY_QUERY)).toBe(0);
    });

    test("keeps today's runs", () => {
      expect(queryReports(runs, { ...ANY_QUERY, window: "today" }, now)).toHaveLength(1);
    });

    test("keeps the last seven days", () => {
      expect(queryReports(runs, { ...ANY_QUERY, window: "week" }, now)).toHaveLength(2);
    });

    test("keeps only the chosen format", () => {
      const shown = queryReports(runs, { ...ANY_QUERY, formats: ["kana-kanji"] }, now);
      expect(shown.map((run) => run.settings.format)).toEqual(["kana-kanji"]);
    });

    test("combines filters, which narrow together", () => {
      const query = {
        ...ANY_QUERY,
        answerStyles: ["typing" as const],
        formats: ["kanji-reading" as const]
      };
      expect(queryReports(runs, query, now)).toHaveLength(1);
      expect(activeFilters(query)).toBe(2);
    });

    test("keeps a run out when it matches only one of two filters", () => {
      const query = {
        ...ANY_QUERY,
        answerStyles: ["typing" as const],
        formats: ["kana-kanji" as const]
      };
      expect(queryReports(runs, query, now)).toEqual([]);
    });

    test("ignores a run with an unreadable date once a window is set", () => {
      const broken = [report("not a date")];
      expect(queryReports(broken, { ...ANY_QUERY, window: "today" }, now)).toEqual([]);
      expect(queryReports(broken, ANY_QUERY, now)).toHaveLength(1);
    });
  });

  describe("toggle", () => {
    test("adds what is missing and drops what is there", () => {
      expect(toggle<string>([], "a")).toEqual(["a"]);
      expect(toggle(["a", "b"], "a")).toEqual(["b"]);
    });
  });
}
