import { emptyFilter, filterWords } from "../browse/cards";
import { mergeContents } from "../content/load";
import type { Content, Word } from "../content/types";
import { loadPackContent, servedPacks, shelved } from "../packs/store";
import { setPackRoot } from "../packs/url";
import { inTauri } from "../storage";
import { flashcardFileName, GRID_SIZES, pageCount } from "./pdf";
import { renderFlashcards } from "./render";

export type ExportRequest = { packs: string; out: string };

export type Target = { id: string; packs: string[] };

export type ExportFile = { name: string; pages: number; pdf: Uint8Array };

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

async function renderTarget(words: readonly Word[], today: Date): Promise<ExportFile[]> {
  const files: ExportFile[] = [];
  for (const size of GRID_SIZES) {
    const pdf = await renderFlashcards(words, size, {
      signal: new AbortController().signal,
      onpage: () => {}
    });
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

export async function exportFlashcards(request: ExportRequest): Promise<void> {
  const { convertFileSrc, invoke } = await import("@tauri-apps/api/core");
  try {
    setPackRoot(convertFileSrc(request.packs));
    const { ids, contents } = await loadShelf();
    if (ids.length === 0) throw new Error(`${request.packs}/index.json lists no pack`);
    const { words } = mergeContents(contents);
    const today = new Date();
    for (const target of targetsOf(ids)) {
      const files = await renderTarget(targetWords(words, target), today);
      const manifest = files.map((file) => ({
        name: file.name,
        bytes: file.pdf.length,
        pages: file.pages
      }));
      await invoke<null>("export_write", joined(files), {
        headers: {
          target: target.id,
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
