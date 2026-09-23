export const CLIP_LIMIT = 8;

export type ClipSource = (path: string) => Promise<string | null>;

export class ClipCache {
  #urls = new Map<string, string>();
  #pending = new Map<string, Promise<string | null>>();
  #load: ClipSource;
  #release: (url: string) => void;
  #limit: number;

  constructor(load: ClipSource, release: (url: string) => void, limit: number = CLIP_LIMIT) {
    this.#load = load;
    this.#release = release;
    this.#limit = limit;
  }

  get size(): number {
    return this.#urls.size;
  }

  has(path: string): boolean {
    return this.#urls.has(path);
  }

  url(path: string): Promise<string | null> {
    const ready = this.#urls.get(path);
    if (ready !== undefined) {
      this.#urls.delete(path);
      this.#urls.set(path, ready);
      return Promise.resolve(ready);
    }
    const pending = this.#pending.get(path);
    if (pending !== undefined) return pending;
    const loading = this.#load(path).then((url) => {
      this.#pending.delete(path);
      if (url !== null) this.#keep(path, url);
      return url;
    });
    this.#pending.set(path, loading);
    return loading;
  }

  #keep(path: string, url: string): void {
    this.#urls.set(path, url);
    for (const [oldest, stale] of this.#urls) {
      if (this.#urls.size <= this.#limit) break;
      this.#urls.delete(oldest);
      this.#release(stale);
    }
  }
}

export async function fetchClip(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function fixture(limit = 3) {
    const released: string[] = [];
    const loaded: string[] = [];
    const cache = new ClipCache(
      async (path) => {
        loaded.push(path);
        return path === "missing" ? null : `blob:${path}`;
      },
      (url) => released.push(url),
      limit
    );
    return { cache, released, loaded };
  }

  describe("keeping a bounded set of clips in memory", () => {
    test("revokes the least recently used clip once the limit is passed", async () => {
      const { cache, released } = fixture();
      for (const path of ["a", "b", "c", "d"]) await cache.url(path);
      expect(released).toEqual(["blob:a"]);
      expect(cache.size).toBe(3);
      expect(cache.has("a")).toBe(false);
    });

    test("counts a replay as a use, so the clip being replayed survives", async () => {
      const { cache, released } = fixture();
      for (const path of ["a", "b", "c"]) await cache.url(path);
      await cache.url("a");
      await cache.url("d");
      expect(released).toEqual(["blob:b"]);
      expect(cache.has("a")).toBe(true);
    });

    test("fetches a clip once however often it is asked for at the same time", async () => {
      const { cache, loaded } = fixture();
      await Promise.all([cache.url("a"), cache.url("a"), cache.url("a")]);
      expect(loaded).toEqual(["a"]);
    });

    test("keeps nothing for a clip that failed to load, so a later play retries", async () => {
      const { cache, loaded } = fixture();
      expect(await cache.url("missing")).toBeNull();
      expect(cache.size).toBe(0);
      await cache.url("missing");
      expect(loaded).toEqual(["missing", "missing"]);
    });
  });
}
