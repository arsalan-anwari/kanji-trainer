export type Row = {
  size: number;
  space: number;
  lead: number;
  items: readonly number[];
  gap: number;
};

const SEARCH_STEPS = 24;

function span(widths: readonly number[], line: readonly number[], gap: number): number {
  return line.reduce((sum, index) => sum + (widths[index] ?? 0), 0) + gap * (line.length - 1);
}

export function wrapWidths(widths: readonly number[], gap: number, room: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  let used = 0;
  widths.forEach((width, index) => {
    const needed = line.length === 0 ? width : used + gap + width;
    if (line.length > 0 && needed > room) {
      lines.push(line);
      line = [index];
      used = width;
      return;
    }
    line.push(index);
    used = needed;
  });
  if (line.length > 0) lines.push(line);
  return lines;
}

function fitRow(row: Row, unit: number, width: number): number[][] | null {
  const size = row.size * unit;
  const room = width - row.lead * size;
  if (room < 0) return null;
  const widths = row.items.map((item) => item * size);
  const lines = wrapWidths(widths, row.gap * size, room);
  return lines.some((line) => span(widths, line, row.gap * size) > room) ? null : lines;
}

function rowHeight(row: Row, lines: number, unit: number, lineHeight: number): number {
  return (row.space + Math.max(lines, 1) * lineHeight) * row.size * unit;
}

export function layoutRows(
  rows: readonly Row[],
  unit: number,
  width: number,
  height: number,
  lineHeight: number
): number[][][] | null {
  const placed: number[][][] = [];
  let used = 0;
  for (const row of rows) {
    const lines = fitRow(row, unit, width);
    if (lines === null) return null;
    used += rowHeight(row, lines.length, unit, lineHeight);
    placed.push(lines);
  }
  return used <= height ? placed : null;
}

export function sharedUnit(
  cards: readonly (readonly Row[])[],
  width: number,
  height: number,
  lineHeight: number,
  largest: number
): number {
  const fits = (unit: number): boolean =>
    cards.every((rows) => layoutRows(rows, unit, width, height, lineHeight) !== null);
  if (fits(largest)) return largest;
  let low = 0;
  let high = largest;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  function row(items: number[], extra: Partial<Row> = {}): Row {
    return { size: 1, space: 0, lead: 0, items, gap: 0, ...extra };
  }

  describe("wrapping items onto lines", () => {
    test("fills each line greedily and starts a new one when the next item overflows", () => {
      expect(wrapWidths([3, 3, 3, 3], 1, 7)).toEqual([
        [0, 1],
        [2, 3]
      ]);
      expect(wrapWidths([3, 3, 3], 0, 9)).toEqual([[0, 1, 2]]);
    });

    test("puts an item wider than the line on a line of its own", () => {
      expect(wrapWidths([2, 10, 2], 0, 5)).toEqual([[0], [1], [2]]);
    });

    test("has no line for no items", () => {
      expect(wrapWidths([], 0, 5)).toEqual([]);
    });
  });

  describe("laying out a card's rows", () => {
    test("wraps a long reading under its label and keeps every item", () => {
      expect(layoutRows([row([4, 4, 4, 4], { lead: 2 })], 1, 10, 100, 1)).toEqual([
        [
          [0, 1],
          [2, 3]
        ]
      ]);
    });

    test("refuses a card whose lines run past its height", () => {
      expect(layoutRows([row([4, 4, 4, 4])], 1, 4, 3, 1)).toBeNull();
    });

    test("refuses a card with a single reading wider than the line", () => {
      expect(layoutRows([row([12])], 1, 10, 100, 1)).toBeNull();
    });

    test("refuses a label wider than the line", () => {
      expect(layoutRows([row([], { lead: 12 })], 1, 10, 100, 1)).toBeNull();
    });

    test("counts the space above a row against the card's height", () => {
      const rows = [row([1]), row([1], { space: 0.5 })];
      expect(layoutRows(rows, 1, 10, 2.5, 1)).not.toBeNull();
      expect(layoutRows(rows, 1, 10, 2.4, 1)).toBeNull();
    });
  });

  describe("one text size for every card", () => {
    test("keeps the largest size when every card fits at it", () => {
      expect(sharedUnit([[row([1])], [row([1])]], 10, 10, 1, 2)).toBe(2);
    });

    test("shrinks to the size the fullest card needs, so all cards match", () => {
      const light = [row([1])];
      const heavy = [row([2, 2, 2, 2, 2, 2])];
      const unit = sharedUnit([light, heavy], 4, 6, 1, 3);
      expect(unit).toBeLessThan(3);
      expect(layoutRows(heavy, unit, 4, 6, 1)).not.toBeNull();
      expect(layoutRows(heavy, unit * 1.01, 4, 6, 1)).toBeNull();
    });
  });
}
