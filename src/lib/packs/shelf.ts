import { isBase, THEMES, type Offer, type Theme } from "./catalog";

export type ShelfFilter = { theme: Theme | null; level: string | null };

export type Section = { id: "updates" | "installed" | "available"; offers: Offer[] };

export type Tone = "brand" | "seal" | "gold" | "success";

const LEVEL_GLYPHS: Record<string, string> = { N5: "五", N4: "四", N3: "三", N2: "二", N1: "一" };

const THEME_LOOK: Record<Theme, { glyph: string; tone: Tone }> = {
  base: { glyph: "字", tone: "brand" },
  plus: { glyph: "手", tone: "success" },
  extra: { glyph: "猫", tone: "seal" },
  kana: { glyph: "あ", tone: "gold" },
  travel: { glyph: "旅", tone: "success" },
  food: { glyph: "食", tone: "seal" },
  work: { glyph: "働", tone: "gold" },
  school: { glyph: "学", tone: "brand" },
  culture: { glyph: "文", tone: "seal" },
  media: { glyph: "画", tone: "gold" }
};

export function lookOf(offer: Offer): { glyph: string; tone: Tone } {
  const look = THEME_LOOK[offer.meta.theme];
  if (!isBase(offer.meta)) return look;
  return { ...look, glyph: LEVEL_GLYPHS[offer.meta.level.toUpperCase()] ?? look.glyph };
}

export function themesOffered(offers: readonly Offer[]): { theme: Theme; count: number }[] {
  return THEMES.map((theme) => ({
    theme,
    count: offers.filter((offer) => offer.meta.theme === theme).length
  })).filter((entry) => entry.count > 0);
}

export function levelsOffered(offers: readonly Offer[]): string[] {
  return [...new Set(offers.map((offer) => offer.meta.level))];
}

export function filterOffers(offers: readonly Offer[], filter: ShelfFilter): Offer[] {
  return offers.filter(
    (offer) =>
      (filter.theme === null || offer.meta.theme === filter.theme) &&
      (filter.level === null || offer.meta.level === filter.level)
  );
}

export function shelve(offers: readonly Offer[]): Section[] {
  const sections: Section[] = [
    { id: "updates", offers: offers.filter((offer) => offer.state === "update") },
    { id: "installed", offers: offers.filter((offer) => offer.state === "installed") },
    { id: "available", offers: offers.filter((offer) => offer.state === "available") }
  ];
  return sections.filter((section) => section.offers.length > 0);
}

export function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0);
}

export function share(done: number, total: number): number {
  return total <= 0 ? 0 : Math.min(1, done / total);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const offer = (id: string, theme: Theme, level: string, state: Offer["state"]): Offer => ({
    meta: { id, level, theme, version: "1", title: id, taxonomy: 1, words: 1, kanji: 1, description: "" },
    entry: null,
    installed: null,
    state
  });
  const shelf = [
    offer("n5-base", "base", "N5", "installed"),
    offer("n5-food", "food", "N5", "update"),
    offer("n4-base", "base", "N4", "available"),
    offer("n4-travel", "travel", "N4", "available")
  ];

  describe("laying out the marketplace", () => {
    test("puts updates first, then what is installed, then what is new", () => {
      expect(shelve(shelf).map((section) => [section.id, section.offers.map((entry) => entry.meta.id)])).toEqual([
        ["updates", ["n5-food"]],
        ["installed", ["n5-base"]],
        ["available", ["n4-base", "n4-travel"]]
      ]);
    });

    test("leaves out a section with nothing in it", () => {
      expect(shelve([shelf[0]]).map((section) => section.id)).toEqual(["installed"]);
    });

    test("narrows by theme and level together", () => {
      expect(filterOffers(shelf, { theme: "base", level: "N4" }).map((entry) => entry.meta.id)).toEqual(["n4-base"]);
      expect(filterOffers(shelf, { theme: null, level: null })).toHaveLength(4);
    });

    test("offers only the themes and levels the shelf holds, counted", () => {
      expect(themesOffered(shelf)).toEqual([
        { theme: "base", count: 2 },
        { theme: "travel", count: 1 },
        { theme: "food", count: 1 }
      ]);
      expect(levelsOffered(shelf)).toEqual(["N5", "N4"]);
    });

    test("draws a base pack with its level's numeral and an expansion with its theme", () => {
      expect(lookOf(shelf[0]).glyph).toBe("五");
      expect(lookOf(shelf[1])).toEqual({ glyph: "食", tone: "seal" });
    });
  });

  describe("sizes and progress", () => {
    test("shows megabytes with one decimal below ten", () => {
      expect(megabytes(9_297_920)).toBe("9.3");
      expect(megabytes(42_000_000)).toBe("42");
    });

    test("never reports progress past the whole or before the size is known", () => {
      expect(share(5, 10)).toBe(0.5);
      expect(share(12, 10)).toBe(1);
      expect(share(3, 0)).toBe(0);
    });
  });
}
