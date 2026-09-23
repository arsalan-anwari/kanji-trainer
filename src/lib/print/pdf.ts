export const DPI = 200;
export const PAGE_WIDTH_PX = Math.round((210 / 25.4) * DPI);
export const PAGE_HEIGHT_PX = Math.round((297 / 25.4) * DPI);

const PAGE_WIDTH_PT = (210 / 25.4) * 72;
const PAGE_HEIGHT_PT = (297 / 25.4) * 72;
const MARGIN_PX = Math.round((10 / 25.4) * DPI);
const GAP_PX = Math.round((3 / 25.4) * DPI);
const CARD_PADDING = 0.08;
const UNITS_ACROSS = 11;

export const MIN_TEXT_PX = (7 / 72) * DPI;

export type Rect = { x: number; y: number; width: number; height: number };

export type PageImage = { jpeg: Uint8Array; width: number; height: number };

export function cardsPerSheet(size: number): number {
  return size * size;
}

export function pageCount(cards: number, size: number): number {
  return 2 * Math.ceil(cards / cardsPerSheet(size));
}

export function cellRect(index: number, size: number, back: boolean): Rect {
  const width = (PAGE_WIDTH_PX - 2 * MARGIN_PX - (size - 1) * GAP_PX) / size;
  const height = (PAGE_HEIGHT_PX - 2 * MARGIN_PX - (size - 1) * GAP_PX) / size;
  const row = Math.floor(index / size);
  const column = back ? size - 1 - (index % size) : index % size;
  return {
    x: MARGIN_PX + column * (width + GAP_PX),
    y: MARGIN_PX + row * (height + GAP_PX),
    width,
    height
  };
}

export function cardInner(rect: Rect): Rect {
  const by = rect.width * CARD_PADDING;
  return {
    x: rect.x + by,
    y: rect.y + by,
    width: rect.width - 2 * by,
    height: rect.height - 2 * by
  };
}

export function largestTextUnit(size: number): number {
  return cardInner(cellRect(0, size, false)).width / UNITS_ACROSS;
}

export const GRID_SIZES: readonly number[] = [1, 2, 3, 4];

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function points(value: number): string {
  return value.toFixed(2);
}

export function assemblePdf(pages: readonly PageImage[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  function push(part: Uint8Array): void {
    parts.push(part);
    length += part.length;
  }

  function object(id: number, head: string, stream?: Uint8Array): void {
    offsets[id] = length;
    if (stream === undefined) {
      push(ascii(`${id} 0 obj\n${head}\nendobj\n`));
      return;
    }
    push(ascii(`${id} 0 obj\n${head}\nstream\n`));
    push(stream);
    push(ascii("\nendstream\nendobj\n"));
  }

  const pageId = (index: number): number => 3 + index * 3;

  push(ascii("%PDF-1.4\n%âã\n"));
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, index) => `${pageId(index)} 0 R`).join(" ");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  const width = points(PAGE_WIDTH_PT);
  const height = points(PAGE_HEIGHT_PT);
  pages.forEach((page, index) => {
    const id = pageId(index);
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`
    );
    object(
      id + 1,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg
    );
    const draw = ascii(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
    object(id + 2, `<< /Length ${draw.length} >>`, draw);
  });

  const size = 3 + pages.length * 3;
  const xref = length;
  const entries = offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  push(
    ascii(
      `xref\n0 ${size}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    )
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest;

  const latin1 = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

  function fakeJpeg(marker: number): PageImage {
    return { jpeg: Uint8Array.from([0xff, 0xd8, marker, 0x0a, 0xff, 0xd9]), width: 4, height: 6 };
  }

  describe("laying cards out on a sheet", () => {
    test("needs a front and a back page for every started sheet", () => {
      expect(pageCount(1, 1)).toBe(2);
      expect(pageCount(64, 8)).toBe(2);
      expect(pageCount(65, 8)).toBe(4);
      expect(pageCount(10, 3)).toBe(4);
      expect(pageCount(0, 4)).toBe(0);
    });

    test("mirrors the columns of the back so a long-edge flip lands on the front", () => {
      for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (let index = 0; index < cardsPerSheet(size); index += 1) {
          const front = cellRect(index, size, false);
          const back = cellRect(index, size, true);
          expect(back.y).toBe(front.y);
          expect(back.x + back.width).toBeCloseTo(PAGE_WIDTH_PX - front.x, 6);
        }
      }
    });

    test("offers only grids whose cards can hold text at the smallest printable size", () => {
      for (const size of GRID_SIZES)
        expect(largestTextUnit(size)).toBeGreaterThanOrEqual(MIN_TEXT_PX);
    });

    test("keeps every card inside the page", () => {
      const last = cellRect(63, 8, false);
      expect(last.x + last.width).toBeLessThan(PAGE_WIDTH_PX);
      expect(last.y + last.height).toBeLessThan(PAGE_HEIGHT_PX);
    });
  });

  describe("writing the pdf", () => {
    const pages = [fakeJpeg(1), fakeJpeg(2), fakeJpeg(3), fakeJpeg(4)];
    const bytes = assemblePdf(pages);
    const text = latin1(bytes);

    test("starts with a pdf header and ends with the end-of-file marker", () => {
      expect(text.startsWith("%PDF-1.4\n")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    });

    test("points every cross-reference entry at the object it names", () => {
      const start = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
      expect(text.slice(start, start + 4)).toBe("xref");
      const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(text.slice(start)) ?? [];
      expect(Number(first)).toBe(0);
      const entries = text
        .slice(start)
        .split("\n")
        .slice(3, 2 + Number(count));
      expect(entries).toHaveLength(Number(count) - 1);
      entries.forEach((entry, index) => {
        const offset = Number(entry.slice(0, 10));
        expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
      });
    });

    test("holds one page per image, each carrying its jpeg untouched", () => {
      expect(/\/Count (\d+)/.exec(text)?.[1]).toBe("4");
      expect(text.match(/\/Type \/Page /g)).toHaveLength(4);
      expect(text.match(/\/Filter \/DCTDecode/g)).toHaveLength(4);
      expect(text).toContain(latin1(pages[2]?.jpeg ?? new Uint8Array()));
    });

    test("gives a sheet of cards exactly the pages the count promises", () => {
      const cards = 10;
      const size = 3;
      const sheets = Array.from({ length: pageCount(cards, size) }, (_, index) => fakeJpeg(index));
      expect(latin1(assemblePdf(sheets)).match(/\/Type \/Page /g)).toHaveLength(4);
    });
  });
}
