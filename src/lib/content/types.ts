import type { SetId, WordShape } from "./sets";

export type { SetId, WordShape };

export type ReadingClass = "on" | "kun";

export type Word = {
  id: string;
  written: string;
  /** The reading the run pins as the answer. */
  reading: string;
  /** Every reading judged correct when typed, the pinned one first. */
  readings: string[];
  /**
   * Which class the pinned reading belongs to. Only one-character words carry
   * it: a compound is read as a whole, so the question has no single answer.
   */
  readingClass?: ReadingClass;
  glosses: string[];
  meaning: string;
  /** A sentence or two describing the word without naming it. */
  clue: string;
  kanji: string[];
  shape: WordShape;
  hasAudio: boolean;
  set: SetId;
  /** What the word is about inside its set. One of SUBCATEGORIES[set]. */
  subcategory: string;
  level: string;
  pack: string;
  /**
   * Name of the word's picture and clip, without extension. Curated once and
   * never derived from `meaning`, so relabelling a word leaves its media put.
   */
  file: string;
  /** One sentence that shows the word in use. Never asked; shown on the back of a flashcard. */
  example?: Example;
};

export type Example = { japanese: string; romaji: string; english: string };

export type Rect = [x: number, y: number, w: number, h: number];

export type Part = {
  element: string;
  original?: string;
  rect: Rect;
  strokes: string[];
};

export type Kanji = {
  character: string;
  level: string;
  /** How the character looks, described in words. */
  look: string;
  components: string[];
  /** On readings in katakana, as KANJIDIC writes them. */
  on: string[];
  /** Kun readings with okurigana after a dot, as KANJIDIC writes them. */
  kun: string[];
};

export type Source = {
  id: string;
  title: string;
  url: string;
  licence: string;
  licenceUrl: string;
  version: string;
};

export type Content = {
  level: string;
  generated: string;
  sources: Source[];
  kanji: Kanji[];
  words: Word[];
  /** How every kanji the words are written with is cut into blocks. */
  parts: Record<string, Part[]>;
  taughtComponents: string[];
};
