import { emptyFilter, filterWords } from "../browse/cards";
import { mergeContents } from "../content/load";
import { CONTENT_LANG, mergePackLocales, NO_PACK_LOCALE, translateWords, type PackLocale } from "../content/locale";
import type { Content, Word } from "../content/types";
import { locales } from "../i18n.svelte";
import { loadPackContent, loadPackLocale, servedPacks, shelved } from "../packs/store";
import { setPackRoot } from "../packs/url";
import { inTauri } from "../storage";
import { flashcardFileName, GRID_SIZES, pageCount } from "./pdf";
import { renderFlashcards } from "./render";

export type ExportRequest = { packs: string; out: string };

export type Target = { id: string; packs: string[] };

export type ExportFile = { name: string; pages: number; pdf: Uint8Array };

/** One pack, or n5-all, in one locale: the unit written to its own folder. */
export type Job = { locale: string; target: string; words: Word[] };

type OnPage = (size: number, page: number, pages: number) => Promise<unknown>;

const LEVEL = "N5";

const ALL = "n5-all";

export function parseRequest(value: unknown): ExportRequest | null {
  if (typeof value !== "object" || value === null || !("packs" in value) || !("out" in value)) return null;
  const { packs, out } = value;
  return typeof packs === "string" && typeof out === "string" ? { packs, out } : null;
}

export function targetsOf(packIds: readonly string[]): Target[] {
  return [{ id: ALL, packs: [] }, ...packIds.map((id) => ({ id, packs: [id] }))];
}

export function targetWords(words: readonly Word[], target: Target): Word[] {
  return filterWords(words, { ...emptyFilter(LEVEL), packs: target.packs });
}

export function totalPages(jobs: readonly Job[]): number {
  return jobs.reduce(
    (sum, job) => sum + GRID_SIZES.reduce((pages, size) => pages + pageCount(job.words.length, size), 0),
    0
  );
}

export function joined(files: readonly ExportFile[]): Uint8Array {
  const body = new Uint8Array(files.reduce((sum, file) => sum + file.pdf.length, 0));
  let at = 0;
  for (const file of files) {
    body.set(file.pdf, at);
    at += file.pdf.length;
  }
  return body;
}

export async function exportRequest(): Promise<ExportRequest | null> {
  if (!inTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return parseRequest(await invoke<unknown>("export_request"));
  } catch {
    return null;
  }
}

async function renderTarget(words: readonly Word[], today: Date, onpage: OnPage): Promise<ExportFile[]> {
  const files: ExportFile[] = [];
  for (const size of GRID_SIZES) {
    let reported: Promise<unknown> = Promise.resolve();
    const pdf = await renderFlashcards(words, size, {
      signal: new AbortController().signal,
      onpage: (page, pages) => {
        reported = reported.then(() => onpage(size, page, pages));
      }
    });
    await reported;
    files.push({
      name: flashcardFileName(size, today),
      pages: pageCount(words.length, size),
      pdf
    });
  }
  return files;
}

async function loadShelf(): Promise<{ ids: string[]; contents: Content[] }> {
  const ids = shelved(await servedPacks()).map((pack) => pack.id);
  const contents = await Promise.all(
    ids.map(async (id) => {
      const content = await loadPackContent(id);
      if (content === null) throw new Error(`${id}/content.json could not be read`);
      return content;
    })
  );
  return { ids, contents };
}

// A locale is printed only for the packs that ship it; English is the packs' own text.
async function loadLocale(ids: string[], tag: string): Promise<{ ids: string[]; locale: PackLocale }> {
  if (tag === CONTENT_LANG) return { ids, locale: NO_PACK_LOCALE };
  const loaded = await Promise.all(ids.map((id) => loadPackLocale(id, tag)));
  return { ids: ids.filter((_, at) => loaded[at] !== null), locale: mergePackLocales(loaded) };
}

async function planJobs(ids: string[], words: readonly Word[]): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const { tag } of locales) {
    const translated = await loadLocale(ids, tag);
    if (translated.ids.length === 0) continue;
    const localWords = translateWords(words, translated.locale, tag);
    for (const target of targetsOf(translated.ids)) {
      jobs.push({ locale: tag, target: target.id, words: targetWords(localWords, target) });
    }
  }
  return jobs;
}

export async function exportFlashcards(request: ExportRequest): Promise<void> {
  const { convertFileSrc, invoke } = await import("@tauri-apps/api/core");
  try {
    setPackRoot(convertFileSrc(request.packs));
    const { ids, contents } = await loadShelf();
    if (ids.length === 0) throw new Error(`${request.packs}/index.json lists no pack`);
    const { words } = mergeContents(contents);
    const today = new Date();
    const jobs = await planJobs(ids, words);
    const tags = [...new Set(jobs.map((job) => job.locale))];
    const total = totalPages(jobs);
    let done = 0;
    for (const job of jobs) {
      const files = await renderTarget(job.words, today, (size, page, pages) => {
        done += 1;
        const progress = {
          locale: job.locale,
          localeAt: tags.indexOf(job.locale) + 1,
          locales: tags.length,
          target: job.target,
          size,
          page,
          pages,
          done,
          total
        };
        return invoke<null>("export_progress", { progress });
      });
      const manifest = files.map((file) => ({
        name: file.name,
        bytes: file.pdf.length,
        pages: file.pages
      }));
      await invoke<null>("export_write", joined(files), {
        headers: {
          locale: job.locale,
          target: job.target,
          files: encodeURIComponent(JSON.stringify(manifest))
        }
      });
    }
    await invoke<null>("export_finish", { ok: true, message: "" });
  } catch (error) {
    await invoke<null>("export_finish", {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  describe("the flashcard export", () => {
    test("prints every pack together, then each pack on its own", () => {
      expect(targetsOf(["n5-base", "n5-plus"])).toEqual([
        { id: "n5-all", packs: [] },
        { id: "n5-base", packs: ["n5-base"] },
        { id: "n5-plus", packs: ["n5-plus"] }
      ]);
    });

    test("counts every page of every grid up front", () => {
      const words = (count: number) => Array.from({ length: count }, () => ({}) as Word);
      const jobs = [
        { locale: "en", target: "n5-base", words: words(1) },
        { locale: "nl", target: "n5-base", words: words(17) }
      ];
      // 1 card: 2 pages per grid; 17 cards: 34 + 10 + 4 + 4 pages.
      expect(totalPages(jobs)).toBe(2 * GRID_SIZES.length + 34 + 10 + 4 + 4);
    });

    test("reads a request only when both folders are named", () => {
      expect(parseRequest({ packs: "/d/packs", out: "/d/flashcards" })).toEqual({
        packs: "/d/packs",
        out: "/d/flashcards"
      });
      expect(parseRequest(null)).toBeNull();
      expect(parseRequest({ packs: "/d/packs" })).toBeNull();
    });

    test("sends the files back to back, in order", () => {
      const files = [
        { name: "a", pages: 1, pdf: Uint8Array.from([1, 2]) },
        { name: "b", pages: 1, pdf: Uint8Array.from([3]) }
      ];
      expect([...joined(files)]).toEqual([1, 2, 3]);
    });
  });
}
