import type { Report } from "./report";
import type { AnswerStyle, Format } from "./settings";
import { ANSWER_STYLES, FORMATS } from "./settings";
import { t } from "../i18n.svelte";

export const WINDOWS = ["all", "today", "yesterday"] as const;

export type Window = (typeof WINDOWS)[number];

export type DateRange = { from: string; to: string };

export function isDateRange(filter: Window | DateRange): filter is DateRange {
  return typeof filter !== "string";
}

export const RANGE_DAYS = 365;

export function dayKey(stamp: number): string {
  const date = new Date(stamp);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type ReportQuery = {
  window: Window | DateRange;
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

export const ANSWER_STYLE_TAGS = ANSWER_STYLES;

const DAY_MS = 86_400_000;

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayStart(key: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (parts === null) return Number.NaN;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getTime();
}

export function withinWindow(createdAt: string, window: Window | DateRange, now: number): boolean {
  if (!isDateRange(window) && window === "all") return true;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  if (isDateRange(window)) {
    const from = dayStart(window.from);
    const to = dayStart(window.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    return at >= Math.min(from, to) && at < Math.max(from, to) + DAY_MS;
  }
  const today = startOfDay(now);
  if (window === "today") return at >= today;
  return at >= today - DAY_MS && at < today;
}

export function windowLabel(filter: Window | DateRange): string {
  if (isDateRange(filter)) return t("reports.window.custom");
  return t(`reports.window.${filter}`);
}

export function rangeLabel(range: DateRange): string {
  return range.from === range.to
    ? range.from
    : t("reports.window.range", { from: range.from, to: range.to });
}

export function queryLabels(query: ReportQuery): string[] {
  return [
    ...query.formats.map((format) => t(`common.format.${format}`)),
    ...query.answerStyles.map((style) => t(`common.answerStyle.${style}`)),
    ...query.levels
  ];
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
      answers: [],
      packs: ["n5-base"]
    };
  }

  const runs = [
    report("2026-09-19T09:00:00.000Z"),
    report("2026-09-18T09:00:00.000Z"),
    report("2026-09-17T09:00:00.000Z", { format: "kana-kanji" }),
    report("2026-08-01T09:00:00.000Z", { answerStyle: "typing" })
  ];

  describe("filtering past runs", () => {
    test("keeps everything when nothing is chosen", () => {
      expect(queryReports(runs, ANY_QUERY, now)).toHaveLength(4);
      expect(activeFilters(ANY_QUERY)).toBe(0);
    });

    test("keeps today's runs", () => {
      expect(queryReports(runs, { ...ANY_QUERY, window: "today" }, now)).toHaveLength(1);
    });

    test("keeps only yesterday's runs", () => {
      expect(queryReports(runs, { ...ANY_QUERY, window: "yesterday" }, now)).toHaveLength(1);
      expect(
        queryReports(runs, { ...ANY_QUERY, window: "yesterday" }, now)[0]!.createdAt
      ).toBe("2026-09-18T09:00:00.000Z");
    });

    test("keeps only the chosen format", () => {
      const shown = queryReports(runs, { ...ANY_QUERY, formats: ["kana-kanji"] }, now);
      expect(shown.map((run) => run.settings.format)).toEqual(["kana-kanji"]);
    });

    test("combines filters, which narrow together", () => {
      const query = {
        ...ANY_QUERY,
        answerStyles: ["typing" as const],
        formats: ["kanji-kana" as const]
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

    test("keeps runs inside a custom date range", () => {
      const range = { from: "2026-09-17", to: "2026-09-19" };
      expect(queryReports(runs, { ...ANY_QUERY, window: range }, now)).toHaveLength(3);
    });

    test("keeps a single-day range to just that day", () => {
      const range = { from: "2026-08-01", to: "2026-08-01" };
      expect(queryReports(runs, { ...ANY_QUERY, window: range }, now)).toHaveLength(1);
    });

    test("swaps a backwards range so it still keeps what falls between", () => {
      const range = { from: "2026-09-19", to: "2026-09-17" };
      expect(queryReports(runs, { ...ANY_QUERY, window: range }, now)).toHaveLength(3);
    });
  });

  describe("window and query labels", () => {
    test("names every fixed window", () => {
      expect(windowLabel("all")).toBe("All");
      expect(windowLabel("today")).toBe("Today");
      expect(windowLabel("yesterday")).toBe("Yesterday");
    });

    test("calls a date range custom", () => {
      expect(windowLabel({ from: "2026-09-17", to: "2026-09-19" })).toBe("Custom");
    });

    test("lists the labels of every active filter", () => {
      const query = {
        ...ANY_QUERY,
        formats: ["kanji-kana" as const],
        answerStyles: ["typing" as const],
        levels: ["N5"]
      };
      expect(queryLabels(query)).toEqual(["Kanji to kana", "Typing", "N5"]);
    });

    test("lists nothing for an unfiltered query", () => {
      expect(queryLabels(ANY_QUERY)).toEqual([]);
    });
  });

  describe("toggle", () => {
    test("adds what is missing and drops what is there", () => {
      expect(toggle<string>([], "a")).toEqual(["a"]);
      expect(toggle(["a", "b"], "a")).toEqual(["b"]);
    });
  });
}
