import { shared } from "kaizen-ui";
import { ClipCache, fetchClip } from "./cache";
import { decodePeaks, FLAT_PEAKS } from "./waveform";

class ClipPlayer {
  playing = $state<string | null>(null);
  /** Path whose waveform should show `progress`; stays set after `playing` clears on end. */
  current = $state<string | null>(null);
  progress = $state(0);
  #peaks = $state<Record<string, number[]>>({});
  #decoding = new Set<string>();
  #cache = new ClipCache(fetchClip, (url) => URL.revokeObjectURL(url));
  #element: HTMLAudioElement | null = null;
  #token = 0;

  #audio(): HTMLAudioElement {
    if (this.#element !== null) return this.#element;
    const element = new Audio();
    element.preload = "auto";
    element.addEventListener("timeupdate", () => {
      const length = element.duration;
      if (Number.isFinite(length) && length > 0) this.progress = element.currentTime / length;
    });
    element.addEventListener("ended", () => {
      this.playing = null;
      this.progress = 1;
    });
    this.#element = element;
    return element;
  }

  /** Bars for the clip's waveform; flat until the clip has been decoded. */
  peaks(path: string): number[] {
    const found = this.#peaks[path];
    if (found !== undefined) return found;
    void this.#decode(path);
    return FLAT_PEAKS;
  }

  async #decode(path: string): Promise<void> {
    if (this.#decoding.has(path)) return;
    this.#decoding.add(path);
    const url = await this.#cache.url(path);
    this.#peaks[path] = url === null ? FLAT_PEAKS : await decodePeaks(url);
  }

  async play(path: string): Promise<void> {
    this.stop();
    const token = this.#token;
    const url = await this.#cache.url(path);
    if (token !== this.#token || url === null) return;
    const element = this.#audio();
    if (element.src !== url) element.src = url;
    element.currentTime = 0;
    this.playing = path;
    this.current = path;
    try {
      await element.play();
    } catch {
      if (this.playing === path) this.playing = null;
    }
  }

  toggle(path: string): void {
    if (this.playing === path) this.stop();
    else void this.play(path);
  }

  stop(): void {
    this.#token += 1;
    this.#element?.pause();
    this.playing = null;
    this.current = null;
    this.progress = 0;
  }

  preload(paths: Iterable<string>): void {
    for (const path of paths) void this.#cache.url(path);
  }
}

export const clips = shared("kanji-clips", () => new ClipPlayer());
