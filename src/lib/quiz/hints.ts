import { CONTENT_LANG, langOf } from "../content/locale";
import type { Kanji, Word } from "../content/types";
import { audioPath, imagePath, packUrl } from "../packs/url";
import { toRomajiHint } from "./romaji.ts";
import type { Difficulty, Format } from "./settings";

export type HintKind = "romaji" | "clue" | "look" | "image" | "ghost";
export type Hint = { kind: HintKind; text: string; lang?: string };

export type LookIndex = ReadonlyMap<string, Pick<Kanji, "look" | "lang">>;

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
  return new Map(kanji.map((entry) => [entry.character, entry]));
}

export function imageUrl(word: Word): string {
  return packUrl(word.pack, imagePath(word));
}

export function audioUrl(word: Word): string {
  return packUrl(word.pack, audioPath(word));
}

function looksOf(word: Word, looks: LookIndex): Omit<Hint, "kind"> {
  const parts = word.kanji.flatMap((character) => {
    const entry = looks.get(character);
    return entry === undefined || entry.look === "" ? [] : [entry];
  });
  const langs = new Set(parts.map(langOf));
  return {
    text: parts.map((part) => part.look).join(" "),
    lang: langs.size === 1 ? [...langs][0] : CONTENT_LANG
  };
}

/** Hides every other kana of a romaji hint, so it helps without spelling the answer out. */
export function maskedRomaji(reading: string): string {
  return toRomajiHint(reading)
    .split("-")
    .map((syllable, index) => (index % 2 === 0 ? syllable : "?"))
    .join("-");
}

export function textOf(word: Word, kind: HintKind, looks: LookIndex): Omit<Hint, "kind"> {
  if (kind === "romaji") return { text: maskedRomaji(word.reading), lang: "ja-Latn" };
  if (kind === "clue") return { text: word.clue, lang: langOf(word) };
  if (kind === "look") return looksOf(word, looks);
  if (kind === "ghost") return { text: word.written, lang: "ja" };
  return { text: imageUrl(word) };
}

export function hintFor(
  word: Word,
  format: Format,
  difficulty: Difficulty,
  looks: LookIndex
): Hint | null {
  const kind = hintKind(format, difficulty);
  if (kind === null) return null;
  const content = textOf(word, kind, looks);
  return content.text === "" ? null : { kind, ...content };
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
    shape: "2-kanji",
    hasAudio: true,
    set: "places",
    subcategory: "buildings",
    level: "N5",
    pack: "n5-base",
    file: "school"
  };

  const looks: LookIndex = new Map([
    ["学", { look: "A roof over a child, with three sparks above it." }],
    ["校", { look: "The tree radical beside a figure with crossed legs." }]
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
      expect(hintFor(word, "audio-kana", "beginner", looks)).toEqual({ kind: "romaji", text: "ga-?-ko-?", lang: "ja-Latn" });
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

  describe("hinting in the learner's language", () => {
    const dutch: Word = { ...word, clue: "Waar kinderen op een doordeweekse ochtend les krijgen.", lang: "nl" };
    const halfDutch: LookIndex = new Map([...looks, ["学", { look: "Een dak boven een kind.", lang: "nl" }]]);

    test("tags a translated clue with its language", () => {
      expect(hintFor(dutch, "kanji-meaning", "advanced", looks)).toEqual({
        kind: "clue",
        text: "Waar kinderen op een doordeweekse ochtend les krijgen.",
        lang: "nl"
      });
    });

    test("tags an untranslated clue English", () => {
      expect(hintFor(word, "kanji-meaning", "advanced", looks)?.lang).toBe("en");
    });

    test("tags a half translated shape description as English", () => {
      const hint = hintFor(word, "kana-kanji", "beginner", halfDutch);
      expect(hint?.text).toBe("Een dak boven een kind. The tree radical beside a figure with crossed legs.");
      expect(hint?.lang).toBe("en");
    });

    test("tags a fully translated shape description with its language", () => {
      const both: LookIndex = new Map([...halfDutch, ["校", { look: "Een boom naast een figuur.", lang: "nl" }]]);
      expect(hintFor(word, "kana-kanji", "beginner", both)?.lang).toBe("nl");
    });
  });

  describe("filling a hint with content", () => {
    test("writes a reading in romaji with every other kana hidden", () => {
      expect(hintFor(word, "kanji-kana", "beginner", looks)).toEqual({
        kind: "romaji",
        text: "ga-?-ko-?",
        lang: "ja-Latn"
      });
      expect(maskedRomaji("き")).toBe("ki");
      expect(maskedRomaji("やま")).toBe("ya-?");
      expect(maskedRomaji("たべる")).toBe("ta-?-ru");
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
        text: "/packs/n5-base/images/places/buildings/school.webp"
      });
    });

    test("names a clip after the same file as the picture", () => {
      expect(audioUrl(word)).toBe("/packs/n5-base/audio/places/buildings/school.mp3");
    });

    test("keeps a word's media put when its label changes", () => {
      expect(imageUrl({ ...word, meaning: "place of learning" })).toBe(
        "/packs/n5-base/images/places/buildings/school.webp"
      );
    });

    test("files a word's media under the pack it came from", () => {
      expect(audioUrl({ ...word, pack: "n5-travel" })).toBe(
        "/packs/n5-travel/audio/places/buildings/school.mp3"
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
