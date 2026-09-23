import { subcategoryKey, type SetId } from "../content/sets";
import type { Kanji, Word } from "../content/types";
import { atLevel, wordShape } from "../quiz/questions";
import { toRomajiHint } from "../quiz/romaji";
import type { WordShape } from "../quiz/settings";

export type WordFilter = {
  level: string;
  shapes: WordShape[];
  sets: SetId[];
  subcategories: string[];
  search: string;
};

export type KanjiReadings = {
  character: string;
  on: string[];
  kun: string[];
};

export type CardFace = {
  written: string;
  kana: string;
  romaji: string;
  meaning: string;
  kanji: KanjiReadings[];
};

export function emptyFilter(level: string): WordFilter {
  return { level, shapes: [], sets: [], subcategories: [], search: "" };
}

export function toggled<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((entry) => entry !== item) : [...items, item];
}

export function toggleFilterSet(filter: WordFilter, set: SetId): WordFilter {
  return {
    ...filter,
    sets: toggled(filter.sets, set),
    subcategories: filter.subcategories.filter((key) => !key.startsWith(`${set}/`))
  };
}

export function activeFilterCount(filter: WordFilter): number {
  return [filter.search.trim(), filter.shapes, filter.sets, filter.subcategories].filter(
    (part) => part.length > 0
  ).length;
}

export function filterWords(words: readonly Word[], filter: WordFilter): Word[] {
  const shapes = new Set(filter.shapes);
  const sets = new Set(filter.sets);
  const subcategories = new Set(filter.subcategories);
  const narrowedSets = new Set(filter.subcategories.map((key) => key.split("/")[0]));
  const needle = filter.search.trim().toLowerCase();
  return atLevel(words, filter.level).filter((word) => {
    if (sets.size > 0 && !sets.has(word.set)) return false;
    if (
      narrowedSets.has(word.set) &&
      !subcategories.has(subcategoryKey(word.set, word.subcategory))
    )
      return false;
    if (shapes.size > 0 && !shapes.has(wordShape(word))) return false;
    if (needle === "") return true;
    return [word.written, ...word.readings, ...word.glosses].some((text) =>
      text.toLowerCase().includes(needle)
    );
  });
}

export function kunForDisplay(reading: string): string {
  const [stem, okurigana] = reading.split(".");
  return okurigana === undefined ? stem : `${stem}(${okurigana})`;
}

export function separated(items: readonly string[], mark: string): string[] {
  return items.map((item, index) => (index < items.length - 1 ? `${item}${mark}` : item));
}

export function listed(readings: readonly string[]): string[] {
  return readings.length === 0 ? ["—"] : separated(readings, "、");
}

export function kanjiIndex(kanji: readonly Kanji[]): ReadonlyMap<string, Kanji> {
  return new Map(kanji.map((entry) => [entry.character, entry]));
}

export function cardFace(word: Word, kanji: ReadonlyMap<string, Kanji>): CardFace {
  return {
    written: word.written,
    kana: word.reading,
    romaji: toRomajiHint(word.reading),
    meaning: word.meaning,
    kanji: [...new Set(word.kanji)].map((character) => {
      const entry = kanji.get(character);
      return {
        character,
        on: entry?.on ?? [],
        kun: (entry?.kun ?? []).map(kunForDisplay)
      };
    })
  };
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function word(id: string, set: SetId, subcategory: string, extra: Partial<Word> = {}): Word {
    return {
      id,
      written: id,
      reading: "よみ",
      readings: ["よみ"],
      glosses: [`${id} gloss`],
      meaning: id,
      clue: "",
      kanji: [id[0] ?? ""],
      kanjiCount: 1,
      hasOkurigana: false,
      hasAudio: true,
      set,
      subcategory,
      level: "N5",
      ...extra
    };
  }

  const one = word("一", "numbers", "digits");
  const monday = word("月", "calendar", "days");
  const month = word("月曜", "calendar", "months", { kanjiCount: 2, kanji: ["月", "曜"] });
  const raise = word("上げる", "actions", "movement", { hasOkurigana: true });
  const words = [one, monday, month, raise];
  const all = emptyFilter("N5");

  describe("filtering the words to browse", () => {
    test("keeps every word of the level when nothing is picked", () => {
      expect(filterWords(words, all)).toEqual(words);
      expect(filterWords(words, emptyFilter("N4"))).toEqual([]);
    });

    test("narrows by category, and by subcategory only inside the set it belongs to", () => {
      const filter = {
        ...all,
        sets: ["calendar", "numbers"] as SetId[],
        subcategories: ["calendar/days"]
      };
      expect(filterWords(words, filter).map((entry) => entry.id)).toEqual(["一", "月"]);
    });

    test("narrows by word shape", () => {
      expect(filterWords(words, { ...all, shapes: ["okurigana"] })).toEqual([raise]);
      expect(filterWords(words, { ...all, shapes: ["2-kanji"] })).toEqual([month]);
    });

    test("matches a search against the written form, readings and glosses", () => {
      expect(filterWords(words, { ...all, search: " 一 GLOSS " })).toEqual([one]);
    });

    test("drops a set's subcategories when the set is unpicked", () => {
      const picked = { ...all, sets: ["calendar"] as SetId[], subcategories: ["calendar/days"] };
      expect(toggleFilterSet(picked, "calendar")).toEqual(all);
    });

    test("counts each kind of narrowing once", () => {
      expect(activeFilterCount(all)).toBe(0);
      expect(activeFilterCount({ ...all, search: "x", shapes: ["1-kanji", "2-kanji"] })).toBe(2);
    });
  });

  describe("the back of a card", () => {
    const index = kanjiIndex([
      {
        character: "月",
        level: "N5",
        look: "",
        components: [],
        on: ["ゲツ", "ガツ"],
        kun: ["つき"]
      },
      {
        character: "上",
        level: "N5",
        look: "",
        components: [],
        on: ["ジョウ"],
        kun: ["あ.げる", "うえ"]
      }
    ]);

    test("writes a kun reading's okurigana in brackets", () => {
      expect(kunForDisplay("あ.げる")).toBe("あ(げる)");
      expect(kunForDisplay("うえ")).toBe("うえ");
    });

    test("lists readings with a comma after all but the last, and a dash for none", () => {
      expect(listed(["ゲツ", "ガツ", "つき"])).toEqual(["ゲツ、", "ガツ、", "つき"]);
      expect(listed([])).toEqual(["—"]);
    });

    test("carries the reading, romaji, meaning and each kanji's readings once", () => {
      const face = cardFace(
        { ...monday, written: "月月", kanji: ["月", "月"], reading: "つき" },
        index
      );
      expect(face).toMatchObject({ kana: "つき", romaji: "tsu-ki", meaning: "月" });
      expect(face.kanji).toEqual([{ character: "月", on: ["ゲツ", "ガツ"], kun: ["つき"] }]);
    });

    test("leaves the readings empty for a kanji the dictionary lacks", () => {
      expect(cardFace(one, index).kanji).toEqual([{ character: "一", on: [], kun: [] }]);
    });
  });
}
