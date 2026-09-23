import type { Kanji, Word } from "../content/types";
import { pageCount } from "./pdf";
import { renderFlashcards } from "./render";

export type PrintJob =
  | { state: "idle" }
  | { state: "running"; done: number; total: number; size: number; cards: number }
  | { state: "ready"; pdf: Uint8Array; pages: number; size: number; cards: number }
  | { state: "failed" };

class PrintJobState {
  job = $state<PrintJob>({ state: "idle" });
  #controller: AbortController | null = null;

  get busy(): boolean {
    return this.job.state === "running";
  }

  async start(
    words: readonly Word[],
    kanji: readonly Kanji[],
    size: number
  ): Promise<void> {
    if (this.busy || words.length === 0) return;
    const controller = new AbortController();
    this.#controller = controller;
    const cards = words.length;
    this.job = { state: "running", done: 0, total: 0, size, cards };
    try {
      const pdf = await renderFlashcards(words, kanji, size, {
        signal: controller.signal,
        onpage: (done, total) => {
          if (!controller.signal.aborted) this.job = { state: "running", done, total, size, cards };
        }
      });
      this.job = { state: "ready", pdf, pages: pageCount(cards, size), size, cards };
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
