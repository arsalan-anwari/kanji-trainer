export type Kradfile = {
  version: string;
  kanji: ReadonlyMap<string, string[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseKradfile(value: unknown): Kradfile {
  if (!isRecord(value) || typeof value.version !== "string" || !isRecord(value.kanji)) {
    throw new Error("kradfile: expected an object with a version and a kanji map");
  }
  const kanji = new Map<string, string[]>();
  for (const [character, components] of Object.entries(value.kanji)) {
    if (!Array.isArray(components)) {
      continue;
    }
    const parts = components.filter((part) => typeof part === "string" && part !== "");
    if (parts.length > 0) {
      kanji.set(character, parts);
    }
  }
  if (kanji.size === 0) {
    throw new Error("kradfile: no usable decompositions");
  }
  return { version: value.version, kanji };
}

export function decompose(kradfile: Kradfile, character: string): string[] {
  const parts = kradfile.kanji.get(character);
  if (parts === undefined) {
    throw new Error(`KRADFILE has no decomposition for "${character}"`);
  }
  return [...new Set(parts)];
}

export function componentFrequency(
  kradfile: Kradfile,
  characters: readonly string[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const character of characters) {
    for (const part of decompose(kradfile, character)) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    }
  }
  return counts;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const fixture = parseKradfile({
    version: "t",
    kanji: { 明: ["日", "月"], 時: ["日", "土", "寸"], 三: ["一"] }
  });

  describe("parseKradfile", () => {
    test("rejects a payload that is not a decomposition table", () => {
      expect(() => parseKradfile({ version: "t" })).toThrow(/version and a kanji map/);
    });

    test("rejects a table with nothing usable in it", () => {
      expect(() => parseKradfile({ version: "t", kanji: { 明: [] } })).toThrow(
        /no usable decompositions/
      );
    });
  });

  describe("decompose", () => {
    test("returns the components of a kanji", () => {
      expect(decompose(fixture, "明")).toEqual(["日", "月"]);
    });

    test("returns a repeated component once", () => {
      const repeated = parseKradfile({ version: "t", kanji: { 林: ["木", "木"] } });
      expect(decompose(repeated, "林")).toEqual(["木"]);
    });

    test("names the kanji KRADFILE does not cover rather than returning nothing", () => {
      expect(() => decompose(fixture, "日")).toThrow(/no decomposition for "日"/);
    });
  });

  describe("componentFrequency", () => {
    test("counts how many of the given kanji each component appears in", () => {
      const counts = componentFrequency(fixture, ["明", "時", "三"]);
      expect(counts.get("日")).toBe(2);
      expect(counts.get("寸")).toBe(1);
      expect(counts.get("一")).toBe(1);
    });
  });
}
