import type { Word } from "../content/types";
import { cardFace, separated, type CardFace } from "../browse/cards";
import { imageUrl } from "../quiz/hints";
import {
  assemblePdf,
  cardsPerSheet,
  cardInner,
  cellRect,
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
const MEASURE_PX = 100;

export type RenderOptions = {
  signal: AbortSignal;
  onpage: (done: number, total: number) => void;
};

type Part = { text: string; weight: 400 | 700; color: string };

type BackRow = {
  size: number;
  items: string[];
  weight: 400 | 700;
  color: string;
  spaced: boolean;
  /** Room above the row, in lines of its own size; a rule is drawn in it. */
  space: number;
};

type Back = { rows: BackRow[]; shapes: Row[] };

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
  ctx.font = font(part.weight, size);
  return ctx.measureText(part.text).width;
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
  spaced = false,
  space = 0
): BackRow {
  return { size, items, weight, color, spaced, space };
}

// One item per character, so Japanese wraps anywhere, except that small kana,
// the long vowel mark and punctuation stay on the line of the character before.
const GLYPH = /.[ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮー。、？！]*/gu;

function glyphs(text: string): string[] {
  return text.match(GLYPH) ?? [];
}

function backRows(face: CardFace): BackRow[] {
  const rows = [
    textRow(1.5, glyphs(face.kana), 700, INK),
    textRow(1, separated(face.romaji.split("-"), "-"), 400, MUTED),
    textRow(1.1, face.meaning.split(" "), 400, INK, true)
  ];
  if (face.example === null) return rows;
  return [
    ...rows,
    textRow(1, glyphs(face.example.japanese), 400, INK, false, 0.6),
    textRow(0.85, face.example.romaji.split(" "), 400, MUTED, true),
    textRow(0.85, face.example.english.split(" "), 400, INK, true)
  ];
}

function measured(ctx: CanvasRenderingContext2D, row: BackRow): Row {
  const text = (value: string): number =>
    partWidth(ctx, { text: value, weight: row.weight, color: row.color }, MEASURE_PX) / MEASURE_PX;
  return {
    size: row.size,
    space: row.space,
    lead: 0,
    items: row.items.map(text),
    gap: row.spaced ? text(" ") : 0
  };
}

function measureBack(ctx: CanvasRenderingContext2D, face: CardFace): Back {
  const rows = backRows(face);
  return { rows, shapes: rows.map((row) => measured(ctx, row)) };
}

function textRoom(size: number): { width: number; height: number } {
  const inner = cardInner(cellRect(0, size, false));
  return { width: inner.width * 0.98, height: inner.height };
}

// The largest text size at which the fullest back of this export still fits:
// every card shares it, so the text grows to fill the cells it is printed on.
function textUnit(backs: readonly Back[], size: number): number {
  const { width, height } = textRoom(size);
  return sharedUnit(
    backs.map((back) => back.shapes),
    width,
    height,
    LINE_HEIGHT,
    height
  );
}

function drawBack(ctx: CanvasRenderingContext2D, rect: Rect, back: Back, unit: number): void {
  const inner = cardInner(rect);
  const placed = layoutRows(back.shapes, unit, inner.width * 0.98, inner.height, LINE_HEIGHT);
  if (placed === null) throw new Error("a card back does not fit its cell");
  let top = inner.y;
  back.rows.forEach((row, index) => {
    const size = row.size * unit;
    if (row.space > 0) {
      top += row.space * size;
      const y = top - (row.space * size) / 2;
      ctx.beginPath();
      ctx.moveTo(inner.x, y);
      ctx.lineTo(inner.x + inner.width, y);
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.strokeStyle = CUT_LINE;
      ctx.stroke();
    }
    for (const line of placed[index] ?? []) {
      top += size * LINE_HEIGHT;
      const text = line.map((item) => row.items[item] ?? "").join(row.spaced ? " " : "");
      drawParts(ctx, [{ text, weight: row.weight, color: row.color }], inner.x, top - size * 0.3, size);
    }
  });
}

type Workbench = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  backs: Back[];
  faces: CardFace[];
};

async function workbench(words: readonly Word[]): Promise<Workbench> {
  await Promise.all([
    document.fonts.load(font(400, 32), "漢あア"),
    document.fonts.load(font(700, 32), "漢あア")
  ]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d canvas");
  const faces = words.map(cardFace);
  const backs = faces.map((face) => measureBack(ctx, face));
  return { canvas, ctx, backs, faces };
}

export async function renderFlashcards(
  words: readonly Word[],
  size: number,
  options: RenderOptions
): Promise<Uint8Array> {
  const { canvas, ctx, backs, faces } = await workbench(words);
  const unit = textUnit(backs, size);
  if (unit < MIN_TEXT_PX) throw new Error("the card backs do not fit this grid");
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
