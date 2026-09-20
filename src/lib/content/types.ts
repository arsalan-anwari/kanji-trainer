import type { SetId } from "./sets";

export type { SetId };

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
  /** How many kanji characters are in the word (1, 2+). */
  kanjiCount: 1 | 2;
  /** True if word has hiragana suffix after kanji (okurigana). */
  hasOkurigana: boolean;
  set: SetId;
  level: string;
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
  taughtComponents: string[];
};
