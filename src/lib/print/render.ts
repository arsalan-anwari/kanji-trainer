import type { Kanji, Word } from "../content/types";
import {
  cardFace,
  kanjiIndex,
  listed,
  separated,
  type CardFace,
  type KanjiReadings
} from "../browse/cards";
import { imageUrl } from "../quiz/hints";
import cnFlag from "../assets/flags/cn.svg";
import jpFlag from "../assets/flags/jp.svg";
import {
  assemblePdf,
  cardsPerSheet,
  cardInner,
  cellRect,
  largestTextUnit,
  MIN_TEXT_PX,
  pageCount,
  PAGE_HEIGHT_PX,
  PAGE_WIDTH_PX,
  type PageImage,
  type Rect
} from "./pdf";
import { layoutRows, sharedUnit, type Row } from "./layout";

const FONT = '"Kaizen JP", sans-serif';
const INK = "#1f1d18";
const MUTED = "#6b665c";
const CUT_LINE = "#a8a193";
const JPEG_QUALITY = 0.88;
const LINE_HEIGHT = 1.35;
const ENTRY_SPACE = 0.35;
const READING_SPACE = 0.25;
const MEASURE_PX = 100;

export type RenderOptions = {
  signal: AbortSignal;
  onpage: (done: number, total: number) => void;
};

type Part = { text: string; weight: 400 | 700; color: string } | { image: HTMLImageElement | null };

type BackRow = {
  size: number;
  space: number;
  lead: Part[];
  items: string[];
  weight: 400 | 700;
  color: string;
  spaced: boolean;
};

type Back = { rows: BackRow[]; shapes: Row[] };

type Flags = { on: HTMLImageElement | null; kun: HTMLImageElement | null };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function encode(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("the page could not be encoded"));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function partWidth(ctx: CanvasRenderingContext2D, part: Part, size: number): number {
  if ("image" in part) return part.image === null ? 0 : size * 1.5 + size * 0.35;
  ctx.font = font(part.weight, size);
  return ctx.measureText(part.text).width;
}

function lineWidth(ctx: CanvasRenderingContext2D, parts: readonly Part[], size: number): number {
  return parts.reduce((sum, part) => sum + partWidth(ctx, part, size), 0);
}

function drawParts(
  ctx: CanvasRenderingContext2D,
  parts: readonly Part[],
  x: number,
  baseline: number,
  size: number
): void {
  let at = x;
  ctx.textBaseline = "alphabetic";
  for (const part of parts) {
    if ("image" in part) {
      if (part.image !== null) {
        const height = size * 0.75;
        ctx.drawImage(part.image, at, baseline - height * 0.95, height * 1.5, height);
      }
      at += partWidth(ctx, part, size);
      continue;
    }
    ctx.font = font(part.weight, size);
    ctx.fillStyle = part.color;
    ctx.fillText(part.text, at, baseline);
    at += ctx.measureText(part.text).width;
  }
}

function drawCentred(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  room: number,
  size: number
): void {
  const part: Part = { text, weight: 700, color: INK };
  const natural = partWidth(ctx, part, size);
  const fitted = natural <= room ? size : (size * room * 0.97) / natural;
  drawParts(ctx, [part], x + (room - partWidth(ctx, part, fitted)) / 2, baseline, fitted);
}

function outline(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const radius = Math.min(rect.width, rect.height) * 0.06;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.lineWidth = Math.max(1.5, rect.width * 0.006);
  ctx.strokeStyle = CUT_LINE;
  ctx.stroke();
}

function drawFront(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  face: CardFace,
  picture: HTMLImageElement | null
): void {
  const inner = cardInner(rect);
  const glyphs = Math.max([...face.written].length, 1);
  if (picture === null) {
    const size = Math.min(inner.height * 0.4, (inner.width / glyphs) * 0.95);
    drawCentred(
      ctx,
      face.written,
      inner.x,
      inner.y + inner.height / 2 + size * 0.35,
      inner.width,
      size
    );
    return;
  }
  const side = Math.min(inner.width, inner.height * 0.62);
  ctx.drawImage(picture, inner.x + (inner.width - side) / 2, inner.y, side, side);
  const room = inner.height - side;
  const size = Math.min(room * 0.7, (inner.width / glyphs) * 0.95);
  drawCentred(
    ctx,
    face.written,
    inner.x,
    inner.y + side + room / 2 + size * 0.38,
    inner.width,
    size
  );
}

function textRow(
  size: number,
  items: string[],
  weight: 400 | 700,
  color: string,
  spaced = false
): BackRow {
  return { size, space: 0, lead: [], items, weight, color, spaced };
}

function readingRow(space: number, lead: Part[], items: string[]): BackRow {
  return { size: 1, space, lead, items, weight: 400, color: INK, spaced: false };
}

function kanjiRows(entry: KanjiReadings, flags: Flags): BackRow[] {
  return [
    readingRow(ENTRY_SPACE, [{ text: entry.character, weight: 700, color: INK }], []),
    readingRow(READING_SPACE, [{ image: flags.on }], listed(entry.on)),
    readingRow(READING_SPACE, [{ image: flags.kun }], listed(entry.kun))
  ];
}

function backRows(face: CardFace, flags: Flags): BackRow[] {
  return [
    textRow(1.5, [face.kana], 700, INK),
    textRow(1, separated(face.romaji.split("-"), "-"), 400, MUTED),
    textRow(1.1, face.meaning.split(" "), 400, INK, true),
    ...face.kanji.flatMap((entry) => kanjiRows(entry, flags))
  ];
}

function measured(ctx: CanvasRenderingContext2D, row: BackRow): Row {
  const text = (value: string): number =>
    partWidth(ctx, { text: value, weight: row.weight, color: row.color }, MEASURE_PX) / MEASURE_PX;
  return {
    size: row.size,
    space: row.space,
    lead: lineWidth(ctx, row.lead, MEASURE_PX) / MEASURE_PX,
    items: row.items.map(text),
    gap: row.spaced ? text(" ") : 0
  };
}

function measureBack(
  ctx: CanvasRenderingContext2D,
  face: CardFace,
  flags: Flags
): Back {
  const rows = backRows(face, flags);
  return { rows, shapes: rows.map((row) => measured(ctx, row)) };
}

function textRoom(size: number): { width: number; height: number } {
  const inner = cardInner(cellRect(0, size, false));
  return { width: inner.width * 0.98, height: inner.height };
}

function textUnit(backs: readonly Back[], size: number): number {
  const { width, height } = textRoom(size);
  return sharedUnit(
    backs.map((back) => back.shapes),
    width,
    height,
    LINE_HEIGHT,
    largestTextUnit(size)
  );
}

function drawBack(ctx: CanvasRenderingContext2D, rect: Rect, back: Back, unit: number): void {
  const inner = cardInner(rect);
  const placed = layoutRows(back.shapes, unit, inner.width * 0.98, inner.height, LINE_HEIGHT);
  if (placed === null) throw new Error("a card back does not fit its cell");
  let top = inner.y;
  back.rows.forEach((row, index) => {
    const size = row.size * unit;
    top += row.space * size;
    const textX = inner.x + (back.shapes[index]?.lead ?? 0) * size;
    const lines = placed[index] ?? [];
    (lines.length === 0 ? [[]] : lines).forEach((line, lineIndex) => {
      top += size * LINE_HEIGHT;
      const baseline = top - size * 0.3;
      if (lineIndex === 0) drawParts(ctx, row.lead, inner.x, baseline, size);
      if (line.length === 0) return;
      const text = line.map((item) => row.items[item] ?? "").join(row.spaced ? " " : "");
      drawParts(ctx, [{ text, weight: row.weight, color: row.color }], textX, baseline, size);
    });
  });
}

type Workbench = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  backs: Back[];
  faces: CardFace[];
};

async function workbench(
  words: readonly Word[],
  kanji: readonly Kanji[]
): Promise<Workbench> {
  await Promise.all([
    document.fonts.load(font(400, 32), "漢あア"),
    document.fonts.load(font(700, 32), "漢あア")
  ]);
  const [on, kun] = await Promise.all([loadImage(cnFlag), loadImage(jpFlag)]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d canvas");
  const index = kanjiIndex(kanji);
  const faces = words.map((word) => cardFace(word, index));
  const backs = faces.map((face) => measureBack(ctx, face, { on, kun }));
  return { canvas, ctx, backs, faces };
}

export async function renderFlashcards(
  words: readonly Word[],
  kanji: readonly Kanji[],
  size: number,
  options: RenderOptions
): Promise<Uint8Array> {
  const { canvas, ctx, backs, faces } = await workbench(words, kanji);
  const unit = textUnit(backs, size);
  if (unit < MIN_TEXT_PX) throw new Error("the readings do not fit this grid");
  canvas.width = PAGE_WIDTH_PX;
  canvas.height = PAGE_HEIGHT_PX;

  const perSheet = cardsPerSheet(size);
  const total = pageCount(words.length, size);
  const pages: PageImage[] = [];
  for (let start = 0; start < words.length; start += perSheet) {
    const sheet = words.slice(start, start + perSheet);
    const pictures = await Promise.all(sheet.map((word) => loadImage(imageUrl(word))));
    for (const back of [false, true]) {
      options.signal.throwIfAborted();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      sheet.forEach((_, slot) => {
        const rect = cellRect(slot, size, back);
        outline(ctx, rect);
        const card = start + slot;
        const face = faces[card];
        const measuredBack = backs[card];
        if (face === undefined || measuredBack === undefined) return;
        if (back) drawBack(ctx, rect, measuredBack, unit);
        else drawFront(ctx, rect, face, pictures[slot] ?? null);
      });
      pages.push({ jpeg: await encode(canvas), width: canvas.width, height: canvas.height });
      options.onpage(pages.length, total);
    }
  }
  options.signal.throwIfAborted();
  return assemblePdf(pages);
}
