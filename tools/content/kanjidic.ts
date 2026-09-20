import type { ReadingClass } from "../../src/lib/content/types.ts";

export type KanjiReadings = {
  /** On readings as KANJIDIC writes them, in katakana. */
  on: string[];
  /** Kun readings as KANJIDIC writes them, okurigana after a dot. */
  kun: string[];
};

export type Kanjidic = ReadonlyMap<string, KanjiReadings>;

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_GAP = 0x60;

/** KANJIDIC writes on readings in katakana; words are read in hiragana. */
export function kataToHira(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_GAP)
        : character;
    })
    .join("");
}

/** Drops the okurigana and the affix hyphens, leaving the part inside the kanji. */
export function kunStem(reading: string): string {
  const [stem] = reading.split(".");
  return stem.replace(/-/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readingsOf(character: Record<string, unknown>): KanjiReadings {
  const on: string[] = [];
  const kun: string[] = [];
  const readingMeaning = character.readingMeaning;
  const groups = isRecord(readingMeaning) && Array.isArray(readingMeaning.groups)
    ? readingMeaning.groups
    : [];

  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.readings)) continue;
    for (const reading of group.readings) {
      if (!isRecord(reading)) continue;
      const { type, value } = reading;
      if (typeof value !== "string" || value === "") continue;
      if (type === "ja_on" && !on.includes(value)) on.push(value);
      if (type === "ja_kun" && !kun.includes(value)) kun.push(value);
    }
  }
  return { on, kun };
}

export function parseKanjidic(value: unknown): Kanjidic {
  if (!isRecord(value) || !Array.isArray(value.characters)) {
    throw new Error("kanjidic2: expected an object with a characters array");
  }
  const index = new Map<string, KanjiReadings>();
  for (const character of value.characters) {
    if (!isRecord(character) || typeof character.literal !== "string") continue;
    index.set(character.literal, readingsOf(character));
  }
  if (index.size === 0) {
    throw new Error("kanjidic2: no usable characters");
  }
  return index;
}

/**
 * Which class a single character is being read in. Compounds have no single
 * answer, so this is only asked of one-character words.
 */
export function readingClassOf(
  readings: KanjiReadings,
  reading: string
): ReadingClass | null {
  if (readings.on.some((value) => kataToHira(value) === reading)) return "on";
  if (readings.kun.some((value) => kunStem(value) === reading)) return "kun";
  return null;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const payload = {
    characters: [
      {
        literal: "生",
        readingMeaning: {
          groups: [
            {
              readings: [
                { type: "pinyin", value: "sheng1" },
                { type: "ja_on", value: "セイ" },
                { type: "ja_on", value: "ショウ" },
                { type: "ja_kun", value: "い.きる" },
                { type: "ja_kun", value: "なま" }
              ]
            }
          ]
        }
      },
      { literal: "々", readingMeaning: null }
    ]
  };

  describe("parseKanjidic", () => {
    const index = parseKanjidic(payload);

    test("keeps the on and kun readings apart", () => {
      expect(index.get("生")).toEqual({
        on: ["セイ", "ショウ"],
        kun: ["い.きる", "なま"]
      });
    });

    test("drops the readings of other languages", () => {
      expect(index.get("生")?.on).not.toContain("sheng1");
    });

    test("keeps a character that has no readings at all", () => {
      expect(index.get("々")).toEqual({ on: [], kun: [] });
    });

    test("rejects a payload that is not kanjidic", () => {
      expect(() => parseKanjidic({ characters: [] })).toThrow(/no usable characters/);
      expect(() => parseKanjidic(null)).toThrow(/characters array/);
    });
  });

  describe("kataToHira", () => {
    test("converts an on reading to the script a word is read in", () => {
      expect(kataToHira("ジュウ")).toBe("じゅう");
    });

    test("leaves anything that is not katakana alone", () => {
      expect(kataToHira("いち")).toBe("いち");
    });
  });

  describe("kunStem", () => {
    test("drops the okurigana", () => {
      expect(kunStem("い.きる")).toBe("い");
    });

    test("drops the hyphens that mark an affix", () => {
      expect(kunStem("-うえ")).toBe("うえ");
      expect(kunStem("うわ-")).toBe("うわ");
    });
  });

  describe("readingClassOf", () => {
    const readings = parseKanjidic(payload).get("生") ?? { on: [], kun: [] };

    test("calls a reading that matches an on reading on", () => {
      expect(readingClassOf(readings, "せい")).toBe("on");
    });

    test("calls a reading that matches a kun stem kun", () => {
      expect(readingClassOf(readings, "なま")).toBe("kun");
      expect(readingClassOf(readings, "い")).toBe("kun");
    });

    test("says nothing about a reading the character does not have", () => {
      expect(readingClassOf(readings, "きょう")).toBeNull();
    });
  });
}
