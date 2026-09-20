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
  irregulars: 0
};

export type SetId = keyof typeof EMPTY_COUNTS;

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

export function setsWithWords(items: readonly { set: SetId }[]): SetId[] {
  const counts = countBySet(items);
  return SET_IDS.filter((id) => counts[id] > 0);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  test("lists set ids in the order they are declared", () => {
    expect(SET_IDS[0]).toBe("numbers");
    expect(SET_IDS.at(-1)).toBe("irregulars");
    expect(SET_IDS).toHaveLength(11);
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
