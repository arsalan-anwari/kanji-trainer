export type SetId =
  | "numbers"
  | "calendar"
  | "time"
  | "people"
  | "position"
  | "body"
  | "verbs"
  | "places"
  | "nature"
  | "describing"
  | "irregulars";


export type Word = {
  id: string;
  written: string;
  reading: string;
  gloss: string;
  kanji: string[];
  set: SetId;
  level: string;
};

export type Kanji = {
  character: string;
  level: string;
  components: string[];
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
