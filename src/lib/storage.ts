import { parseReport, type Report } from "./quiz/report";
import { parseSettings, type RunSettings } from "./quiz/settings";
import { loadJson, storeJson } from "kaizen-ui";

export { loadJson, storeJson };

const REPORTS_KEY = "kanji-trainer-reports";
const PRESETS_KEY = "kanji-trainer-presets";
const REPORT_LIMIT = 50;

export type Preset = {
  name: string;
  settings: RunSettings;
};

export function listPresets(): Preset[] {
  const stored = loadJson<unknown>(PRESETS_KEY, null);
  if (!Array.isArray(stored)) return [];
  const presets: Preset[] = [];
  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, settings } = entry as { name?: unknown; settings?: unknown };
    if (typeof name !== "string" || name === "") continue;
    presets.push({ name, settings: parseSettings(settings) });
  }
  return presets;
}

export function savePreset(name: string, settings: RunSettings): Preset[] {
  const kept = [
    ...listPresets().filter((preset) => preset.name !== name),
    { name, settings: { ...settings } }
  ].sort((left, right) => left.name.localeCompare(right.name));
  storeJson(PRESETS_KEY, kept);
  return kept;
}

export function deletePreset(name: string): Preset[] {
  const kept = listPresets().filter((preset) => preset.name !== name);
  storeJson(PRESETS_KEY, kept);
  return kept;
}

export function listReports(): Report[] {
  const stored = loadJson<unknown>(REPORTS_KEY, null);
  if (!Array.isArray(stored)) return [];
  const reports: Report[] = [];
  for (const entry of stored) {
    const report = parseReport(entry);
    if (report !== null) reports.push(report);
  }
  return reports.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deleteReports(ids: readonly string[]): Report[] {
  const kept = listReports().filter((report) => !ids.includes(report.id));
  storeJson(REPORTS_KEY, kept);
  return kept;
}

export function saveReport(report: Report): Report[] {
  const kept = [report, ...listReports().filter((held) => held.id !== report.id)];
  const capped = kept.slice(0, REPORT_LIMIT);
  storeJson(REPORTS_KEY, capped);
  return capped;
}

if (import.meta.vitest) {
  const { beforeEach, describe, test, expect } = import.meta.vitest;
  const { DEFAULT_SETTINGS } = await import("./quiz/settings");

  function useMemoryStorage(): void {
    const held = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => void held.set(key, value),
        removeItem: (key: string) => void held.delete(key),
        clear: () => held.clear()
      }
    });
  }

  function reportAt(createdAt: string, id: string): Report {
    return {
      id,
      createdAt,
      durationMs: 1000,
      settings: { ...DEFAULT_SETTINGS, sets: ["numbers"] },
      answers: [{ wordId: "一|いち", correct: true, elapsedMs: 900, given: "いち" }]
    };
  }

  describe("keeping finished runs", () => {
    beforeEach(() => useMemoryStorage());

    test("has nothing to list before a run is saved", () => {
      expect(listReports()).toEqual([]);
    });

    test("lists the newest run first", () => {
      saveReport(reportAt("2026-09-17T10:00:00.000Z", "older"));
      saveReport(reportAt("2026-09-19T10:00:00.000Z", "newer"));
      expect(listReports().map((report) => report.id)).toEqual(["newer", "older"]);
    });

    test("keeps a run through a reload of the page", () => {
      saveReport(reportAt("2026-09-19T10:00:00.000Z", "run-1"));
      expect(listReports()).toHaveLength(1);
      expect(listReports()[0].answers[0].wordId).toBe("一|いち");
    });

    test("drops the oldest runs once the cap is reached", () => {
      const firstDay = Date.UTC(2026, 0, 1);
      for (let index = 0; index < REPORT_LIMIT + 10; index += 1) {
        const day = new Date(firstDay + index * 86_400_000).toISOString();
        saveReport(reportAt(day, `run-${index}`));
      }
      const kept = listReports();
      expect(kept).toHaveLength(REPORT_LIMIT);
      expect(kept[0].id).toBe(`run-${REPORT_LIMIT + 9}`);
    });

    test("removes the runs it is asked to remove and keeps the rest", () => {
      saveReport(reportAt("2026-09-17T10:00:00.000Z", "older"));
      saveReport(reportAt("2026-09-19T10:00:00.000Z", "newer"));
      expect(deleteReports(["older"]).map((report) => report.id)).toEqual(["newer"]);
      expect(listReports().map((report) => report.id)).toEqual(["newer"]);
    });

    test("keeps a named preset and hands it back parsed", () => {
      savePreset("numbers only", { ...DEFAULT_SETTINGS, sets: ["numbers"], questionCount: 30 });
      expect(listPresets()).toEqual([
        {
          name: "numbers only",
          settings: { ...DEFAULT_SETTINGS, sets: ["numbers"], questionCount: 30 }
        }
      ]);
      expect(deletePreset("numbers only")).toEqual([]);
    });

    test("skips anything stored under the key that is not a run", () => {
      storeJson("kanji-trainer-reports", [reportAt("2026-09-19T10:00:00.000Z", "good"), 7, null]);
      expect(listReports().map((report) => report.id)).toEqual(["good"]);
    });
  });
}
