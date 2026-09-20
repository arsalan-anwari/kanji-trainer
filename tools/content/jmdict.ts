export type JmdictKanji = {
  text: string;
  tags: string[];
};

export type JmdictKana = {
  text: string;
  tags: string[];
  appliesToKanji: string[];
};

export type JmdictSense = {
  misc: string[];
  appliesToKanji: string[];
  gloss: { lang: string; text: string }[];
};

export type JmdictEntry = {
  id: string;
  kanji: JmdictKanji[];
  kana: JmdictKana[];
  sense: JmdictSense[];
};

export type Jmdict = {
  version: string;
  words: JmdictEntry[];
};

export type Lookup = ReadonlyMap<string, JmdictEntry[]>;

const EXCLUDED_KANJI_TAGS = ["rK", "sK"];

// Readings a learner would be marked wrong for never having met: outdated,
// irregular, rare, and the search-only forms that are not readings at all.
const EXCLUDED_KANA_TAGS = ["ok", "ik", "rk", "sk"];

const HIRAGANA = /^[\p{Script=Hiragana}ー]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function parseEntry(value: unknown): JmdictEntry | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  const kanji = Array.isArray(value.kanji) ? value.kanji : [];
  const kana = Array.isArray(value.kana) ? value.kana : [];
  const sense = Array.isArray(value.sense) ? value.sense : [];
  return {
    id: value.id,
    kanji: kanji.filter(isRecord).map((form) => ({
      text: typeof form.text === "string" ? form.text : "",
      tags: strings(form.tags)
    })),
    kana: kana.filter(isRecord).map((form) => ({
      text: typeof form.text === "string" ? form.text : "",
      tags: strings(form.tags),
      appliesToKanji: strings(form.appliesToKanji)
    })),
    sense: sense.filter(isRecord).map((meaning) => ({
      misc: strings(meaning.misc),
      appliesToKanji: strings(meaning.appliesToKanji),
      gloss: (Array.isArray(meaning.gloss) ? meaning.gloss : [])
        .filter(isRecord)
        .map((item) => ({
          lang: typeof item.lang === "string" ? item.lang : "",
          text: typeof item.text === "string" ? item.text : ""
        }))
    }))
  };
}

export function parseJmdict(value: unknown): Jmdict {
  if (!isRecord(value) || typeof value.version !== "string" || !Array.isArray(value.words)) {
    throw new Error("jmdict: expected an object with a version and a words array");
  }
  const words: JmdictEntry[] = [];
  for (const entry of value.words) {
    const parsed = parseEntry(entry);
    if (parsed !== null) {
      words.push(parsed);
    }
  }
  if (words.length === 0) {
    throw new Error("jmdict: no usable entries");
  }
  return { version: value.version, words };
}

export function indexByWrittenForm(dictionary: Jmdict): Lookup {
  const index = new Map<string, JmdictEntry[]>();
  for (const entry of dictionary.words) {
    for (const form of entry.kanji) {
      const entries = index.get(form.text);
      if (entries === undefined) {
        index.set(form.text, [entry]);
      } else {
        entries.push(entry);
      }
    }
  }
  return index;
}

function appliesTo(scope: string[], written: string): boolean {
  return scope.includes("*") || scope.includes(written);
}

export type Match = {
  entry: JmdictEntry;
  glosses: string[];
};

export type Rejection = {
  reason: "absent" | "reading" | "rK" | "uk" | "gloss";
  detail: string;
};

export function lookupWord(
  index: Lookup,
  written: string,
  reading: string
): Match | Rejection {
  const entries = index.get(written);
  if (entries === undefined) {
    return { reason: "absent", detail: `"${written}" is not a written form in JMdict` };
  }
  const readable = entries.filter((entry) =>
    entry.kana.some((form) => form.text === reading && appliesTo(form.appliesToKanji, written))
  );
  if (readable.length === 0) {
    return {
      reason: "reading",
      detail: `JMdict has "${written}" but not with the reading "${reading}"`
    };
  }
  const entry = readable[0];
  const form = entry.kanji.find((candidate) => candidate.text === written);
  if (form !== undefined && form.tags.some((tag) => EXCLUDED_KANJI_TAGS.includes(tag))) {
    return {
      reason: "rK",
      detail: `JMdict marks "${written}" ${form.tags.join(", ")}, a form learners do not meet`
    };
  }
  const senses = entry.sense.filter((meaning) => appliesTo(meaning.appliesToKanji, written));
  if (senses.length > 0 && senses.every((meaning) => meaning.misc.includes("uk"))) {
    return {
      reason: "uk",
      detail: `JMdict marks "${written}" usually kana, so there is no form to test`
    };
  }
  const glosses = senses
    .flatMap((meaning) => meaning.gloss)
    .filter((item) => item.lang === "eng")
    .map((item) => item.text)
    .slice(0, 3);
  if (glosses.length === 0) {
    return { reason: "gloss", detail: `JMdict has no English gloss for "${written}"` };
  }
  return { entry, glosses };
}

export function isMatch(result: Match | Rejection): result is Match {
  return "entry" in result;
}

/**
 * Every reading of the written form a typed answer may give, the curated one
 * first. One word often has more than one live reading (七 なな and しち), and
 * the prompt cannot say which was wanted without giving it away.
 */
export function acceptedReadings(
  entry: JmdictEntry,
  written: string,
  primary: string
): string[] {
  const readings = [primary];
  for (const form of entry.kana) {
    if (readings.includes(form.text)) continue;
    if (!appliesTo(form.appliesToKanji, written)) continue;
    if (form.tags.some((tag) => EXCLUDED_KANA_TAGS.includes(tag))) continue;
    if (!HIRAGANA.test(form.text)) continue;
    readings.push(form.text);
  }
  return readings;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const entry = (
    kanji: [string, string[]][],
    kana: [string, string[]][],
    senses: { misc?: string[]; gloss: string[] }[]
  ): unknown => ({
    id: "1",
    kanji: kanji.map(([text, tags]) => ({ text, tags })),
    kana: kana.map(([text, tags]) => ({ text, tags, appliesToKanji: ["*"] })),
    sense: senses.map((meaning) => ({
      misc: meaning.misc ?? [],
      appliesToKanji: ["*"],
      gloss: meaning.gloss.map((text) => ({ lang: "eng", text }))
    }))
  });

  const fixture = (...words: unknown[]) =>
    indexByWrittenForm(parseJmdict({ version: "t", words }));

  describe("parseJmdict", () => {
    test("rejects a payload that is not a dictionary", () => {
      expect(() => parseJmdict({ words: [] })).toThrow(/version and a words array/);
    });

    test("rejects a dictionary whose entries are all unusable", () => {
      expect(() => parseJmdict({ version: "t", words: [null, 3] })).toThrow(/no usable entries/);
    });
  });

  describe("indexByWrittenForm", () => {
    test("indexes every written form of an entry", () => {
      const index = fixture(entry([["丸い", []], ["円い", []]], [["まるい", []]], [{ gloss: ["round"] }]));
      expect(index.has("丸い")).toBe(true);
      expect(index.has("円い")).toBe(true);
    });
  });

  describe("lookupWord", () => {
    test("returns the English glosses of a word that resolves", () => {
      const index = fixture(entry([["日本", []]], [["にほん", []]], [{ gloss: ["Japan"] }]));
      const result = lookupWord(index, "日本", "にほん");
      expect(isMatch(result) && result.glosses).toEqual(["Japan"]);
    });

    test("keeps at most three glosses of the matching senses, each its own entry", () => {
      const index = fixture(
        entry([["話", []]], [["はなし", []]], [{ gloss: ["talk", "speech", "chat", "story"] }])
      );
      const result = lookupWord(index, "話", "はなし");
      expect(isMatch(result) && result.glosses).toEqual(["talk", "speech", "chat"]);
    });

    test("names the written form when JMdict does not have it", () => {
      const index = fixture(entry([["日本", []]], [["にほん", []]], [{ gloss: ["Japan"] }]));
      expect(lookupWord(index, "日本語", "にほんご")).toEqual({
        reason: "absent",
        detail: '"日本語" is not a written form in JMdict'
      });
    });

    test("distinguishes a wrong reading from a missing word", () => {
      const index = fixture(entry([["日本", []]], [["にほん", []]], [{ gloss: ["Japan"] }]));
      const result = lookupWord(index, "日本", "にっぽん");
      expect(isMatch(result)).toBe(false);
      expect(!isMatch(result) && result.reason).toBe("reading");
    });

    test("excludes a written form JMdict marks rK", () => {
      const index = fixture(entry([["さ来年", ["rK"]]], [["さらいねん", []]], [{ gloss: ["year after next"] }]));
      const result = lookupWord(index, "さ来年", "さらいねん");
      expect(!isMatch(result) && result.reason).toBe("rK");
    });

    test("excludes a search-only written form", () => {
      const index = fixture(entry([["応援団", ["sK"]]], [["おうえんだん", []]], [{ gloss: ["cheer squad"] }]));
      const result = lookupWord(index, "応援団", "おうえんだん");
      expect(!isMatch(result) && result.reason).toBe("rK");
    });

    test("excludes a word every sense of which is usually kana", () => {
      const index = fixture(
        entry([["葉書", []]], [["はがき", []]], [{ misc: ["uk"], gloss: ["postcard"] }])
      );
      const result = lookupWord(index, "葉書", "はがき");
      expect(!isMatch(result) && result.reason).toBe("uk");
    });

    test("keeps a word only some senses of which are usually kana", () => {
      const index = fixture(
        entry([["物", []]], [["もの", []]], [{ misc: ["uk"], gloss: ["thing"] }, { gloss: ["object"] }])
      );
      expect(isMatch(lookupWord(index, "物", "もの"))).toBe(true);
    });

    test("ignores a reading that does not apply to this written form", () => {
      const index = indexByWrittenForm(
        parseJmdict({
          version: "t",
          words: [
            {
              id: "1",
              kanji: [{ text: "行った", tags: [] }],
              kana: [
                { text: "いった", tags: [], appliesToKanji: ["行った"] },
                { text: "おこなった", tags: [], appliesToKanji: ["行った"] }
              ],
              sense: [{ misc: [], appliesToKanji: ["行った"], gloss: [{ lang: "eng", text: "went" }] }]
            }
          ]
        })
      );
      expect(isMatch(lookupWord(index, "行った", "いった"))).toBe(true);
    });
  });

  describe("acceptedReadings", () => {
    const readingsOf = (written: string, primary: string, ...kana: [string, string[]][]) => {
      const index = fixture(entry([[written, []]], kana, [{ gloss: ["x"] }]));
      const result = lookupWord(index, written, primary);
      if (!isMatch(result)) throw new Error(result.detail);
      return acceptedReadings(result.entry, written, primary);
    };

    test("puts the curated reading first, whatever order JMdict holds", () => {
      expect(readingsOf("七", "なな", ["しち", []], ["なな", []])).toEqual(["なな", "しち"]);
    });

    test("leaves out a reading marked outdated or search-only", () => {
      expect(readingsOf("二十", "にじゅう", ["にじゅう", []], ["はた", ["ok"]])).toEqual([
        "にじゅう"
      ]);
    });

    test("leaves out a katakana form, which is not an answer to type", () => {
      expect(readingsOf("何", "なに", ["なに", []], ["ナニ", []])).toEqual(["なに"]);
    });
  });
}
