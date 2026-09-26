import type { Word } from "../content/types";
import { pageCount } from "./pdf";
import { renderFlashcards } from "./render";

export type PrintFile = { pdf: Uint8Array; pages: number; size: number };

export type PrintJob =
  | { state: "idle" }
  | { state: "running"; done: number; total: number; cards: number }
  | { state: "ready"; files: PrintFile[]; cards: number }
  | { state: "failed" };

class PrintJobState {
  job = $state<PrintJob>({ state: "idle" });
  #controller: AbortController | null = null;

  get busy(): boolean {
    return this.job.state === "running";
  }

  /** Builds one PDF per grid size, one after the other. */
  async start(words: readonly Word[], sizes: readonly number[]): Promise<void> {
    if (this.busy || words.length === 0 || sizes.length === 0) return;
    const controller = new AbortController();
    this.#controller = controller;
    const cards = words.length;
    const total = sizes.reduce((sum, size) => sum + pageCount(cards, size), 0);
    this.job = { state: "running", done: 0, total, cards };
    try {
      const files: PrintFile[] = [];
      let before = 0;
      for (const size of sizes) {
        const pdf = await renderFlashcards(words, size, {
          signal: controller.signal,
          onpage: (done) => {
            if (!controller.signal.aborted)
              this.job = { state: "running", done: before + done, total, cards };
          }
        });
        const pages = pageCount(cards, size);
        files.push({ pdf, pages, size });
        before += pages;
      }
      this.job = { state: "ready", files, cards };
    } catch {
      if (!controller.signal.aborted) this.job = { state: "failed" };
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  cancel(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.job = { state: "idle" };
  }

  discard(): void {
    if (!this.busy) this.job = { state: "idle" };
  }
}

export const printJob = new PrintJobState();
