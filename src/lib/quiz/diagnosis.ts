import { SET_IDS, SUBCATEGORIES, subcategoryKey, type SetId } from "../content/sets";
import type { Word } from "../content/types";
import type { Answer } from "./questions";
import { eligibleWords } from "./questions";
import type { Report } from "./report";
import { CATEGORIES, DEFAULT_SETTINGS, DIRECTIONS_BY_CATEGORY, type RunSettings } from "./settings";
import {
  masteryOf,
  strength,
  type AreaSparkGroup,
  type AreaSparkSeries,
  type MissSection,
  type StatRow,
  type TreeTableGroup,
  type TreeTableRow
} from "kaizen-ui";

export const TIME_BASELINE_RUNS = 20;

function wordMap(words: readonly Word[]): Map<string, Word> {
  return new Map(words.map((word) => [word.id, word]));
}

type Bucket = { total: number; correct: number };

function bump(map: Map<string, Bucket>, key: string, correct: boolean): void {
  const bucket = map.get(key) ?? { total: 0, correct: 0 };
  bucket.total += 1;
  if (correct) bucket.correct += 1;
  map.set(key, bucket);
}

function toStatRows(buckets: Map<string, Bucket>): StatRow[] {
  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: key,
      sub: "",
      total: bucket.total,
      correct: bucket.correct,
      accuracy: bucket.correct / bucket.total,
      strength: strength(bucket.correct, bucket.total),
      mastery: masteryOf(bucket.correct, bucket.total)
    }))
    .sort((a, b) => a.strength - b.strength || b.total - a.total);
}

export function statsByKanji(answers: readonly Answer[], words: readonly Word[]): StatRow[] {
  const byId = wordMap(words);
  const buckets = new Map<string, Bucket>();
  for (const answer of answers) {
    const word = byId.get(answer.wordId);
    if (word === undefined) continue;
    for (const character of word.kanji) bump(buckets, character, answer.correct);
  }
  return toStatRows(buckets);
}

export function statsBySet(answers: readonly Answer[], words: readonly Word[]): StatRow[] {
  const byId = wordMap(words);
  const buckets = new Map<string, Bucket>();
  for (const answer of answers) {
    const word = byId.get(answer.wordId);
    if (word === undefined) continue;
    bump(buckets, word.set, answer.correct);
  }
  return toStatRows(buckets);
}

export function formatTree(reports: readonly Report[]): TreeTableGroup[] {
  const perFormat = new Map<string, Bucket>();
  for (const report of reports) {
    for (const answer of report.answers) bump(perFormat, report.settings.format, answer.correct);
  }
  return CATEGORIES.flatMap((category) => {
    const children: TreeTableRow[] = DIRECTIONS_BY_CATEGORY[category].flatMap((format) => {
      const bucket = perFormat.get(format);
      return bucket === undefined
        ? []
        : [{ key: format, label: format, total: bucket.total, correct: bucket.correct }];
    });
    if (children.length === 0) return [];
    return [
      {
        key: category,
        label: category,
        total: children.reduce((sum, child) => sum + child.total, 0),
        correct: children.reduce((sum, child) => sum + child.correct, 0),
        children
      }
    ];
  });
}

export function missesBySetAndWord(
  reports: readonly Report[],
  words: readonly Word[]
): MissSection[] {
  const byId = wordMap(words);
  const spellings = new Map<string, number>();
  for (const word of words) spellings.set(word.written, (spellings.get(word.written) ?? 0) + 1);
  // 一日 is both いちにち and ついたち, so a shared spelling carries its reading.
  const labelOf = (word: Word) =>
    (spellings.get(word.written) ?? 0) > 1 ? `${word.written} (${word.reading})` : word.written;
  const bySet = new Map<SetId, Map<string, number>>();
  for (const report of reports) {
    for (const answer of report.answers) {
      if (answer.correct) continue;
      const word = byId.get(answer.wordId);
      if (word === undefined) continue;
      const tally = bySet.get(word.set) ?? new Map<string, number>();
      tally.set(word.id, (tally.get(word.id) ?? 0) + 1);
      bySet.set(word.set, tally);
    }
  }
  return SET_IDS.flatMap((set) => {
    const tally = bySet.get(set);
    if (tally === undefined) return [];
    const tiles = [...tally.entries()]
      .map(([wordId, count]) => {
        const word = byId.get(wordId);
        return { key: wordId, label: word === undefined ? wordId : labelOf(word), count };
      })
      .sort((a, b) => b.count - a.count);
    return [{ key: set, label: set, total: tiles.reduce((sum, tile) => sum + tile.count, 0), tiles }];
  });
}

function averageElapsed(reports: readonly Report[]): number {
  const answers = reports.flatMap((report) => report.answers);
  if (answers.length === 0) return 0;
  return Math.round(answers.reduce((sum, answer) => sum + answer.elapsedMs, 0) / answers.length);
}

export function timeSeriesByFormat(
  history: readonly Report[],
  windowRuns = TIME_BASELINE_RUNS
): AreaSparkGroup[] {
  return CATEGORIES.flatMap((category) => {
    const series: AreaSparkSeries[] = DIRECTIONS_BY_CATEGORY[category].flatMap((format) => {
      const runs = history
        .filter((report) => report.settings.format === format)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-windowRuns);
      if (runs.length === 0) return [];
      const points = runs.map((report) => averageElapsed([report]));
      return [
        {
          key: format,
          label: format,
          average: Math.round(points.reduce((sum, value) => sum + value, 0) / points.length),
          points
        }
      ];
    });
    return series.length === 0 ? [] : [{ key: category, label: category, series }];
  });
}

export function settingsFromMistakes(
  reports: readonly Report[],
  words: readonly Word[]
): Partial<RunSettings> {
  const missedIds = new Set<string>();
  for (const report of reports) {
    for (const answer of report.answers) {
      if (!answer.correct) missedIds.add(answer.wordId);
    }
  }
  const missedWords = words.filter((word) => missedIds.has(word.id));
  if (missedWords.length === 0) return {};

  const level = missedWords[0]!.level;
  const sets = [...new Set(missedWords.map((word) => word.set))];
  const subcategories = [
    ...new Set(missedWords.map((word) => subcategoryKey(word.set, word.subcategory)))
  ];
  const pool = eligibleWords(
    { ...DEFAULT_SETTINGS, level, sets, subcategories, excludedWords: [] },
    words
  );
  const excludedWords = pool.filter((word) => !missedIds.has(word.id)).map((word) => word.id);

  return { level, sets, subcategories, excludedWords };
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function word(id: string, kanji: string[], set: Word["set"] = "numbers"): Word {
    return {
      id,
      written: id,
      reading: `${id}reading`,
      readings: [`${id}reading`],
      glosses: [id],
      meaning: id,
      clue: "",
      kanji,
      shape: kanji.length === 1 ? "1-kanji" : "2-kanji",
      hasAudio: true,
      set,
      subcategory: SUBCATEGORIES[set][0],
      level: "N5",
      pack: "n5-base",
      file: id
    };
  }

  function answer(wordId: string, correct: boolean, given: string, elapsedMs = 1000): Answer {
    return { wordId, correct, elapsedMs, given, timedOut: false };
  }

  function report(
    createdAt: string,
    format: Report["settings"]["format"],
    answers: Answer[],
    id = createdAt
  ): Report {
    return {
      id,
      createdAt,
      durationMs: answers.length * 1000,
      settings: { ...DEFAULT_SETTINGS, sets: ["numbers"], format },
      answers,
      packs: ["n5-base"]
    };
  }

  const school = word("学校", ["学", "校"], "places");
  const one = word("一", ["一"]);
  const oneTsu = word("一つ", ["一"]);

  describe("aggregating by kanji", () => {
    test("counts a compound word toward every kanji it carries", () => {
      const rows = statsByKanji(
        [answer("学校", true, "がっこう"), answer("学校", false, "がこ")],
        [school]
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.total === 2 && row.correct === 1)).toBe(true);
    });

    test("sorts the weakest kanji first, ties broken by more attempts", () => {
      const rows = statsByKanji(
        [
          answer("一", true, "いち"),
          answer("一", true, "いち"),
          answer("学校", false, "がこ")
        ],
        [one, school]
      );
      expect(rows.map((row) => row.key)).toEqual(["学", "校", "一"]);
    });

    test("ignores an answer for a word not in the given list", () => {
      expect(statsByKanji([answer("missing", true, "x")], [one])).toEqual([]);
    });
  });

  describe("aggregating by set", () => {
    test("groups words under the set they belong to", () => {
      const rows = statsBySet(
        [answer("一", true, "いち"), answer("学校", false, "がこ")],
        [one, school]
      );
      expect(rows.map((row) => row.key).sort()).toEqual(["numbers", "places"]);
    });
  });

  describe("the format tree", () => {
    test("nests each format under its category, with an aggregated total on the parent", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち")]),
        report("2026-09-19T11:00:00.000Z", "kana-kanji", [answer("一", false, "二")])
      ];
      const tree = formatTree(reports);
      const reading = tree.find((group) => group.key === "reading");
      expect(reading?.total).toBe(2);
      expect(reading?.correct).toBe(1);
      expect(reading?.children.map((child) => child.key).sort()).toEqual([
        "kana-kanji",
        "kanji-kana"
      ]);
    });

    test("leaves out a category nothing was asked in", () => {
      const reports = [report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち")])];
      expect(formatTree(reports).map((group) => group.key)).toEqual(["reading"]);
    });
  });

  describe("misses grouped by set and word", () => {
    test("tallies every wrong answer for a word, under the set it belongs to", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [
          answer("一", false, "に"),
          answer("一", false, "さん"),
          answer("学校", false, "がこ")
        ])
      ];
      const sections = missesBySetAndWord(reports, [one, school]);
      const numbers = sections.find((section) => section.key === "numbers");
      const places = sections.find((section) => section.key === "places");
      expect(numbers?.total).toBe(2);
      expect(numbers?.tiles).toEqual([{ key: "一", label: "一", count: 2 }]);
      expect(places?.tiles).toEqual([{ key: "学校", label: "学校", count: 1 }]);
    });

    test("names the reading when two words share one spelling", () => {
      const oneDay = { ...word("一日|いちにち", ["一", "日"]), written: "一日", reading: "いちにち" };
      const first = { ...word("一日|ついたち", ["一", "日"]), written: "一日", reading: "ついたち" };
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer(first.id, false, "いちにち")])
      ];
      const [section] = missesBySetAndWord(reports, [oneDay, first, one]);
      expect(section.tiles).toEqual([{ key: first.id, label: "一日 (ついたち)", count: 1 }]);
    });

    test("keeps two different words with the same kanji apart", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [
          answer("一", false, "に"),
          answer("一つ", false, "ふたつ")
        ])
      ];
      const numbers = missesBySetAndWord(reports, [one, oneTsu]).find(
        (section) => section.key === "numbers"
      );
      expect(numbers?.tiles.map((tile) => tile.key).sort()).toEqual(["一", "一つ"]);
    });

    test("leaves out a set with no mistakes", () => {
      const reports = [report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち")])];
      expect(missesBySetAndWord(reports, [one])).toEqual([]);
    });
  });

  describe("time series by format", () => {
    test("orders points oldest to newest and averages per run", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち", 800)]),
        report("2026-09-17T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち", 1200)])
      ];
      const groups = timeSeriesByFormat(reports);
      const series = groups.find((group) => group.key === "reading")?.series[0];
      expect(series?.points).toEqual([1200, 800]);
      expect(series?.average).toBe(1000);
    });

    test("keeps only the most recent runs of the window", () => {
      const reports = Array.from({ length: 3 }, (_, index) =>
        report(`2026-09-1${index}T10:00:00.000Z`, "kanji-kana", [
          answer("一", true, "いち", (index + 1) * 100)
        ])
      );
      const groups = timeSeriesByFormat(reports, 2);
      const series = groups.find((group) => group.key === "reading")?.series[0];
      expect(series?.points).toEqual([200, 300]);
    });

    test("leaves out a format nothing was run in", () => {
      expect(timeSeriesByFormat([])).toEqual([]);
    });
  });

  describe("building a run from what was missed", () => {
    test("holds back a word sharing the same set and kanji that was not missed", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [
          answer("一", false, "に"),
          answer("一つ", true, "ひとつ")
        ])
      ];
      const patch = settingsFromMistakes(reports, [one, oneTsu]);
      expect(patch).toEqual({
        level: "N5",
        sets: ["numbers"],
        subcategories: ["numbers/digits"],
        excludedWords: ["一つ"]
      });
    });

    test("unions the sets and subcategories of every missed word", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [
          answer("一", false, "に"),
          answer("学校", false, "がこ")
        ])
      ];
      const patch = settingsFromMistakes(reports, [one, school]);
      expect(patch.sets?.slice().sort()).toEqual(["numbers", "places"]);
      expect(patch.subcategories?.slice().sort()).toEqual(["numbers/digits", "places/buildings"]);
    });

    test("returns an empty patch when nothing was missed", () => {
      const reports = [
        report("2026-09-19T10:00:00.000Z", "kanji-kana", [answer("一", true, "いち")])
      ];
      expect(settingsFromMistakes(reports, [one])).toEqual({});
    });
  });
}
