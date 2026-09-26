import { decodeReportFile, encodeReportFile, FILE_EXTENSION } from "./quiz/ktreport";
import { parseReport, type Report } from "./quiz/report";
import { pickSelection, pickWordIds } from "./quiz/settings";
import { TAXONOMY_VERSION, type SetId } from "./content/sets";
import { loadJson, storeJson } from "kaizen-ui";
import { t } from "./i18n.svelte";

export { loadJson, storeJson };

const PRESETS_KEY = "kanji-trainer-presets";
const REPORTS_KEY = "kanji-trainer-reports";
const REPORT_LIMIT = 50;

export type PresetSelection = {
  sets: SetId[];
  subcategories: string[];
  /** Pack ids to draw from. Empty means every enabled pack. */
  packs: string[];
  excludedWords: string[];
};

export type Preset = {
  name: string;
  selection: PresetSelection;
};

function parseSelection(value: unknown): PresetSelection {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    ...pickSelection(record),
    packs: pickWordIds(record.packs),
    excludedWords: pickWordIds(record.excludedWords)
  };
}

function storePresets(presets: readonly Preset[]): void {
  storeJson(
    PRESETS_KEY,
    presets.map((preset) => ({ ...preset, selection: { ...preset.selection, taxonomy: TAXONOMY_VERSION } }))
  );
}

export function listPresets(): Preset[] {
  const stored = loadJson<unknown>(PRESETS_KEY, null);
  if (!Array.isArray(stored)) return [];
  const presets: Preset[] = [];
  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, selection } = entry as { name?: unknown; selection?: unknown };
    if (typeof name !== "string" || name === "") continue;
    presets.push({ name, selection: parseSelection(selection) });
  }
  return presets;
}

export function savePreset(name: string, selection: PresetSelection): Preset[] {
  const kept = [
    ...listPresets().filter((preset) => preset.name !== name),
    { name, selection: { ...selection } }
  ].sort((left, right) => left.name.localeCompare(right.name));
  storePresets(kept);
  return kept;
}

export function deletePreset(name: string): Preset[] {
  const kept = listPresets().filter((preset) => preset.name !== name);
  storePresets(kept);
  return kept;
}

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function localReports(): Report[] {
  const stored = loadJson<unknown>(REPORTS_KEY, null);
  if (!Array.isArray(stored)) return [];
  const reports: Report[] = [];
  for (const entry of stored) {
    const report = parseReport(entry);
    if (report !== null) reports.push(report);
  }
  return reports;
}

function writeLocal(reports: readonly Report[]): void {
  storeJson(REPORTS_KEY, reports);
}

export async function listReports(): Promise<Report[]> {
  const reports = inTauri()
    ? (await call<unknown[]>("list_reports", {})).flatMap((entry) => {
        const report = parseReport(entry);
        return report === null ? [] : [report];
      })
    : localReports();
  return reports.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function saveReport(report: Report): Promise<void> {
  if (inTauri()) {
    await call<string>("save_report", { report });
    return;
  }
  const kept = [report, ...localReports().filter((held) => held.id !== report.id)].slice(
    0,
    REPORT_LIMIT
  );
  writeLocal(kept);
}

export async function deleteReports(ids: readonly string[]): Promise<void> {
  if (inTauri()) {
    for (const id of ids) await call<null>("delete_report", { id });
    return;
  }
  writeLocal(localReports().filter((report) => !ids.includes(report.id)));
}

function suggestedName(count: number): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `kanji-runs-${stamp}-${count}.${FILE_EXTENSION}`;
}

const fileFilters = (): { name: string; extensions: string[] }[] => [
  { name: t("common.file.filterName"), extensions: [FILE_EXTENSION] }
];

export async function exportReports(reports: readonly Report[]): Promise<boolean> {
  const bytes = encodeReportFile(reports);
  const name = suggestedName(reports.length);
  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: name, filters: fileFilters() });
    if (path === null) return false;
    await call<null>("write_report_file", { path, data: [...bytes] });
    return true;
  }
  downloadInBrowser(bytes, name, "application/octet-stream");
  return true;
}

function downloadInBrowser(bytes: Uint8Array, name: string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function writeBinary(path: string, bytes: Uint8Array): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<null>("write_binary_file", bytes, {
    headers: { path: encodeURIComponent(path) }
  });
}

export async function savePdf(bytes: Uint8Array, name: string): Promise<boolean> {
  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: t("common.file.pdfFilterName"), extensions: ["pdf"] }]
    });
    if (path === null) return false;
    await writeBinary(path, bytes);
    return true;
  }
  downloadInBrowser(bytes, name, "application/pdf");
  return true;
}

export type NamedFile = { name: string; bytes: Uint8Array };

/** Saves every file under its own name in one folder the learner picks. */
export async function savePdfs(files: readonly NamedFile[]): Promise<boolean> {
  if (!inTauri()) {
    for (const file of files) downloadInBrowser(file.bytes, file.name, "application/pdf");
    return true;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const folder = await open({ directory: true, multiple: false });
  if (folder === null || Array.isArray(folder)) return false;
  // Android hands back a content:// tree, which a file name cannot be joined
  // onto; ask for each file there instead.
  if (folder.includes("://")) {
    for (const file of files) if (!(await savePdf(file.bytes, file.name))) return false;
    return true;
  }
  const { join } = await import("@tauri-apps/api/path");
  for (const file of files) await writeBinary(await join(folder, file.name), file.bytes);
  return true;
}

function pickFileInBrowser(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${FILE_EXTENSION}`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await file.arrayBuffer()));
    };
    input.click();
  });
}

export type ImportResult = {
  added: number;
  skipped: number;
};

export async function importReports(): Promise<ImportResult | null> {
  let bytes: Uint8Array | null;
  if (inTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, filters: fileFilters() });
    if (path === null || Array.isArray(path)) return null;
    const data = await call<number[]>("read_report_file", { path });
    bytes = Uint8Array.from(data);
  } else {
    bytes = await pickFileInBrowser();
  }
  if (bytes === null) return null;

  const incoming = decodeReportFile(bytes);
  const held = new Set((await listReports()).map((report) => report.id));
  let added = 0;
  let skipped = 0;
  for (const report of incoming) {
    if (held.has(report.id)) {
      skipped += 1;
      continue;
    }
    await saveReport(report);
    held.add(report.id);
    added += 1;
  }
  return { added, skipped };
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
      answers: [{ wordId: "一|いち", correct: true, elapsedMs: 900, given: "いち", timedOut: false }],
      packs: ["n5-base"]
    };
  }

  describe("keeping finished runs", () => {
    beforeEach(() => useMemoryStorage());

    test("has nothing to list before a run is saved", async () => {
      expect(await listReports()).toEqual([]);
    });

    test("lists the newest run first", async () => {
      await saveReport(reportAt("2026-09-17T10:00:00.000Z", "older"));
      await saveReport(reportAt("2026-09-19T10:00:00.000Z", "newer"));
      expect((await listReports()).map((report) => report.id)).toEqual(["newer", "older"]);
    });

    test("keeps a run through a reload of the page", async () => {
      await saveReport(reportAt("2026-09-19T10:00:00.000Z", "run-1"));
      const reports = await listReports();
      expect(reports).toHaveLength(1);
      expect(reports[0]?.answers[0]?.wordId).toBe("一|いち");
    });

    test("drops the oldest runs once the cap is reached", async () => {
      const firstDay = Date.UTC(2026, 0, 1);
      for (let index = 0; index < REPORT_LIMIT + 10; index += 1) {
        const day = new Date(firstDay + index * 86_400_000).toISOString();
        await saveReport(reportAt(day, `run-${index}`));
      }
      const kept = await listReports();
      expect(kept).toHaveLength(REPORT_LIMIT);
      expect(kept[0]?.id).toBe(`run-${REPORT_LIMIT + 9}`);
    });

    test("removes the runs it is asked to remove and keeps the rest", async () => {
      await saveReport(reportAt("2026-09-17T10:00:00.000Z", "older"));
      await saveReport(reportAt("2026-09-19T10:00:00.000Z", "newer"));
      await deleteReports(["older"]);
      expect((await listReports()).map((report) => report.id)).toEqual(["newer"]);
    });

    test("keeps a named preset and hands it back parsed", () => {
      savePreset("numbers only", {
        sets: ["numbers"],
        subcategories: ["numbers/digits"],
        packs: ["n5-kana"],
        excludedWords: []
      });
      expect(listPresets()).toEqual([
        {
          name: "numbers only",
          selection: { sets: ["numbers"], subcategories: ["numbers/digits"], packs: ["n5-kana"], excludedWords: [] }
        }
      ]);
      expect(deletePreset("numbers only")).toEqual([]);
    });

    test("reads a preset saved before the taxonomy froze with its words still selected", () => {
      storeJson("kanji-trainer-presets", [
        { name: "old", selection: { sets: ["people"], subcategories: ["people/school-roles"], excludedWords: [] } }
      ]);
      expect(listPresets()[0]?.selection).toEqual({
        sets: ["people"],
        subcategories: ["people/roles"],
        packs: [],
        excludedWords: []
      });
      savePreset("new", { sets: ["numbers"], subcategories: [], packs: [], excludedWords: [] });
      expect(listPresets().map((preset) => preset.selection.subcategories)).toEqual([[], ["people/roles"]]);
    });

    test("skips anything stored under the key that is not a run", async () => {
      storeJson("kanji-trainer-reports", [
        reportAt("2026-09-19T10:00:00.000Z", "good"),
        7,
        null
      ]);
      expect((await listReports()).map((report) => report.id)).toEqual(["good"]);
    });
  });
}
