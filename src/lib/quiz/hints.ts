import type { Kanji, Word } from "../content/types";
import { audioPath, imagePath, packUrl } from "../packs/url";
import { toRomajiHint } from "./romaji.ts";
import type { Difficulty, Format } from "./settings";

export type HintKind = "romaji" | "clue" | "look" | "image" | "ghost";
export type Hint = { kind: HintKind; text: string };

export type LookIndex = ReadonlyMap<string, string>;

const KINDS: Record<Format, { beginner: HintKind | null; advanced: HintKind | null }> = {
  "kanji-kana": { beginner: "romaji", advanced: "clue" },
  "kana-kanji": { beginner: "look", advanced: "image" },
  "kanji-meaning": { beginner: "image", advanced: "clue" },
  "meaning-kanji": { beginner: "look", advanced: null },
  "kana-meaning": { beginner: "image", advanced: "clue" },
  "meaning-kana": { beginner: "romaji", advanced: null },
  "image-kanji": { beginner: "look", advanced: null },
  "image-kana": { beginner: "romaji", advanced: null },
  "audio-kana": { beginner: "romaji", advanced: null },
  "audio-kanji": { beginner: "look", advanced: null },
  "kanji-audio": { beginner: null, advanced: null },
  "kana-assemble": { beginner: "ghost", advanced: null }
};

export function hintKind(format: Format, difficulty: Difficulty): HintKind | null {
  if (difficulty === "expert") return null;
  return KINDS[format][difficulty];
}

export function lookIndex(kanji: readonly Kanji[]): LookIndex {
  return new Map(kanji.map((entry) => [entry.character, entry.look]));
}

export function imageUrl(word: Word): string {
  return packUrl(word.pack, imagePath(word));
}

export function audioUrl(word: Word): string {
  return packUrl(word.pack, audioPath(word));
}

/** Swaps a light image url for its pre-rendered dark counterpart. */
export function darkImageUrl(url: string): string {
  return url.replace("/images/light/", "/images/dark/");
}

function looksOf(word: Word, looks: LookIndex): string {
  return word.kanji
    .map((character) => looks.get(character) ?? "")
    .filter((look) => look !== "")
    .join(" ");
}

export function textOf(word: Word, kind: HintKind, looks: LookIndex): string {
  if (kind === "romaji") return toRomajiHint(word.reading);
  if (kind === "clue") return word.clue;
  if (kind === "look") return looksOf(word, looks);
  if (kind === "ghost") return word.written;
  return imageUrl(word);
}

export function hintFor(
  word: Word,
  format: Format,
  difficulty: Difficulty,
  looks: LookIndex
): Hint | null {
  const kind = hintKind(format, difficulty);
  if (kind === null) return null;
  const text = textOf(word, kind, looks);
  return text === "" ? null : { kind, text };
}

export function fallbackHint(word: Word, format: Format, looks: LookIndex): Hint | null {
  return hintFor(word, format, "beginner", looks);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const word: Word = {
    id: "学校|がっこう",
    written: "学校",
    reading: "がっこう",
    readings: ["がっこう"],
    glosses: ["school"],
    meaning: "school",
    clue: "Where children go on a weekday morning to be taught.",
    kanji: ["学", "校"],
    kanjiCount: 2,
    hasOkurigana: false,
    hasAudio: true,
    set: "places",
    subcategory: "buildings",
    level: "N5",
    pack: "n5-base",
    file: "school"
  };

  const looks = new Map([
    ["学", "A roof over a child, with three sparks above it."],
    ["校", "The tree radical beside a figure with crossed legs."]
  ]);

  describe("choosing what a hint shows", () => {
    test("names one kind for every format and tier pair", () => {
      const formats = Object.keys(KINDS) as Format[];
      expect(formats.map((format) => hintKind(format, "beginner"))).toEqual([
        "romaji",
        "look",
        "image",
        "look",
        "image",
        "romaji",
        "look",
        "romaji",
        "romaji",
        "look",
        null,
        "ghost"
      ]);
      expect(formats.map((format) => hintKind(format, "advanced"))).toEqual([
        "clue",
        "image",
        "clue",
        null,
        "clue",
        null,
        null,
        null,
        null,
        null,
        null,
        null
      ]);
    });

    test("offers no hint where an advanced learner already has the answer's shape", () => {
      expect(hintKind("meaning-kanji", "advanced")).toBeNull();
      expect(hintFor(word, "meaning-kanji", "advanced", looks)).toBeNull();
      expect(hintKind("meaning-kana", "advanced")).toBeNull();
      expect(hintKind("image-kanji", "advanced")).toBeNull();
      expect(hintKind("image-kana", "advanced")).toBeNull();
    });

    test("spells a heard word out on beginner only, and never hints which recording is right", () => {
      expect(hintFor(word, "audio-kana", "beginner", looks)).toEqual({ kind: "romaji", text: "ga-k-ko-u" });
      expect(hintFor(word, "audio-kanji", "beginner", looks)?.kind).toBe("look");
      expect(hintKind("audio-kana", "advanced")).toBeNull();
      expect(hintKind("audio-kanji", "advanced")).toBeNull();
      expect(hintKind("kanji-audio", "beginner")).toBeNull();
    });

    test("offers an expert no hint at all", () => {
      const formats = Object.keys(KINDS) as Format[];
      expect(formats.map((format) => hintKind(format, "expert"))).toEqual(formats.map(() => null));
      expect(hintFor(word, "kanji-kana", "expert", looks)).toBeNull();
    });
  });

  describe("filling a hint with content", () => {
    test("writes a reading in romaji", () => {
      expect(hintFor(word, "kanji-kana", "beginner", looks)).toEqual({
        kind: "romaji",
        text: "ga-k-ko-u"
      });
    });

    test("shows the curated clue without naming the word", () => {
      const hint = hintFor(word, "kanji-meaning", "advanced", looks);
      expect(hint?.kind).toBe("clue");
      expect(hint?.text).toBe(word.clue);
    });

    test("joins one shape description per kanji of the word", () => {
      const hint = hintFor(word, "kana-kanji", "beginner", looks);
      expect(hint?.text).toContain("A roof over a child");
      expect(hint?.text).toContain("crossed legs");
    });

    test("points at the picture the word's meaning names", () => {
      expect(hintFor(word, "kana-kanji", "advanced", looks)).toEqual({
        kind: "image",
        text: "/packs/n5-base/images/light/places/buildings/school.webp"
      });
    });

    test("names a clip after the same file as the picture", () => {
      expect(audioUrl(word)).toBe("/packs/n5-base/audio/places/buildings/school.mp3");
    });

    test("keeps a word's media put when its label changes", () => {
      expect(imageUrl({ ...word, meaning: "place of learning" })).toBe(
        "/packs/n5-base/images/light/places/buildings/school.webp"
      );
    });

    test("files a word's media under the pack it came from", () => {
      expect(audioUrl({ ...word, pack: "n5-travel" })).toBe(
        "/packs/n5-travel/audio/places/buildings/school.mp3"
      );
    });

    test("swaps the light image url for its dark counterpart", () => {
      expect(darkImageUrl("/packs/n5-base/images/light/places/buildings/school.webp")).toBe(
        "/packs/n5-base/images/dark/places/buildings/school.webp"
      );
    });

    test("hides a hint the content cannot fill", () => {
      expect(hintFor({ ...word, clue: "" }, "kanji-meaning", "advanced", looks)).toBeNull();
      expect(hintFor(word, "kana-kanji", "beginner", new Map())).toBeNull();
    });

    test("falls back to the beginner hint when a picture will not load", () => {
      expect(fallbackHint(word, "kana-kanji", looks)?.kind).toBe("look");
      expect(fallbackHint(word, "kanji-meaning", looks)?.kind).toBe("image");
    });
  });
}
