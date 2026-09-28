import type { Kanji, Word } from "./types";

export type WordTranslation = { meaning: string; glosses: string[]; clue: string; example?: string };

export type PackLocale = {
  words: ReadonlyMap<string, WordTranslation>;
  looks: ReadonlyMap<string, string>;
};

export const CONTENT_LANG = "en";

export const NO_PACK_LOCALE: PackLocale = { words: new Map(), looks: new Map() };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function wordOf(value: unknown): WordTranslation | null {
  if (!isRecord(value)) return null;
  const { meaning, glosses, clue, example } = value;
  if (!isText(meaning) || !isText(clue)) return null;
  if (!Array.isArray(glosses) || glosses.length === 0 || !glosses.every(isText)) return null;
  if (example !== undefined && !isText(example)) return null;
  return example === undefined ? { meaning, glosses, clue } : { meaning, glosses, clue, example };
}

function entries<T>(value: unknown, read: (entry: unknown) => T | null): Map<string, T> | null {
  if (value === undefined) return new Map();
  if (!isRecord(value)) return null;
  const out = new Map<string, T>();
  for (const [key, entry] of Object.entries(value)) {
    const parsed = read(entry);
    if (parsed === null) return null;
    out.set(key, parsed);
  }
  return out;
}

export function parsePackLocale(value: unknown): PackLocale | null {
  if (!isRecord(value)) return null;
  const words = entries(value.words, wordOf);
  const looks = entries(value.looks, (look) => (isText(look) ? look : null));
  return words === null || looks === null ? null : { words, looks };
}

export function mergePackLocales(locales: readonly (PackLocale | null)[]): PackLocale {
  const words = new Map<string, WordTranslation>();
  const looks = new Map<string, string>();
  for (const locale of locales) {
    if (locale === null) continue;
    for (const [id, word] of locale.words) if (!words.has(id)) words.set(id, word);
    for (const [character, text] of locale.looks) if (!looks.has(character)) looks.set(character, text);
  }
  return { words, looks };
}

export function langOf(entry: { lang?: string }): string {
  return entry.lang ?? CONTENT_LANG;
}

export function translateWords(words: readonly Word[], locale: PackLocale, lang: string): Word[] {
  return words.map((word) => {
    const translation = locale.words.get(word.id);
    if (translation === undefined) return word;
    const { meaning, glosses, clue, example } = translation;
    return {
      ...word,
      meaning,
      glosses,
      clue,
      lang,
      ...(word.example === undefined || example === undefined
        ? {}
        : { example: { ...word.example, english: example } })
    };
  });
}

export function translateKanji(kanji: readonly Kanji[], locale: PackLocale, lang: string): Kanji[] {
  return kanji.map((entry) => {
    const look = locale.looks.get(entry.character);
    return look === undefined ? entry : { ...entry, look, lang };
  });
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const mountain = { meaning: "berg", glosses: ["berg"], clue: "Hoog en van steen." };

  describe("reading a pack's locale file", () => {
    test("keeps the words and looks it translates", () => {
      const locale = parsePackLocale({ words: { "山|やま": mountain }, looks: { 山: "drie pieken" } });
      expect(locale?.words.get("山|やま")).toEqual(mountain);
      expect(locale?.looks.get("山")).toBe("drie pieken");
    });

    test("treats a missing section as nothing translated", () => {
      expect(parsePackLocale({ words: { a: mountain } })?.looks.size).toBe(0);
    });

    test("refuses a file that is not a locale", () => {
      expect(parsePackLocale(null)).toBeNull();
      expect(parsePackLocale("<!doctype html>")).toBeNull();
      expect(parsePackLocale({ looks: ["a"] })).toBeNull();
      expect(parsePackLocale({ looks: { 山: "" } })).toBeNull();
      expect(parsePackLocale({ words: { a: { ...mountain, glosses: [] } } })).toBeNull();
      expect(parsePackLocale({ words: { a: { ...mountain, meaning: 1 } } })).toBeNull();
      expect(parsePackLocale({ words: { a: { ...mountain, example: "" } } })).toBeNull();
    });
  });

  describe("merging the locales of the installed packs", () => {
    test("puts every pack's translations together and skips packs without one", () => {
      const base = parsePackLocale({ words: { a: mountain }, looks: { 山: "pieken" } });
      const plus = parsePackLocale({ words: { b: mountain }, looks: { 山: "later" } });
      const merged = mergePackLocales([base, null, plus]);
      expect([...merged.words.keys()]).toEqual(["a", "b"]);
      expect(merged.looks.get("山")).toBe("pieken");
    });
  });

  describe("translating the content", () => {
    const word: Word = {
      id: "山|やま",
      written: "山",
      reading: "やま",
      readings: ["やま"],
      glosses: ["mountain"],
      meaning: "mountain",
      clue: "High and made of rock.",
      kanji: ["山"],
      shape: "1-kanji",
      hasAudio: true,
      set: "nature",
      subcategory: "landscape",
      level: "N5",
      pack: "n5-base",
      file: "mountain",
      example: { japanese: "山に登ります。", romaji: "Yama ni noborimasu.", english: "I climb the mountain." }
    };
    const dutch = parsePackLocale({
      words: { [word.id]: { ...mountain, example: "Ik beklim de berg." } },
      looks: { 山: "drie pieken" }
    }) ?? NO_PACK_LOCALE;

    test("swaps in the meaning, answers, clue and example sentence, tagged with the language", () => {
      const [translated] = translateWords([word], dutch, "nl");
      expect(translated).toMatchObject({ meaning: "berg", glosses: ["berg"], clue: "Hoog en van steen.", lang: "nl" });
      expect(translated.example).toEqual({ ...word.example, english: "Ik beklim de berg." });
      expect(langOf(translated)).toBe("nl");
    });

    test("leaves an untranslated word English", () => {
      const [kept] = translateWords([{ ...word, id: "other" }], dutch, "nl");
      expect(kept.meaning).toBe("mountain");
      expect(langOf(kept)).toBe("en");
    });

    test("swaps in a kanji's look, tagged with the language", () => {
      const kanji: Kanji = { character: "山", level: "N5", look: "Three peaks.", components: [], on: [], kun: [] };
      expect(translateKanji([kanji], dutch, "nl")[0]).toMatchObject({ look: "drie pieken", lang: "nl" });
      expect(translateKanji([{ ...kanji, character: "川" }], dutch, "nl")[0].lang).toBeUndefined();
    });
  });

  describe("the pack locale files on disk", () => {
    test("translate every word and kanji of their pack, and nothing else", async () => {
      const { readdir, readFile } = await import("node:fs/promises");
      const { parseContent } = await import("./load");
      const packs = new URL("../../../data/packs/", import.meta.url);
      const found = await readdir(packs, { withFileTypes: true }).catch(() => []);
      for (const pack of found) {
        if (!pack.isDirectory()) continue;
        const folder = new URL(`${pack.name}/`, packs);
        const files = await readdir(new URL("locale/", folder)).catch(() => []);
        if (files.length === 0) continue;
        const content = parseContent(JSON.parse(await readFile(new URL("content.json", folder), "utf8")));
        const words = content?.words ?? [];
        const kanji = (content?.kanji ?? []).filter((entry) => entry.look !== "").map((entry) => entry.character);
        for (const file of files) {
          const where = `${pack.name}/locale/${file}`;
          const locale = parsePackLocale(JSON.parse(await readFile(new URL(`locale/${file}`, folder), "utf8")));
          expect(locale, where).not.toBeNull();
          expect([...(locale?.words.keys() ?? [])].sort(), where).toEqual(words.map((word) => word.id).sort());
          expect([...(locale?.looks.keys() ?? [])].sort(), where).toEqual([...kanji].sort());
          const unmatched = words.filter((word) => (word.example === undefined) !== (locale?.words.get(word.id)?.example === undefined));
          expect(unmatched.map((word) => word.id), where).toEqual([]);
        }
      }
    });
  });
}
