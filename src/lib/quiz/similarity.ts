import type { Kanji, Word } from "../content/types";
import { toRomaji } from "./romaji";
import type { Surface } from "./settings";

export type ComponentIndex = ReadonlyMap<string, readonly string[]>;

export const SHARED_KANJI = 3;
export const SHARED_COMPONENT = 2;
export const SAME_LENGTH = 1;

const UNVOICED: Record<string, string> = {
  g: "k",
  z: "s",
  j: "s",
  d: "t",
  b: "h",
  p: "h",
  f: "h"
};

const LONG = /([aiueo])(?:\1|(?<=[ou])u|(?<=e)i)/g;

export function componentIndex(kanji: readonly Kanji[]): ComponentIndex {
  return new Map(kanji.map((entry) => [entry.character, entry.components]));
}

export function foldReading(reading: string): string {
  const letters = toRomaji(reading)
    .replace(/(.)\1/g, (doubled, letter: string) => (letter === "n" ? doubled : letter))
    .replace(/tch/g, "ch")
    .replace(/[gzjdbpf]/g, (letter) => UNVOICED[letter]);
  return letters.replace(LONG, "$1");
}

function shareAnything(left: readonly string[], right: readonly string[]): boolean {
  return left.some((entry) => right.includes(entry));
}

function componentsOf(word: Word, components: ComponentIndex): string[] {
  return word.kanji.flatMap((character) => [...(components.get(character) ?? [])]);
}

function writtenScore(target: Word, candidate: Word, components: ComponentIndex): number {
  if (shareAnything(target.kanji, candidate.kanji)) return SHARED_KANJI;
  if (shareAnything(componentsOf(target, components), componentsOf(candidate, components))) {
    return SHARED_COMPONENT;
  }
  return target.kanjiCount === candidate.kanjiCount ? SAME_LENGTH : 0;
}

const ECHO = 2;

function shares(left: string, right: string, end: "head" | "tail"): boolean {
  const head = end === "head";
  const a = head ? left.slice(0, ECHO) : left.slice(-ECHO);
  const b = head ? right.slice(0, ECHO) : right.slice(-ECHO);
  return a.length === ECHO && a === b;
}

function readingScore(target: Word, candidate: Word): number {
  const left = foldReading(target.reading);
  const right = foldReading(candidate.reading);
  if (left === right) return SHARED_KANJI;
  if (left.startsWith(right) || right.startsWith(left)) return SHARED_COMPONENT;
  return shares(left, right, "head") || shares(left, right, "tail") ? SAME_LENGTH : 0;
}

export function similarity(
  target: Word,
  candidate: Word,
  surface: Surface,
  components: ComponentIndex = new Map()
): number {
  if (target.id === candidate.id) return 0;
  if (surface === "written") return writtenScore(target, candidate, components);
  if (surface === "reading") return readingScore(target, candidate);
  return writtenScore(target, candidate, components) + readingScore(target, candidate);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function word(written: string, reading: string, kanji: string[]): Word {
    return {
      id: `${written}|${reading}`,
      written,
      reading,
      readings: [reading],
      glosses: [written],
      meaning: written,
      clue: "",
      kanji,
      kanjiCount: kanji.length >= 2 ? 2 : 1,
      hasOkurigana: false,
      hasAudio: true,
      set: "places",
    subcategory: "buildings",
      level: "N5"
    };
  }

  const train = word("電車", "でんしゃ", ["電", "車"]);
  const phone = word("電話", "でんわ", ["電", "話"]);
  const mountain = word("山", "やま", ["山"]);
  const components = componentIndex([
    { character: "電", level: "N5", look: "", components: ["雨", "田"], on: [], kun: [] },
    { character: "車", level: "N5", look: "", components: ["車"], on: [], kun: [] },
    { character: "話", level: "N5", look: "", components: ["言", "舌"], on: [], kun: [] },
    { character: "山", level: "N5", look: "", components: ["山"], on: [], kun: [] },
    { character: "雪", level: "N5", look: "", components: ["雨", "ヨ"], on: [], kun: [] }
  ]);

  describe("scoring how believable one word is as another's distractor", () => {
    test("ranks a word sharing a kanji over one sharing nothing", () => {
      expect(similarity(train, phone, "written", components)).toBeGreaterThan(
        similarity(train, mountain, "written", components)
      );
      expect(similarity(train, phone, "written", components)).toBe(SHARED_KANJI);
      expect(similarity(train, mountain, "written", components)).toBe(0);
    });

    test("ranks a shared component under a shared kanji but over nothing", () => {
      const snow = word("雪", "ゆき", ["雪"]);
      expect(similarity(mountain, snow, "written", components)).toBe(SAME_LENGTH);
      const snowy = word("雪山", "ゆきやま", ["雪", "山"]);
      expect(similarity(train, snowy, "written", components)).toBe(SHARED_COMPONENT);
    });

    test("falls back to writing the same number of kanji", () => {
      const river = word("川口", "かわぐち", ["川", "口"]);
      expect(similarity(train, river, "written", new Map())).toBe(SAME_LENGTH);
      expect(similarity(mountain, river, "written", new Map())).toBe(0);
    });

    test("never scores a word against itself", () => {
      expect(similarity(train, train, "written", components)).toBe(0);
      expect(similarity(train, train, "reading")).toBe(0);
    });

    test("scores a meaning by the word it belongs to, not by English", () => {
      expect(similarity(train, phone, "meaning", components)).toBeGreaterThan(
        similarity(train, mountain, "meaning", components)
      );
    });
  });

  describe("folding a reading down to what it sounds like", () => {
    test("shortens a long vowel", () => {
      expect(foldReading("こうこう")).toBe(foldReading("ここ"));
      expect(foldReading("せんせい")).toBe(foldReading("せんせ"));
    });

    test("drops voicing", () => {
      expect(foldReading("かぎ")).toBe(foldReading("かき"));
      expect(foldReading("ぶた")).toBe(foldReading("ふた"));
    });

    test("drops a small tsu", () => {
      expect(foldReading("がっこう")).toBe(foldReading("かこ"));
    });

    test("keeps two plainly different readings apart", () => {
      expect(foldReading("やま")).not.toBe(foldReading("かわ"));
    });

    test("keeps the n of a doubled n, which is a mora of its own", () => {
      expect(foldReading("あんない")).toBe("annai");
    });

    test("hears an echo in a shared opening or a shared ending", () => {
      const rain = word("雨", "あめ", ["雨"]);
      const candy = word("飴", "あめ", ["飴"]);
      const shoulder = word("肩", "かた", ["肩"]);
      expect(similarity(rain, candy, "reading")).toBe(SHARED_KANJI);
      expect(similarity(rain, word("飴玉", "あめだま", ["飴"]), "reading")).toBe(SHARED_COMPONENT);
      expect(similarity(shoulder, word("船", "ふね", ["船"]), "reading")).toBe(0);
      expect(similarity(shoulder, word("川", "かわ", ["川"]), "reading")).toBe(SAME_LENGTH);
      expect(similarity(shoulder, word("蓋", "ふた", ["蓋"]), "reading")).toBe(SAME_LENGTH);
    });

    test("scores a near-identical reading above an unrelated one", () => {
      const nine = word("九", "きゅう", ["九"]);
      const today = word("今日", "きょう", ["今", "日"]);
      const water = word("水", "みず", ["水"]);
      expect(similarity(nine, today, "reading")).toBeGreaterThan(
        similarity(nine, water, "reading")
      );
    });
  });
}
