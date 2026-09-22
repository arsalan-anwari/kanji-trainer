const EMPTY_COUNTS = {
  numbers: 0,
  calendar: 0,
  time: 0,
  people: 0,
  position: 0,
  body: 0,
  actions: 0,
  places: 0,
  nature: 0,
  describing: 0,
  objects: 0,
  food: 0
};

export type SetId = keyof typeof EMPTY_COUNTS;

/**
 * The second axis: what a word is about inside its set. A subcategory belongs
 * to exactly one set, so the pair (set, subcategory) names it; the same id may
 * be reused under another set when it means the same thing there.
 */
export const SUBCATEGORIES = {
  numbers: ["digits", "counters", "frequency"],
  calendar: ["weekdays", "days", "weeks", "months", "years", "events", "age"],
  time: ["clock", "duration", "day-parts", "moments", "frequency"],
  people: [
    "family",
    "person-types",
    "school-roles",
    "social",
    "nationality",
    "counts",
    "identity"
  ],
  position: ["compass", "spatial", "sequence"],
  body: ["body-parts", "senses", "health"],
  actions: [
    "movement",
    "transfer",
    "communication",
    "perception",
    "literacy",
    "daily-routine",
    "life-events"
  ],
  places: ["buildings", "building-parts", "transport", "geography", "travel"],
  nature: ["landscape", "weather", "plants", "elements"],
  describing: ["size", "colors", "skill", "condition", "value", "manner", "languages"],
  objects: ["clothing", "stationery", "reading-material", "furniture", "money", "household"],
  food: ["general", "sweets"]
} as const satisfies Record<SetId, readonly string[]>;

/** Every subcategory id, once, in the order the sets declare them. */
export const SUBCATEGORY_IDS: readonly string[] = [
  ...new Set(Object.values(SUBCATEGORIES).flat())
];

export function isSubcategoryOf(set: string, subcategory: string): boolean {
  if (!isSetId(set)) return false;
  return (SUBCATEGORIES[set] as readonly string[]).includes(subcategory);
}

/** The id the settings hold for a (set, subcategory) pair. */
export function subcategoryKey(set: SetId, subcategory: string): string {
  return `${set}/${subcategory}`;
}

export function isSubcategoryKey(value: string): boolean {
  const [set, subcategory, ...rest] = value.split("/");
  return rest.length === 0 && subcategory !== undefined && isSubcategoryOf(set, subcategory);
}

export function isSetId(value: string): value is SetId {
  return Object.hasOwn(EMPTY_COUNTS, value);
}

export const SET_IDS: readonly SetId[] = Object.keys(EMPTY_COUNTS).filter(isSetId);

export function countBySet(items: readonly { set: SetId }[]): Record<SetId, number> {
  const counts = { ...EMPTY_COUNTS };
  for (const item of items) {
    counts[item.set] += 1;
  }
  return counts;
}

type Filed = { set: SetId; subcategory: string };

/** How many words sit under each (set, subcategory) pair, keyed by its id. */
export function countBySubcategory(items: readonly Filed[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = subcategoryKey(item.set, item.subcategory);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** The subcategories each set has words in, in the order the set declares them. */
export function subcategoriesBySet(items: readonly Filed[]): Record<SetId, string[]> {
  const counts = countBySubcategory(items);
  return Object.fromEntries(
    SET_IDS.map((set) => [
      set,
      (SUBCATEGORIES[set] as readonly string[]).filter(
        (subcategory) => (counts[subcategoryKey(set, subcategory)] ?? 0) > 0
      )
    ])
  ) as Record<SetId, string[]>;
}

type Tagged = { set: SetId; kanji: string[] };

/**
 * Groups the level's kanji under the sets that teach them. A kanji used by two
 * sets is shown under the first one, so the picker never draws it twice.
 */
export function kanjiBySet(items: readonly Tagged[]): Record<SetId, string[]> {
  const grouped = Object.fromEntries(SET_IDS.map((id) => [id, [] as string[]])) as Record<
    SetId,
    string[]
  >;
  const placed = new Set<string>();
  for (const id of SET_IDS) {
    for (const item of items) {
      if (item.set !== id) continue;
      for (const character of item.kanji) {
        if (placed.has(character)) continue;
        placed.add(character);
        grouped[id].push(character);
      }
    }
  }
  return grouped;
}

/** How many words of the level each kanji appears in, for the picker badges. */
export function wordsPerKanji(items: readonly Tagged[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const character of item.kanji) {
      counts[character] = (counts[character] ?? 0) + 1;
    }
  }
  return counts;
}

export type KanjiGroup<T> = {
  character: string;
  words: T[];
};

export function groupWordsByKanji<T extends { kanji: string[] }>(
  words: readonly T[],
  order: readonly string[]
): KanjiGroup<T>[] {
  const rank = new Map(order.map((character, index) => [character, index]));
  const grouped = new Map<string, T[]>();
  for (const word of words) {
    const head = word.kanji[0];
    if (head === undefined) continue;
    const found = grouped.get(head);
    if (found === undefined) grouped.set(head, [word]);
    else found.push(word);
  }
  return [...grouped]
    .sort(([a], [b]) => (rank.get(a) ?? order.length) - (rank.get(b) ?? order.length))
    .map(([character, words]) => ({ character, words }));
}

export type SubcategoryGroup<T> = {
  set: SetId;
  subcategory: string;
  words: T[];
};

/**
 * Groups words under (set, subcategory) in declared order, dropping the pairs
 * nothing landed in. What the word picker lists.
 */
export function groupWordsBySubcategory<T extends { set: SetId; subcategory: string }>(
  words: readonly T[]
): SubcategoryGroup<T>[] {
  const groups: SubcategoryGroup<T>[] = [];
  for (const set of SET_IDS) {
    for (const subcategory of SUBCATEGORIES[set] as readonly string[]) {
      const held = words.filter((word) => word.set === set && word.subcategory === subcategory);
      if (held.length > 0) groups.push({ set, subcategory, words: held });
    }
  }
  return groups;
}

export type SetGroup<T> = {
  set: SetId;
  groups: SubcategoryGroup<T>[];
};

/**
 * The same groups folded under the set that owns them, so the word picker can
 * draw one collapsed row per set instead of one card per subcategory.
 */
export function groupWordsBySet<T extends Filed>(words: readonly T[]): SetGroup<T>[] {
  const groups = groupWordsBySubcategory(words);
  return SET_IDS.flatMap((set) => {
    const held = groups.filter((group) => group.set === set);
    return held.length === 0 ? [] : [{ set, groups: held }];
  });
}

export function setsWithWords(items: readonly { set: SetId }[]): SetId[] {
  const counts = countBySet(items);
  return SET_IDS.filter((id) => counts[id] > 0);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  test("lists set ids in the order they are declared", () => {
    expect(SET_IDS[0]).toBe("numbers");
    expect(SET_IDS.at(-1)).toBe("food");
    expect(SET_IDS).toHaveLength(12);
  });

  test("rejects verbs as it was renamed to actions", () => {
    expect(isSetId("actions")).toBe(true);
    expect(isSetId("verbs")).toBe(false);
  });

  test("rejects a tag that is not a set", () => {
    expect(isSetId("numbers")).toBe(true);
    expect(isSetId("kitchen")).toBe(false);
  });

  test("counts every set, including the ones nothing landed in", () => {
    const counts = countBySet([{ set: "numbers" }, { set: "numbers" }, { set: "actions" }]);
    expect(counts.numbers).toBe(2);
    expect(counts.actions).toBe(1);
    expect(counts.body).toBe(0);
  });

  test("keeps only the sets that have words, in declared order", () => {
    expect(setsWithWords([{ set: "actions" }, { set: "numbers" }])).toEqual(["numbers", "actions"]);
  });

  test("groups each kanji under the first set that teaches it", () => {
    const grouped = kanjiBySet([
      { set: "actions", kanji: ["見", "人"] },
      { set: "people", kanji: ["人", "女"] }
    ]);
    expect(grouped.people).toEqual(["人", "女"]);
    expect(grouped.actions).toEqual(["見"]);
    expect(grouped.numbers).toEqual([]);
  });

  test("lists a subcategory under exactly one set, and never an unknown one", () => {
    expect(isSubcategoryOf("nature", "weather")).toBe(true);
    expect(isSubcategoryOf("nature", "buildings")).toBe(false);
    expect(isSubcategoryOf("kitchen", "weather")).toBe(false);
    expect(SUBCATEGORY_IDS).toContain("frequency");
  });

  describe("groupWordsBySubcategory", () => {
    const word = (id: string, set: SetId, subcategory: string) => ({ id, set, subcategory });

    test("groups in set order, then in the order the set declares them", () => {
      const grouped = groupWordsBySubcategory([
        word("雨", "nature", "weather"),
        word("一", "numbers", "digits"),
        word("山", "nature", "landscape"),
        word("一つ", "numbers", "counters")
      ]);
      expect(grouped.map((group) => group.subcategory)).toEqual([
        "digits",
        "counters",
        "landscape",
        "weather"
      ]);
      expect(grouped[0].words).toEqual([word("一", "numbers", "digits")]);
    });

    test("leaves out a pair no word landed in", () => {
      const grouped = groupWordsBySubcategory([word("山", "nature", "landscape")]);
      expect(grouped).toHaveLength(1);
    });
  });

  test("names a (set, subcategory) pair once, and rejects a pair that is not one", () => {
    expect(subcategoryKey("nature", "weather")).toBe("nature/weather");
    expect(isSubcategoryKey("nature/weather")).toBe(true);
    expect(isSubcategoryKey("nature/buildings")).toBe(false);
    expect(isSubcategoryKey("weather")).toBe(false);
    expect(isSubcategoryKey("nature/weather/extra")).toBe(false);
  });

  test("lists only the subcategories a set has words in", () => {
    const counted = subcategoriesBySet([
      { set: "nature", subcategory: "weather" },
      { set: "nature", subcategory: "landscape" },
      { set: "nature", subcategory: "weather" }
    ]);
    expect(counted.nature).toEqual(["landscape", "weather"]);
    expect(counted.numbers).toEqual([]);
    expect(countBySubcategory([{ set: "nature", subcategory: "weather" }])["nature/weather"]).toBe(1);
  });

  test("folds the subcategory groups under their set", () => {
    const folded = groupWordsBySet([
      { set: "nature", subcategory: "weather" },
      { set: "numbers", subcategory: "digits" },
      { set: "nature", subcategory: "landscape" }
    ]);
    expect(folded.map((entry) => entry.set)).toEqual(["numbers", "nature"]);
    expect(folded[1].groups.map((group) => group.subcategory)).toEqual(["landscape", "weather"]);
  });

  describe("groupWordsByKanji", () => {
    const word = (id: string, kanji: string[]) => ({ id, kanji });

    test("files a word under the first kanji it carries", () => {
      const grouped = groupWordsByKanji([word("学校", ["学", "校"])], ["学", "校"]);
      expect(grouped).toEqual([{ character: "学", words: [word("学校", ["学", "校"])] }]);
    });

    test("keeps the groups in the order the picker draws the kanji", () => {
      const grouped = groupWordsByKanji(
        [word("水", ["水"]), word("一", ["一"]), word("一つ", ["一"])],
        ["一", "水"]
      );
      expect(grouped.map((group) => group.character)).toEqual(["一", "水"]);
      expect(grouped[0].words).toHaveLength(2);
    });

    test("puts a kanji the picker does not draw last rather than losing it", () => {
      const grouped = groupWordsByKanji([word("山", ["山"]), word("水", ["水"])], ["水"]);
      expect(grouped.map((group) => group.character)).toEqual(["水", "山"]);
    });

    test("drops a word carrying no kanji of the level", () => {
      expect(groupWordsByKanji([word("とても", [])], ["水"])).toEqual([]);
    });
  });

  test("counts the words each kanji turns up in", () => {
    const counts = wordsPerKanji([
      { set: "numbers", kanji: ["一"] },
      { set: "numbers", kanji: ["一", "万"] }
    ]);
    expect(counts["一"]).toBe(2);
    expect(counts["万"]).toBe(1);
    expect(counts["水"]).toBeUndefined();
  });
}
