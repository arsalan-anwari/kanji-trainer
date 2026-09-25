import type { Kanji, Part, Rect, Word } from "../content/types";
import type { Difficulty } from "./settings";
import { shuffle } from "./shuffle.ts";

export type Shape = { parts: Part[]; related: string[] };
export type Shapes = ReadonlyMap<string, Shape>;

export type Block = {
  id: number;
  element: string;
  face: string;
  rect: Rect;
  strokes: string[];
};

export type Slot = {
  tray: number;
  element: string;
  rect: Rect;
};

export type Tray = {
  character: string;
  kana: boolean;
  slots: number[];
};

export type Puzzle = {
  trays: Tray[];
  slots: Slot[];
  blocks: Block[];
  hints: number[];
};

export type Board = readonly (number | null)[];

const WHOLE: Rect = [0, 0, 4, 4];
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u;

export function isKana(character: string): boolean {
  return KANA.test(character);
}

export function shapesOf(parts: Readonly<Record<string, Part[]>>, kanji: readonly Kanji[]): Shapes {
  const components = new Map(kanji.map((entry) => [entry.character, entry.components]));
  return new Map(
    Object.entries(parts).map(([character, cut]) => [
      character,
      {
        parts: cut,
        related: [...new Set([...cut.map((part) => part.element), ...(components.get(character) ?? [])])]
      }
    ])
  );
}

export function canAssemble(word: Word, shapes: Shapes): boolean {
  return [...word.written].every((character) => isKana(character) || shapes.has(character));
}

const SMALL = "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ";
const LARGE = "あいうえおつやゆよわアイウエオツヤユヨワ";
const LOOK_ALIKE_KANA = ["ぬめ", "われね", "るろ", "さちき", "はほ", "いり", "こに", "シツ", "ソン", "クケ", "ユコ", "ウワ", "むすお"];

function voicings(kana: string): string[] {
  const base = kana.normalize("NFD").replace(/[\u3099\u309A]/g, "");
  return [base, `${base}\u3099`, `${base}\u309A`]
    .map((form) => form.normalize("NFC"))
    .filter((form) => [...form].length === 1);
}

export function kanaLookAlikes(kana: string): string[] {
  const small = SMALL.indexOf(kana);
  const large = LARGE.indexOf(kana);
  const sized = small >= 0 ? [LARGE[small]] : large >= 0 ? [SMALL[large]] : [];
  const shaped = LOOK_ALIKE_KANA.filter((group) => group.includes(kana)).flatMap((group) => [...group]);
  return [...new Set([...voicings(kana), ...sized, ...shaped])].filter((form) => form !== kana);
}

function sameRect(left: Rect, right: Rect): boolean {
  return left.every((cell, index) => cell === right[index]);
}

function kanjiLookAlike(own: Shape, taken: ReadonlySet<string>, shapes: Shapes, rng: () => number): Part | null {
  const candidates = new Map<string, Part>();
  for (const other of shapes.values()) {
    if (other === own || !other.related.some((element) => own.related.includes(element))) continue;
    for (const part of other.parts) {
      if (taken.has(part.element) || candidates.has(part.element)) continue;
      if (own.parts.some((mine) => sameRect(mine.rect, part.rect))) candidates.set(part.element, part);
    }
  }
  const pool = shuffle([...candidates.values()], rng);
  return pool[0] ?? null;
}

function kanaBlock(kana: string): Omit<Block, "id"> {
  return { element: kana, face: kana, rect: WHOLE, strokes: [] };
}

function partBlock(part: Part, difficulty: Difficulty): Omit<Block, "id"> {
  const full = difficulty !== "beginner" && part.original !== undefined;
  return {
    element: part.element,
    face: full ? (part.original ?? part.element) : part.element,
    rect: part.rect,
    strokes: full ? [] : part.strokes
  };
}

export function hintCount(slots: number, difficulty: Difficulty): number {
  return difficulty === "beginner" ? Math.ceil(slots / 2) : 0;
}

export function buildPuzzle(
  word: Word,
  shapes: Shapes,
  difficulty: Difficulty,
  rng: () => number
): Puzzle | null {
  if (!canAssemble(word, shapes)) return null;
  const characters = [...word.written];
  const needed = new Set(
    characters.flatMap((character) => shapes.get(character)?.parts.map((part) => part.element) ?? [character])
  );
  const trays: Tray[] = [];
  const slots: Slot[] = [];
  const pieces: Omit<Block, "id">[] = [];
  const expert = difficulty === "expert";

  characters.forEach((character, tray) => {
    const entry = shapes.get(character);
    const parts: Part[] = entry?.parts ?? [{ element: character, rect: WHOLE, strokes: [] }];
    trays.push({ character, kana: entry === undefined, slots: parts.map((_, at) => slots.length + at) });
    for (const part of parts) {
      slots.push({ tray, element: part.element, rect: part.rect });
      pieces.push(entry === undefined ? kanaBlock(character) : partBlock(part, difficulty));
    }
    if (!expert) return;
    if (entry === undefined) {
      const spare = shuffle(kanaLookAlikes(character).filter((kana) => !needed.has(kana)), rng)[0];
      if (spare !== undefined) pieces.push(kanaBlock(spare));
      return;
    }
    const spare = kanjiLookAlike(entry, needed, shapes, rng);
    if (spare !== null) pieces.push(partBlock(spare, difficulty));
  });

  const blocks = shuffle(pieces, rng).map((piece, id) => ({ ...piece, id }));
  const hints = shuffle(
    slots.map((_, index) => index),
    rng
  )
    .slice(0, hintCount(slots.length, difficulty))
    .sort((a, b) => a - b);
  return { trays, slots, blocks, hints };
}

export function emptyBoard(puzzle: Puzzle): Board {
  return puzzle.slots.map(() => null);
}

export function place(board: Board, slot: number, block: number): Board {
  return board.map((held, index) => (index === slot ? block : held === block ? null : held));
}

export function lift(board: Board, slot: number): Board {
  return board.map((held, index) => (index === slot ? null : held));
}

export function loose(puzzle: Puzzle, board: Board): Block[] {
  return puzzle.blocks.filter((block) => !board.includes(block.id));
}

export function isFull(board: Board): boolean {
  return board.every((held) => held !== null);
}

function elementAt(puzzle: Puzzle, board: Board, slot: number): string | null {
  const held = board[slot];
  return held === null ? null : (puzzle.blocks[held]?.element ?? null);
}

function slotRight(puzzle: Puzzle, board: Board, slot: number): boolean {
  return elementAt(puzzle, board, slot) === puzzle.slots[slot].element;
}

export function trayDone(puzzle: Puzzle, board: Board, tray: number): boolean {
  return puzzle.trays[tray].slots.every((slot) => slotRight(puzzle, board, slot));
}

export function judge(puzzle: Puzzle, board: Board): boolean {
  return puzzle.slots.every((_, slot) => slotRight(puzzle, board, slot));
}

export type Position =
  | "whole"
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export function positionOf([x, y, w, h]: Rect): Position {
  if (w === 4 && h === 4) return "whole";
  const across = 2 * x + w;
  const down = 2 * y + h;
  const horizontal = across < 4 ? "left" : across > 4 ? "right" : null;
  const vertical = down < 4 ? "top" : down > 4 ? "bottom" : null;
  if (horizontal !== null && vertical !== null) return `${vertical}-${horizontal}`;
  return horizontal ?? vertical ?? "center";
}

export type Box = [left: number, top: number, right: number, bottom: number];

const ARGUMENTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, z: 0 };

export function pathBox(d: string): Box {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  let y = 0;
  let command = "M";
  let at = 0;
  while (at < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[at])) {
      command = tokens[at];
      at += 1;
      if (command.toLowerCase() === "z") continue;
    }
    const lower = command.toLowerCase();
    const count = ARGUMENTS[lower] ?? 2;
    const values = tokens.slice(at, at + count).map(Number);
    at += count;
    const relative = command === lower;
    const base: [number, number] = relative ? [x, y] : [0, 0];
    if (lower === "h") x = values[0] + (relative ? x : 0);
    else if (lower === "v") y = values[0] + (relative ? y : 0);
    else {
      for (let pair = 0; pair < values.length; pair += 2) {
        xs.push(values[pair] + base[0]);
        ys.push(values[pair + 1] + base[1]);
      }
      x = values[values.length - 2] + base[0];
      y = values[values.length - 1] + base[1];
    }
    xs.push(x);
    ys.push(y);
    if (lower === "m") command = relative ? "l" : "L";
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function boxOf(strokes: readonly string[]): Box {
  const boxes = strokes.map(pathBox);
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3]))
  ];
}

const STROKE_MARGIN = 6;
const QUARTER = 109 / 4;

export function viewBoxOf(strokes: readonly string[], [, , cols, rows]: Rect): string {
  const [left, top, right, bottom] = boxOf(strokes);
  const width = Math.max(right - left + 2 * STROKE_MARGIN, cols * QUARTER);
  const height = Math.max(bottom - top + 2 * STROKE_MARGIN, rows * QUARTER);
  return [(left + right - width) / 2, (top + bottom - height) / 2, width, height].join(" ");
}

export function nextEmpty(board: Board, from: number): number {
  for (let step = 1; step <= board.length; step += 1) {
    const slot = (from + step) % board.length;
    if (board[slot] === null) return slot;
  }
  return from;
}

export function givenOf(puzzle: Puzzle, board: Board): string {
  return puzzle.trays
    .map((tray, index) =>
      trayDone(puzzle, board, index)
        ? tray.character
        : tray.slots.map((slot) => elementAt(puzzle, board, slot) ?? "").join("")
    )
    .join("");
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const part = (element: string, rect: Rect, original?: string): Part => ({
    element,
    ...(original === undefined ? {} : { original }),
    rect,
    strokes: [`M${element.codePointAt(0)},0`]
  });
  const kanjiOf = (character: string, components: string[]): Kanji => ({
    character,
    level: "N5",
    look: "",
    components,
    on: [],
    kun: []
  });
  const LEFT: Rect = [0, 0, 2, 4];
  const RIGHT: Rect = [2, 0, 2, 4];
  const index = shapesOf(
    {
      休: [part("亻", LEFT, "人"), part("木", RIGHT)],
      体: [part("亻", LEFT, "人"), part("本", RIGHT)],
      林: [part("木", LEFT), part("木", RIGHT)],
      日: [part("日", WHOLE)],
      白: [part("白", WHOLE)]
    },
    [kanjiOf("日", ["日"]), kanjiOf("白", ["日", "白"])]
  );
  const word = (written: string): Word => ({
    id: `${written}|x`,
    written,
    reading: "x",
    readings: ["x"],
    glosses: ["x"],
    meaning: "x",
    clue: "",
    kanji: [],
    kanjiCount: 1,
    hasOkurigana: false,
    hasAudio: false,
    set: "actions",
    subcategory: "daily",
    level: "N5",
    pack: "n5-base",
    file: "x"
  });
  const solve = (puzzle: Puzzle): Board =>
    puzzle.slots.reduce<Board>((board, slot, at) => {
      const block = puzzle.blocks.find(
        (candidate) => candidate.element === slot.element && !board.includes(candidate.id)
      );
      return block === undefined ? board : place(board, at, block.id);
    }, emptyBoard(puzzle));

  describe("which words can be assembled", () => {
    test("takes a word of cut kanji and kana", () => {
      expect(canAssemble(word("休む"), index)).toBe(true);
    });

    test("skips a word whose kanji came from a pack built before parts", () => {
      expect(canAssemble(word("菓子"), index)).toBe(false);
    });

    test("relates two kanji through a shared piece or a shared KRADFILE component", () => {
      expect(index.get("休")?.related).toEqual(["亻", "木"]);
      expect(index.get("白")?.related).toEqual(["白", "日"]);
    });
  });

  describe("beginner", () => {
    const puzzle = buildPuzzle(word("休む"), index, "beginner", seeded(1));

    test("gives one slot per part and one per kana, grouped by character", () => {
      expect(puzzle?.trays.map((tray) => [tray.character, tray.slots])).toEqual([
        ["休", [0, 1]],
        ["む", [2]]
      ]);
    });

    test("gives exactly the blocks needed, drawn as their variants", () => {
      expect(puzzle?.blocks.map((block) => block.element).sort()).toEqual(["亻", "木", "む"].sort());
      const person = puzzle?.blocks.find((block) => block.element === "亻");
      expect(person?.face).toBe("亻");
      expect(person?.strokes).toHaveLength(1);
    });

    test("ghosts half the slots, rounded up", () => {
      expect(puzzle?.hints).toHaveLength(2);
    });
  });

  describe("advanced", () => {
    const puzzle = buildPuzzle(word("休む"), index, "advanced", seeded(1));

    test("draws a variant as its full form, and gives no hint", () => {
      const person = puzzle?.blocks.find((block) => block.element === "亻");
      expect(person?.face).toBe("人");
      expect(person?.strokes).toEqual([]);
      expect(puzzle?.hints).toEqual([]);
    });

    test("keeps the strokes of a piece that is its own full form", () => {
      expect(puzzle?.blocks.find((block) => block.element === "木")?.strokes).toHaveLength(1);
    });

    test("gives exactly the blocks needed", () => {
      expect(puzzle?.blocks).toHaveLength(3);
    });
  });

  describe("expert", () => {
    const puzzle = buildPuzzle(word("休む"), index, "expert", seeded(1));

    test("adds a look-alike from the same position in a kanji sharing a component", () => {
      expect(puzzle?.blocks.map((block) => block.element)).toContain("本");
    });

    test("adds a look-alike kana beside each kana", () => {
      const extra = puzzle?.blocks.filter((block) => !["亻", "木", "む", "本"].includes(block.element));
      expect(extra?.map((block) => block.element)).toHaveLength(1);
      expect(kanaLookAlikes("む")).toContain(extra?.[0]?.element);
    });

    test("pads a kanji that stays one block with a whole block from a related kanji", () => {
      const sun = buildPuzzle(word("日"), index, "expert", seeded(1));
      expect(sun?.blocks.map((block) => block.element).sort()).toEqual(["日", "白"]);
    });

    test("never adds a look-alike the word itself needs", () => {
      const both = buildPuzzle(word("休林"), index, "expert", seeded(2));
      const trees = both?.blocks.filter((block) => block.element === "木");
      expect(trees).toHaveLength(3);
    });
  });

  describe("look-alike kana", () => {
    test("offers the voiced, half-voiced and small forms", () => {
      expect(kanaLookAlikes("は")).toEqual(expect.arrayContaining(["ば", "ぱ", "ほ"]));
      expect(kanaLookAlikes("つ")).toEqual(expect.arrayContaining(["づ", "っ"]));
      expect(kanaLookAlikes("っ")).toContain("つ");
    });

    test("never offers the kana itself", () => {
      expect(kanaLookAlikes("る")).not.toContain("る");
    });
  });

  describe("placing and judging", () => {
    const puzzle = buildPuzzle(word("林"), index, "advanced", seeded(3));
    if (puzzle === null) throw new Error("林 must assemble");
    const [first, second] = puzzle.blocks;

    test("moves a block that is already placed instead of copying it", () => {
      const board = place(place(emptyBoard(puzzle), 0, first.id), 1, first.id);
      expect(board).toEqual([null, first.id]);
    });

    test("returns a displaced block to the tray", () => {
      const board = place(place(emptyBoard(puzzle), 0, first.id), 0, second.id);
      expect(loose(puzzle, board).map((block) => block.id)).toEqual([first.id]);
    });

    test("lifts a placed block back out", () => {
      expect(lift(place(emptyBoard(puzzle), 0, first.id), 0)).toEqual([null, null]);
    });

    test("judges a slot by element, so the two 木 of 林 can swap", () => {
      expect(judge(puzzle, [first.id, second.id])).toBe(true);
      expect(judge(puzzle, [second.id, first.id])).toBe(true);
    });

    test("waits for the last fill", () => {
      expect(isFull(place(emptyBoard(puzzle), 0, first.id))).toBe(false);
    });
  });

  describe("naming a slot", () => {
    test("names the halves, quarters, whole and middle of a character", () => {
      expect(positionOf([0, 0, 2, 4])).toBe("left");
      expect(positionOf([0, 2, 4, 2])).toBe("bottom");
      expect(positionOf([2, 0, 2, 2])).toBe("top-right");
      expect(positionOf([0, 0, 4, 4])).toBe("whole");
      expect(positionOf([1, 1, 2, 2])).toBe("center");
    });
  });

  describe("pathBox", () => {
    test("follows relative curves from the point they start at", () => {
      expect(pathBox("M10,20c0,0,5,5,10,10")).toEqual([10, 20, 20, 30]);
    });

    test("reads absolute and relative commands in one path", () => {
      expect(pathBox("M10,10L20,10l0,15")).toEqual([10, 10, 20, 25]);
    });
  });

  describe("framing a block's strokes", () => {
    test("draws every piece at one scale, a quarter of the grid per quarter of the block", () => {
      expect(viewBoxOf(["M10,20L30,20", "M20,10L20,40"], [0, 0, 2, 4])).toBe("-7.25 -29.5 54.5 109");
    });

    test("grows the frame instead of cutting off strokes that overrun the slot", () => {
      expect(viewBoxOf(["M0,0L100,10"], [2, 0, 2, 4])).toBe("-6 -49.5 112 109");
    });
  });

  describe("moving on after a placement", () => {
    test("picks the next empty slot, wrapping round", () => {
      expect(nextEmpty([0, null, 2, null], 1)).toBe(3);
      expect(nextEmpty([null, 1, 2], 2)).toBe(0);
    });

    test("stays put when nothing is empty", () => {
      expect(nextEmpty([0, 1], 1)).toBe(1);
    });
  });

  describe("recording what was placed", () => {
    const puzzle = buildPuzzle(word("休"), index, "expert", seeded(1));
    if (puzzle === null) throw new Error("休 must assemble");
    const block = (element: string) => puzzle.blocks.find((entry) => entry.element === element)?.id ?? -1;
    const slotOf = (element: string) => puzzle.slots.findIndex((slot) => slot.element === element);

    test("writes a finished kanji as itself", () => {
      expect(givenOf(puzzle, solve(puzzle))).toBe("休");
    });

    test("writes a wrong kanji as the pieces placed, so 本 for 木 shows", () => {
      const board = place(place(emptyBoard(puzzle), slotOf("亻"), block("亻")), slotOf("木"), block("本"));
      expect(judge(puzzle, board)).toBe(false);
      expect(trayDone(puzzle, board, 0)).toBe(false);
      expect(givenOf(puzzle, board)).toBe("亻本");
    });
  });
}
