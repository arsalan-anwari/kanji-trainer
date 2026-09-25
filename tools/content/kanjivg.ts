import type { Part, Rect } from "../../src/lib/content/types.ts";
import { boxOf, type Box } from "../../src/lib/quiz/assemble.ts";
import { cutOf, type Animcjk } from "./animcjk.ts";

type Path = { kind: "path"; d: string };

type Group = {
  kind: "group";
  element: string | null;
  original: string | null;
  part: string | null;
  children: Node[];
};

type Node = Path | Group;

export type Kanjivg = ReadonlyMap<string, Group>;

export const VIEWBOX = 109;
export const GRID = 4;
export const MAX_PARTS = 4;

const TOKEN = /<g\b([^>]*)>|<\/g>|<path\b([^>]*?)\/?>/g;
const KANJI = /<kanji id="kvg:kanji_([0-9a-f]+)">([\s\S]*?)<\/kanji>/g;

function attribute(attributes: string, name: string): string | null {
  const found = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return found === null ? null : found[1];
}

function group(attributes: string): Group {
  const variant = attribute(attributes, "kvg:variant") === "true";
  return {
    kind: "group",
    element: attribute(attributes, "kvg:element"),
    original: variant ? attribute(attributes, "kvg:original") : null,
    part: attribute(attributes, "kvg:part"),
    children: []
  };
}

function parseTree(body: string): Group | null {
  const stack: Group[] = [];
  let root: Group | null = null;
  for (const token of body.matchAll(TOKEN)) {
    const [whole, groupAttributes, pathAttributes] = token;
    if (whole.startsWith("</g")) {
      stack.pop();
      continue;
    }
    const parent = stack.at(-1);
    if (groupAttributes !== undefined) {
      const node = group(groupAttributes);
      if (parent === undefined) root ??= node;
      else parent.children.push(node);
      stack.push(node);
      continue;
    }
    const d = attribute(pathAttributes ?? "", "d");
    if (parent !== undefined && d !== null) parent.children.push({ kind: "path", d });
  }
  return root;
}

export function parseKanjivg(xml: string): Kanjivg {
  const kanji = new Map<string, Group>();
  for (const [, code, body] of xml.matchAll(KANJI)) {
    const root = parseTree(body);
    if (root !== null) kanji.set(String.fromCodePoint(Number.parseInt(code, 16)), root);
  }
  if (kanji.size === 0) throw new Error("kanjivg: no kanji in the file");
  return kanji;
}

function snapAxis(from: number, to: number, low: number, high: number, step: number): [number, number] {
  const scale = (value: number) => ((value - low) / Math.max(1, high - low)) * GRID;
  const start = Math.round(scale(from) / step) * step;
  const end = Math.round(scale(to) / step) * step;
  if (end > start) return [start, end - start];
  if (step > 1) return snapAxis(from, to, low, high, 1);
  return [Math.min(GRID - 1, Math.floor((scale(from) + scale(to)) / 2)), 1];
}

const TOLERANCE = 2;

function inside(inner: Box, outer: Box): boolean {
  return (
    inner[0] >= outer[0] - TOLERANCE &&
    inner[1] >= outer[1] - TOLERANCE &&
    inner[2] <= outer[2] + TOLERANCE &&
    inner[3] <= outer[3] + TOLERANCE
  );
}

export function snapRect(box: Box, within: Box, nested: boolean): Rect {
  const step = nested ? 1 : GRID / 2;
  const [x, w] = snapAxis(box[0], box[2], within[0], within[2], step);
  const [y, h] = snapAxis(box[1], box[3], within[1], within[3], step);
  return [x, y, w, h];
}

function strokesOf(node: Node): string[] {
  return node.kind === "path" ? [node.d] : node.children.flatMap(strokesOf);
}

function whole(character: string, root: Group): Part[] {
  return [{ element: character, rect: [0, 0, GRID, GRID], strokes: strokesOf(root) }];
}

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left[0] < right[0] + right[2] &&
    right[0] < left[0] + left[2] &&
    left[1] < right[1] + right[3] &&
    right[1] < left[1] + left[3]
  );
}

function namedGroups(group: Group): Group[] | null {
  const found: Group[] = [];
  for (const child of group.children) {
    if (child.kind === "path") return null;
    if (child.element !== null) {
      found.push(child);
      continue;
    }
    const inner = namedGroups(child);
    if (inner === null) return null;
    found.push(...inner);
  }
  return found;
}

type Entry = { element: string; original: string | null; strokes: string[] };

function laidOut(entries: readonly Entry[], within: Box): Part[] {
  const boxes = entries.map((entry) => boxOf(entry.strokes));
  const nested = boxes.map((box, index) => boxes.some((other, at) => at !== index && inside(box, other)));
  const snap = (fine: boolean) => boxes.map((box, index) => snapRect(box, within, fine || nested[index]));
  const halves = snap(false);
  const clash = halves.some(
    (rect, index) => !nested[index] && halves.some((other, at) => at !== index && !nested[at] && overlaps(rect, other))
  );
  const rects = clash ? snap(true) : halves;
  return entries.map((entry, index) => ({
    element: entry.element,
    ...(entry.original === null || entry.original === entry.element ? {} : { original: entry.original }),
    rect: rects[index],
    strokes: entry.strokes
  }));
}

function fromKanjivg(character: string, root: Group): Entry[] | null {
  const named = namedGroups(root);
  if (named === null) return null;
  const merged: Group[] = [];
  for (const child of named) {
    const twin = child.part === null ? undefined : merged.find((entry) => entry.part !== null && entry.element === child.element);
    if (twin === undefined) merged.push({ ...child, children: [...child.children] });
    else twin.children.push(...child.children);
  }
  if (merged.length < 2 || merged.length > MAX_PARTS) return null;
  return merged.map((entry) => ({
    element: entry.element ?? character,
    original: entry.original,
    strokes: strokesOf(entry)
  }));
}

function fromAnimcjk(character: string, root: Group, animcjk: Animcjk, known: ReadonlySet<string>): Entry[] | null {
  const acjk = animcjk.get(character);
  const pieces = acjk === undefined ? null : cutOf(acjk, MAX_PARTS);
  const strokes = strokesOf(root);
  if (pieces === null || pieces.length < 2) return null;
  if (!pieces.every((piece) => known.has(piece.element))) return null;
  if (pieces.every((piece) => piece.strokes === 1)) return null;
  if (pieces.reduce((sum, piece) => sum + piece.strokes, 0) !== strokes.length) return null;
  let at = 0;
  return pieces.map((piece) => {
    const own = strokes.slice(at, at + piece.strokes);
    at += piece.strokes;
    return { element: piece.element, original: null, strokes: own };
  });
}

export function partsOf(
  character: string,
  kanjivg: Kanjivg,
  animcjk: Animcjk = new Map(),
  known: ReadonlySet<string> = new Set()
): Part[] {
  const root = kanjivg.get(character);
  if (root === undefined) throw new Error(`KanjiVG has no strokes for "${character}"`);
  const entries = fromKanjivg(character, root) ?? fromAnimcjk(character, root, animcjk, known);
  if (entries === null) return whole(character, root);
  return laidOut(entries, boxOf(strokesOf(root)));
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const xml = `
<kanji id="kvg:kanji_04f11">
<g id="kvg:04f11" kvg:element="休">
	<g id="kvg:04f11-g1" kvg:element="亻" kvg:variant="true" kvg:original="人" kvg:position="left">
		<path id="kvg:04f11-s1" d="M35,16.5c0.25,1.75,0.25,4.25-0.88,6.8C28.91,35.01,22.37,46.02,10.5,60.29"/>
		<path id="kvg:04f11-s2" d="M26.28,42.5c0.72,1.25,1.26,3.48,1.26,4.75c0,12.75-0.07,29.88-0.26,42.25c-0.02,1.54-0.04,2.97-0.04,4.25"/>
	</g>
	<g id="kvg:04f11-g2" kvg:element="木" kvg:position="right">
		<path id="kvg:04f11-s3" d="M37.65,38.83c2.45,0.97,5.18,0.75,7.73,0.54c11.76-0.97,24.94-3.35,37.49-4.01c2.65-0.14,5.39-0.22,7.99,0.39"/>
		<path id="kvg:04f11-s4" d="M61.43,14c0.82,0.75,1.87,2.12,1.87,3.7c0,8.8,0.05,53.72-0.12,72.05c-0.03,2.88-0.06,4.91-0.08,5.75"/>
		<path id="kvg:04f11-s5" d="M62.43,38.32c0,2.18-1.1,4.31-1.9,6.04C54.57,57.4,44.96,71.84,35,78.75"/>
		<path id="kvg:04f11-s6" d="M64.12,38.08c4.45,8.37,16.21,25.33,24.99,33.19c1.96,1.76,4.35,4.18,6.9,5"/>
	</g>
</g>
</kanji>
<kanji id="kvg:kanji_056fd">
<g id="kvg:056fd" kvg:element="国">
	<g id="kvg:056fd-g1" kvg:element="囗" kvg:part="1" kvg:position="kamae">
		<path id="kvg:056fd-s1" d="M19,16.82c1.09,1.09,1.61,2.51,1.61,4.41c0,14.65-0.22,44.9-0.22,71.53c0,1.95-0.06,3.86-0.09,5.75"/>
		<path id="kvg:056fd-s2" d="M21.52,18.67C41.38,16.75,74.03,13.5,85,13.5c3.38,0,5,1.85,5,5.25c0,15.36-0.04,47.89-0.08,70.62c0,1.68,0,3.31,0,4.88"/>
	</g>
	<g id="kvg:056fd-g2" kvg:element="玉">
		<g id="kvg:056fd-g3" kvg:element="王" kvg:original="玉" kvg:partial="true">
			<path id="kvg:056fd-s3" d="M35.12,33.88c1.32,0.28,4.2,0.44,5.51,0.28c10.47-1.29,20.62-2.54,28.62-3.13c2.02-0.15,3.88-0.19,5.56,0.04"/>
			<path id="kvg:056fd-s6" d="M31.08,75.14c1.54,0.36,3.85,0.28,5.19,0.16c9.98-0.92,25.85-2.67,37.03-3.54c2.15-0.17,5.04-0.18,6.12,0.13"/>
		</g>
	</g>
	<g id="kvg:056fd-g5" kvg:element="囗" kvg:part="2" kvg:position="kamae">
		<path id="kvg:056fd-s8" d="M21.5,93.01c14.25-0.51,48.38-1.89,67-2.51"/>
	</g>
</g>
</kanji>
<kanji id="kvg:kanji_05b66">
<g id="kvg:05b66" kvg:element="学">
	<g id="kvg:05b66-g1" kvg:position="top">
		<g id="kvg:05b66-g2" kvg:element="⺍">
			<path id="kvg:05b66-s1" d="M30,10L70,20"/>
		</g>
		<g id="kvg:05b66-g3" kvg:element="冖">
			<path id="kvg:05b66-s4" d="M15,30L95,45"/>
		</g>
	</g>
	<g id="kvg:05b66-g4" kvg:element="子" kvg:position="bottom">
		<path id="kvg:05b66-s6" d="M20,50L90,95"/>
	</g>
</g>
</kanji>
<kanji id="kvg:kanji_04e00">
<g id="kvg:04e00" kvg:element="一">
	<path id="kvg:04e00-s1" d="M11,54.25c3.19,0.97,8.35,1.19,11.54,0.97c27.46-1.97,50.33-3.84,68.9-3.87c3.61-0.01,6.66,0.29,8.56,0.8"/>
</g>
</kanji>
<kanji id="kvg:kanji_0672c">
<g id="kvg:0672c" kvg:element="本">
	<g id="kvg:0672c-g1" kvg:element="木">
		<path id="kvg:0672c-s1" d="M18,39c2,0.5,70,-3,72,-2"/>
		<path id="kvg:0672c-s2" d="M54,12c1,1,1,60,1,80"/>
	</g>
	<path id="kvg:0672c-s5" d="M34,78c3,0.5,38,-1,41,-1"/>
</g>
</kanji>`;
  const kanjivg = parseKanjivg(xml);

  describe("partsOf", () => {
    test("puts 亻 on the left half of 休 and 木 on the right", () => {
      const parts = partsOf("休", kanjivg);
      expect(parts.map((part) => part.element)).toEqual(["亻", "木"]);
      expect(parts[0].rect).toEqual([0, 0, 2, 4]);
      expect(parts[1].rect).toEqual([2, 0, 2, 4]);
    });

    test("keeps the full form of a variant and no full form otherwise", () => {
      const [person, tree] = partsOf("休", kanjivg);
      expect(person.original).toBe("人");
      expect(tree.original).toBeUndefined();
    });

    test("joins the halves KanjiVG splits an enclosure into, the inner piece on top", () => {
      const parts = partsOf("国", kanjivg);
      expect(parts.map((part) => part.element)).toEqual(["囗", "玉"]);
      expect(parts[0].strokes).toHaveLength(3);
      expect(parts[0].rect).toEqual([0, 0, 4, 4]);
      expect(parts[1].rect).toEqual([1, 1, 2, 2]);
    });

    test("looks through a group KanjiVG leaves unnamed, and stacks three rows on quarters", () => {
      expect(partsOf("学", kanjivg).map((part) => [part.element, part.rect])).toEqual([
        ["⺍", [1, 0, 2, 1]],
        ["冖", [0, 1, 4, 1]],
        ["子", [0, 2, 4, 2]]
      ]);
    });

    test("leaves a kanji with no groups as one block of itself", () => {
      expect(partsOf("一", kanjivg)).toEqual([
        { element: "一", rect: [0, 0, 4, 4], strokes: [expect.any(String)] }
      ]);
    });

    test("leaves a kanji whose strokes sit outside any named group as one block", () => {
      const parts = partsOf("本", kanjivg);
      expect(parts).toHaveLength(1);
      expect(parts[0].strokes).toHaveLength(3);
    });

    test("takes the pieces from AnimCJK where KanjiVG leaves strokes unnamed, in stroke order", () => {
      const parts = partsOf("本", kanjivg, new Map([["本", "本⿻木.2一1"]]), new Set(["木", "一"]));
      expect(parts.map((part) => [part.element, part.strokes.length])).toEqual([
        ["木", 2],
        ["一", 1]
      ]);
      expect(parts[1].strokes[0]).toBe("M34,78c3,0.5,38,-1,41,-1");
    });

    test("keeps a kanji whole when AnimCJK counts its strokes differently", () => {
      expect(partsOf("本", kanjivg, new Map([["本", "本⿻木.4一1"]]), new Set(["木", "一"]))).toHaveLength(1);
    });

    test("keeps a kanji whole rather than cut it into single strokes", () => {
      expect(partsOf("本", kanjivg, new Map([["本", "本⿲一1一1一1"]]), new Set(["一"]))).toHaveLength(1);
    });

    test("keeps a kanji whole when an AnimCJK piece is not in the piece list", () => {
      expect(partsOf("本", kanjivg, new Map([["本", "本⿻木.2一1"]]), new Set(["木"]))).toHaveLength(1);
    });

    test("names a kanji KanjiVG does not hold", () => {
      expect(() => partsOf("林", kanjivg)).toThrow(/no strokes for "林"/);
    });
  });
}
