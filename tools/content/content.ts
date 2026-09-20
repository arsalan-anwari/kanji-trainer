import type { Content, Kanji, ReadingClass, Source, Word } from "../../src/lib/content/types.ts";
import { isSetId, isSingleKanji, isKana, wordId } from "./validate.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: "${key}" must be a non-empty string`);
  }
  return value;
}

function list(record: Record<string, unknown>, key: string, where: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${where}: "${key}" must be an array`);
  }
  return value;
}

function characters(record: Record<string, unknown>, key: string, where: string): string[] {
  return list(record, key, where).map((item, index) => {
    if (typeof item !== "string" || [...item].length !== 1) {
      throw new Error(`${where}: ${key}[${index}] must be exactly one character`);
    }
    return item;
  });
}

function glosses(record: Record<string, unknown>, where: string): string[] {
  const found = list(record, "glosses", where).map((item, index) => {
    if (typeof item !== "string" || item === "") {
      throw new Error(`${where}: glosses[${index}] must be a non-empty string`);
    }
    return item;
  });
  if (found.length === 0) {
    throw new Error(`${where}: has no glosses, so its meaning cannot be checked`);
  }
  return found;
}

function readings(record: Record<string, unknown>, where: string): string[] {
  return list(record, "readings", where).map((item, index) => {
    if (typeof item !== "string" || !isKana(item)) {
      throw new Error(`${where}: readings[${index}] is not kana`);
    }
    return item;
  });
}

function parseReadingClass(value: unknown, where: string): ReadingClass | null {
  if (value === undefined) return null;
  if (value !== "on" && value !== "kun") {
    throw new Error(`${where}: readingClass "${String(value)}" is neither on nor kun`);
  }
  return value;
}

function parseWord(value: unknown, where: string): Word {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  const set = text(value, "set", where);
  if (!isSetId(set)) {
    throw new Error(`${where}: unknown set "${set}"`);
  }
  const reading = text(value, "reading", where);
  if (!isKana(reading)) {
    throw new Error(`${where}: reading "${reading}" is not kana`);
  }
  const written = text(value, "written", where);
  const id = text(value, "id", where);
  if (id !== wordId(written, reading)) {
    throw new Error(`${where}: id "${id}" does not match "${wordId(written, reading)}"`);
  }
  const accepted = readings(value, where);
  if (!accepted.includes(reading)) {
    throw new Error(`${where}: readings do not include the pinned reading "${reading}"`);
  }
  const readingClass = parseReadingClass(value.readingClass, where);
  if (readingClass !== null && [...written].length !== 1) {
    throw new Error(`${where}: "${written}" is a compound, so it has no reading class`);
  }
  const kanji = characters(value, "kanji", where);
  const kanjiCount = (kanji.length >= 2 ? 2 : 1) as 1 | 2;
  const hasOkurigana = written.length > kanji.length;
  return {
    id,
    written,
    reading,
    readings: accepted,
    ...(readingClass === null ? {} : { readingClass }),
    glosses: glosses(value, where),
    meaning: text(value, "meaning", where),
    kanji,
    kanjiCount,
    hasOkurigana,
    set,
    level: text(value, "level", where)
  };
}

function parseKanji(value: unknown, where: string): Kanji {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  const character = text(value, "character", where);
  if (!isSingleKanji(character)) {
    throw new Error(`${where}: "${character}" is not exactly one kanji`);
  }
  const components = characters(value, "components", where);
  if (components.length === 0) {
    throw new Error(`${where}: "${character}" decomposes into nothing`);
  }
  return {
    character,
    level: text(value, "level", where),
    components,
    on: list(value, "on", where).map((item, index) => {
      if (typeof item !== "string" || item === "") {
        throw new Error(`${where}: on[${index}] must be a non-empty string`);
      }
      return item;
    }),
    kun: list(value, "kun", where).map((item, index) => {
      if (typeof item !== "string" || item === "") {
        throw new Error(`${where}: kun[${index}] must be a non-empty string`);
      }
      return item;
    })
  };
}

function parseSource(value: unknown, where: string): Source {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  return {
    id: text(value, "id", where),
    title: text(value, "title", where),
    url: text(value, "url", where),
    licence: text(value, "licence", where),
    licenceUrl: text(value, "licenceUrl", where),
    version: text(value, "version", where)
  };
}

export function parseContent(value: unknown, where: string): Content {
  if (!isRecord(value)) {
    throw new Error(`${where}: must be an object`);
  }
  const content: Content = {
    level: text(value, "level", where),
    generated: text(value, "generated", where),
    sources: list(value, "sources", where).map((item, index) =>
      parseSource(item, `${where} source ${index}`)
    ),
    kanji: list(value, "kanji", where).map((item, index) =>
      parseKanji(item, `${where} kanji ${index}`)
    ),
    words: list(value, "words", where).map((item, index) =>
      parseWord(item, `${where} word ${index}`)
    ),
    taughtComponents: characters(value, "taughtComponents", where)
  };
  if (content.sources.length === 0) {
    throw new Error(`${where}: has no sources, so it cannot be attributed`);
  }
  if (content.kanji.length === 0 || content.words.length === 0) {
    throw new Error(`${where}: has no kanji or no words`);
  }
  return content;
}

export function contentProblems(content: Content, where: string): string[] {
  const problems: string[] = [];
  const levelKanji = new Set(content.kanji.map((entry) => entry.character));
  const seenKanji = new Set<string>();
  const seenWords = new Set<string>();

  for (const entry of content.kanji) {
    if (seenKanji.has(entry.character)) {
      problems.push(`${where}: "${entry.character}" appears twice in the kanji list`);
    }
    seenKanji.add(entry.character);
  }

  for (const word of content.words) {
    if (seenWords.has(word.id)) {
      problems.push(`${where}: "${word.id}" appears twice`);
    }
    seenWords.add(word.id);
    for (const character of word.kanji) {
      if (!levelKanji.has(character)) {
        problems.push(`${where}: "${word.id}" is tagged "${character}", which the level does not teach`);
      }
    }
    if (word.kanji.length === 0) {
      problems.push(`${where}: "${word.id}" is tagged with no kanji of the level`);
    }
    if (!word.written.includes(word.kanji[0])) {
      problems.push(`${where}: "${word.id}" is tagged "${word.kanji[0]}", which is not in its written form`);
    }
  }

  const shared = new Map<string, number>();
  for (const entry of content.kanji) {
    for (const component of entry.components) {
      shared.set(component, (shared.get(component) ?? 0) + 1);
    }
  }
  for (const component of content.taughtComponents) {
    const count = shared.get(component) ?? 0;
    if (count < 2) {
      problems.push(
        `${where}: component "${component}" occurs in ${count} kanji of the level, so it is not worth teaching`
      );
    }
  }

  return problems;
}
