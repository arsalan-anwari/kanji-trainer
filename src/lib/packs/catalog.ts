import { TAXONOMY_VERSION } from "../content/sets.ts";

export const THEMES = ["base", "plus", "extra", "kana", "travel", "food", "work", "school", "culture", "media"] as const;

export type Theme = (typeof THEMES)[number];

export type PackInfo = {
  id: string;
  level: string;
  theme: Theme;
  version: string;
  title: string;
  taxonomy: number;
};

export type PackMeta = PackInfo & {
  words: number;
  kanji: number;
  description: string;
};

export type CatalogEntry = PackMeta & {
  bytes: number;
  sha256: string;
  archive: string;
};

export type InstalledPack = PackMeta & {
  sha256: string | null;
};

export type PackState = "available" | "installed" | "update";

export type Offer = {
  meta: PackMeta;
  entry: CatalogEntry | null;
  installed: InstalledPack | null;
  state: PackState;
};

const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MARKDOWN_FILE = /^[a-z0-9][a-z0-9_-]*\.md$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function isPackId(value: string): boolean {
  return PACK_ID.test(value);
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isBase(pack: Pick<PackInfo, "theme">): boolean {
  return pack.theme === "base";
}

export function isSupported(pack: Pick<PackInfo, "taxonomy">): boolean {
  return pack.taxonomy <= TAXONOMY_VERSION;
}

export function parsePackInfo(value: unknown): PackInfo | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const level = text(value.level);
  const version = text(value.version);
  const title = text(value.title);
  const taxonomy = value.taxonomy === undefined ? 1 : count(value.taxonomy);
  if (id === null || !isPackId(id) || level === null || version === null || title === null) return null;
  if (!isTheme(value.theme) || taxonomy === null || taxonomy < 1) return null;
  return { id, level, theme: value.theme, version, title, taxonomy };
}

export function parsePackMeta(value: unknown): PackMeta | null {
  const info = parsePackInfo(value);
  if (info === null || !isRecord(value)) return null;
  const words = count(value.words);
  const kanji = count(value.kanji);
  if (words === null || kanji === null) return null;
  const description =
    typeof value.description === "string" && MARKDOWN_FILE.test(value.description) ? value.description : "";
  return { ...info, words, kanji, description };
}

export function parseCatalogEntry(value: unknown): CatalogEntry | null {
  const meta = parsePackMeta(value);
  if (meta === null || !isRecord(value)) return null;
  const bytes = count(value.bytes);
  const sha256 = text(value.sha256);
  const archive = text(value.archive);
  if (bytes === null || sha256 === null || !SHA256.test(sha256)) return null;
  if (archive !== `archives/${meta.id}.tar`) return null;
  return { ...meta, bytes, sha256, archive };
}

export function parseCatalog(value: unknown): CatalogEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.packs)) return null;
  return value.packs.flatMap((entry) => {
    const parsed = parseCatalogEntry(entry);
    return parsed === null ? [] : [parsed];
  });
}

export function parseInstalled(value: unknown): InstalledPack | null {
  const meta = parsePackMeta(value);
  if (meta === null || !isRecord(value)) return null;
  const sha256 = text(value.sha256);
  return { ...meta, sha256: sha256 !== null && SHA256.test(sha256) ? sha256 : null };
}

function levelRank(level: string): number {
  const found = /(\d+)/.exec(level);
  return found === null ? 0 : Number(found[1]);
}

export function byShelf(left: PackInfo, right: PackInfo): number {
  return (
    levelRank(right.level) - levelRank(left.level) ||
    Number(isBase(right)) - Number(isBase(left)) ||
    left.title.localeCompare(right.title)
  );
}

function stateOf(entry: CatalogEntry | null, installed: InstalledPack | null): PackState {
  if (installed === null) return "available";
  if (entry === null || installed.sha256 === null || installed.sha256 === entry.sha256) return "installed";
  return "update";
}

export function offers(catalog: readonly CatalogEntry[], installed: readonly InstalledPack[]): Offer[] {
  const listed = new Map(catalog.map((entry) => [entry.id, entry]));
  const held = new Map(installed.map((pack) => [pack.id, pack]));
  const metas = new Map<string, PackMeta>([...held, ...listed]);
  return [...metas.values()]
    .map((meta) => {
      const entry = listed.get(meta.id) ?? null;
      const pack = held.get(meta.id) ?? null;
      return { meta, entry, installed: pack, state: stateOf(entry, pack) };
    })
    .sort((left, right) => byShelf(left.meta, right.meta));
}

export function missingBases(
  catalog: readonly CatalogEntry[],
  installed: readonly InstalledPack[]
): CatalogEntry[] {
  const held = new Set(installed.map((pack) => pack.id));
  return catalog.filter((entry) => isBase(entry) && !held.has(entry.id));
}

export function enabledPacks(
  installed: readonly InstalledPack[],
  disabled: readonly string[]
): string[] {
  return installed
    .filter((pack) => isSupported(pack) && (isBase(pack) || !disabled.includes(pack.id)))
    .map((pack) => pack.id);
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const hash = (digit: string) => digit.repeat(64);
  const entry = (id: string, theme: Theme = "base", level = "N5", sha = "a"): CatalogEntry => ({
    id,
    level,
    theme,
    version: "1.0.0",
    title: id,
    taxonomy: 1,
    words: 1,
    kanji: 1,
    description: "",
    bytes: 10,
    sha256: hash(sha),
    archive: `archives/${id}.tar`
  });
  const held = (from: CatalogEntry, sha: string | null = from.sha256): InstalledPack => {
    const { bytes, archive, ...meta } = from;
    expect([bytes, archive]).toHaveLength(2);
    return { ...meta, sha256: sha };
  };

  describe("reading the catalog", () => {
    test("accepts an entry the upload script wrote", () => {
      expect(parseCatalog({ packs: [entry("n5-base")] })).toEqual([entry("n5-base")]);
    });

    test("drops an entry it cannot trust and keeps the rest", () => {
      const odd = [
        { ...entry("n5-cars"), theme: "cars" },
        { ...entry("n5-bad"), sha256: "nope" },
        { ...entry("n5-far"), archive: "../../etc/passwd" },
        { ...entry("n5-base"), id: "../n5" },
        entry("n5-base")
      ];
      expect(parseCatalog({ packs: odd })?.map((pack) => pack.id)).toEqual(["n5-base"]);
    });

    test("keeps a description only as a plain markdown file inside the pack", () => {
      expect(parseCatalogEntry({ ...entry("n5-base"), description: "description.md" })?.description).toBe(
        "description.md"
      );
      for (const odd of ["../secret.md", "notes/description.md", "# JLPT N5", "description.txt"]) {
        expect(parseCatalogEntry({ ...entry("n5-base"), description: odd })?.description).toBe("");
      }
    });

    test("reads a pack written before the taxonomy was versioned as version 1", () => {
      const { taxonomy, ...rest } = entry("n5-base");
      expect(taxonomy).toBe(1);
      expect(parseCatalogEntry(rest)?.taxonomy).toBe(1);
      expect(parseCatalogEntry({ ...rest, taxonomy: 0 })).toBeNull();
    });

    test("refuses a file that is not a catalog", () => {
      expect(parseCatalog([])).toBeNull();
      expect(parseCatalog({ packs: "n5" })).toBeNull();
    });

    test("reads a pack built without an archive as installed with no hash", () => {
      const { sha256, ...rest } = held(entry("n5-base"));
      expect(sha256).toHaveLength(64);
      expect(parseInstalled(rest)?.sha256).toBeNull();
    });
  });

  describe("offering packs", () => {
    test("marks a pack installed, updatable or only listed", () => {
      const base = entry("n5-base");
      const travel = entry("n5-travel", "travel", "N5", "b");
      const food = entry("n5-food", "food");
      const states = offers([base, travel, food], [held(base), held(travel, hash("c"))]);
      expect(Object.fromEntries(states.map((offer) => [offer.meta.id, offer.state]))).toEqual({
        "n5-base": "installed",
        "n5-travel": "update",
        "n5-food": "available"
      });
    });

    test("keeps an installed pack the catalog no longer lists, and offline with no catalog", () => {
      const base = entry("n5-base");
      expect(offers([], [held(base)]).map((offer) => [offer.meta.id, offer.state])).toEqual([
        ["n5-base", "installed"]
      ]);
    });

    test("never offers an update to a pack the dev server serves", () => {
      const base = entry("n5-base");
      expect(offers([base], [held(base, null)])[0]?.state).toBe("installed");
    });

    test("shelves the first level first, its base leading", () => {
      const packs = [entry("n4-base", "base", "N4"), entry("n5-food", "food"), entry("n5-base")];
      expect(offers(packs, []).map((offer) => offer.meta.id)).toEqual(["n5-base", "n5-food", "n4-base"]);
    });
  });

  describe("the base packs", () => {
    test("names every listed base level that is not installed", () => {
      const n5 = entry("n5-base");
      const n4 = entry("n4-base", "base", "N4");
      const food = entry("n5-food", "food");
      expect(missingBases([n5, n4, food], [held(n5)]).map((pack) => pack.id)).toEqual(["n4-base"]);
    });

    test("keeps a base pack on whatever the settings say", () => {
      const packs = [held(entry("n5-base")), held(entry("n5-food", "food"))];
      expect(enabledPacks(packs, ["n5-base", "n5-food"])).toEqual(["n5-base"]);
      expect(enabledPacks(packs, [])).toEqual(["n5-base", "n5-food"]);
    });

    test("never loads a pack filed under a newer taxonomy than the app knows", () => {
      const newer = held({ ...entry("n5-plus", "plus"), taxonomy: TAXONOMY_VERSION + 1 });
      expect(isSupported(newer)).toBe(false);
      expect(enabledPacks([held(entry("n5-base")), newer], [])).toEqual(["n5-base"]);
    });
  });
}
