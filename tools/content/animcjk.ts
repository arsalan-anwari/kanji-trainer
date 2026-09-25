export type Piece = { element: string; strokes: number };

export type Animcjk = ReadonlyMap<string, string>;

type Tree = { element: string | null; strokes: number; overlaid: boolean; parts: Tree[] };

const OPERATORS: Record<string, number> = {
  "⿰": 2,
  "⿱": 2,
  "⿲": 3,
  "⿳": 3,
  "⿴": 2,
  "⿵": 2,
  "⿶": 2,
  "⿷": 2,
  "⿸": 2,
  "⿹": 2,
  "⿺": 2,
  "⿻": 2
};

const LAST_PIECE = 0x2a6ff;

export function parseAnimcjk(text: string): Animcjk {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const entry: unknown = JSON.parse(line);
    if (typeof entry !== "object" || entry === null) continue;
    const { character, acjk } = entry as { character?: unknown; acjk?: unknown };
    if (typeof character === "string" && typeof acjk === "string") entries.set(character, acjk);
  }
  if (entries.size === 0) throw new Error("animcjk: no entries in the dictionary");
  return entries;
}

function parseTree(acjk: string): Tree | null {
  const glyphs = [...acjk];
  let at = 0;

  function count(): number | null {
    let digits = "";
    while (at < glyphs.length && /[0-9]/.test(glyphs[at])) digits += glyphs[at++];
    return digits === "" ? null : Number(digits);
  }

  function operand(): Tree | null {
    const glyph = glyphs[at++];
    if (glyph === undefined) return null;
    const arity = OPERATORS[glyph];
    if (arity !== undefined) {
      const parts: Tree[] = [];
      for (let index = 0; index < arity; index += 1) {
        const part = operand();
        if (part === null) return null;
        parts.push(part);
      }
      const strokes = parts.reduce((sum, part) => sum + part.strokes, 0);
      return { element: null, strokes, overlaid: glyph === "⿻", parts };
    }
    if (glyphs[at] === ".") at += 1;
    if (glyphs[at] === ":") return null;
    const strokes = count();
    if (strokes !== null) return { element: glyph, strokes, overlaid: false, parts: [] };
    if (OPERATORS[glyphs[at]] === undefined) return null;
    const inner = operand();
    return inner === null ? null : { ...inner, element: glyph };
  }

  const tree = operand();
  return tree !== null && at === glyphs.length ? tree : null;
}

function isPiece(element: string | null): element is string {
  return element !== null && /^\p{Script=Han}$/u.test(element) && (element.codePointAt(0) ?? 0) <= LAST_PIECE;
}

function splittable(tree: Tree): boolean {
  return tree.parts.length > 0 && !tree.overlaid;
}

function piecesUnder(tree: Tree): Tree[] | null {
  const pieces: Tree[] = [];
  for (const part of tree.parts) {
    if (isPiece(part.element)) {
      pieces.push(part);
      continue;
    }
    if (!splittable(part)) return null;
    const inner = piecesUnder(part);
    if (inner === null) return null;
    pieces.push(...inner);
  }
  return pieces;
}

export function cutOf(acjk: string, most: number): Piece[] | null {
  const tree = parseTree(acjk);
  if (tree === null || tree.parts.length === 0) return null;
  let pieces = piecesUnder(tree);
  if (pieces === null) return null;
  for (let at = 0; at < pieces.length; at += 1) {
    const inner: Tree[] | null = splittable(pieces[at]) ? piecesUnder(pieces[at]) : null;
    if (inner === null || pieces.length - 1 + inner.length > most) continue;
    pieces = [...pieces.slice(0, at), ...inner, ...pieces.slice(at + 1)];
    at -= 1;
  }
  return pieces.map((piece) => ({ element: piece.element ?? "", strokes: piece.strokes }));
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  describe("cutOf", () => {
    test("reads each piece and how many strokes it takes, in stroke order", () => {
      expect(cutOf("前⿱䒑3刖⿰月4刂.2", 4)).toEqual([
        { element: "䒑", strokes: 3 },
        { element: "月", strokes: 4 },
        { element: "刂", strokes: 2 }
      ]);
    });

    test("splits no further than the most pieces a kanji may have", () => {
      expect(cutOf("前⿱䒑3刖⿰月4刂.2", 2)?.map((piece) => piece.element)).toEqual(["䒑", "刖"]);
    });

    test("looks through an unnamed group, so 南 is 十, 冂 and 𢆉", () => {
      expect(cutOf("南⿱十.2⿵冂2𢆉5", 4)?.map((piece) => piece.element)).toEqual(["十", "冂", "𢆉"]);
    });

    test("looks through a piece no font names, so 旅 is 方, 𠂉 and 𧘇", () => {
      expect(cutOf("旅⿸𭤨⿰方.4𠂉2𧘇4", 4)).toEqual([
        { element: "方", strokes: 4 },
        { element: "𠂉", strokes: 2 },
        { element: "𧘇", strokes: 4 }
      ]);
    });

    test("keeps a kanji whole when a piece is a lone stroke", () => {
      expect(cutOf("今⿱亼⿱𠆢.2一1㇇1", 4)).toBeNull();
    });

    test("keeps a kanji whole when its pieces share strokes out of order", () => {
      expect(cutOf("西.⿻兀:1口:2兀:2口:1", 4)).toBeNull();
    });

    test("never splits a piece that is laid over another", () => {
      expect(cutOf("半⿻丷2𰀁⿻一1十.2", 4)).toBeNull();
      expect(cutOf("来⿻一1米⿻丷2木.4", 4)?.map((piece) => piece.element)).toEqual(["一", "米"]);
      expect(cutOf("本⿻木.4一1", 4)).toEqual([
        { element: "木", strokes: 4 },
        { element: "一", strokes: 1 }
      ]);
    });

    test("gives nothing for a kanji that is not built from pieces", () => {
      expect(cutOf("手.4", 4)).toBeNull();
    });
  });

  describe("parseAnimcjk", () => {
    test("keys each line's decomposition by its character", () => {
      const text = '{"character":"白","acjk":"白.⿱丿1日4"}\n{"character":"手","acjk":"手.4"}\n';
      expect(parseAnimcjk(text).get("白")).toBe("白.⿱丿1日4");
    });
  });
}
