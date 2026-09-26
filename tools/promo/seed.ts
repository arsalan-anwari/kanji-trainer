import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Word } from "../../src/lib/content/types";
import type { Answer } from "../../src/lib/quiz/questions";
import type { Report } from "../../src/lib/quiz/report";
import { DEFAULT_SETTINGS, type AnswerStyle, type Format, type RunSettings } from "../../src/lib/quiz/settings";

const REPORT_KEY = "kanji-trainer-reports";
const SETTINGS_KEY = "kanji-trainer-settings";
const PREFS_KEY = "kaizen-prefs";

const PACK = "n5-base";

const words: Word[] = JSON.parse(
  readFileSync(fileURLToPath(new URL(`../../data/packs/${PACK}/content.json`, import.meta.url)), "utf8")
).words;

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings: RunSettings = {
  ...DEFAULT_SETTINGS,
  sets: ["nature", "food", "calendar"],
  questionCount: 10
};

type Session = {
  daysAgo: number;
  hour: number;
  questions: number;
  accuracy: number;
  format: Format;
  answerStyle: AnswerStyle;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function startOfDay(stamp: number): number {
  const date = new Date(stamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const sessions: Session[] = [
  { daysAgo: 0, hour: 18.5, questions: 20, accuracy: 0.9, format: "kanji-kana", answerStyle: "choice" },
  { daysAgo: 0, hour: 14, questions: 10, accuracy: 0.84, format: "audio-kana", answerStyle: "typing" },
  { daysAgo: 1, hour: 19.5, questions: 20, accuracy: 0.8, format: "kanji-meaning", answerStyle: "choice" },
  { daysAgo: 2, hour: 21, questions: 20, accuracy: 0.76, format: "image-kanji", answerStyle: "choice" },
  { daysAgo: 4, hour: 18, questions: 30, accuracy: 0.7, format: "kana-kanji", answerStyle: "choice" },
  { daysAgo: 6, hour: 20, questions: 20, accuracy: 0.66, format: "kana-assemble", answerStyle: "choice" },
  { daysAgo: 11, hour: 19, questions: 20, accuracy: 0.6, format: "kanji-kana", answerStyle: "typing" },
  { daysAgo: 19, hour: 22, questions: 10, accuracy: 0.52, format: "kanji-kana", answerStyle: "choice" }
];

function stampOf(session: Session, index: number, now: number): string {
  const sat = startOfDay(now) - session.daysAgo * DAY + session.hour * HOUR;
  return new Date(Math.min(sat, now - (index + 1) * 45 * 60 * 1000)).toISOString();
}

function history(now: number): Report[] {
  const roll = random(20260926);
  const pool = words.filter((word) => settings.sets.includes(word.set));

  return sessions.map((session, index) => {
    const answers: Answer[] = [];
    for (let question = 0; question < session.questions; question += 1) {
      const word = pool[Math.floor(roll() * pool.length)];
      const correct = roll() < session.accuracy;
      answers.push({
        wordId: word.id,
        correct,
        timedOut: !correct && roll() < 0.2,
        elapsedMs: Math.round(1800 + roll() * 4200),
        given: correct ? word.reading : pool[Math.floor(roll() * pool.length)].reading
      });
    }

    return {
      id: `promo-${index}`,
      createdAt: stampOf(session, index, now),
      durationMs: answers.reduce((sum, answer) => sum + answer.elapsedMs, 0),
      settings: {
        ...settings,
        format: session.format,
        answerStyle: session.answerStyle,
        questionCount: session.questions
      },
      answers,
      packs: [PACK]
    };
  });
}

export type SeedPayload = {
  keys: { reports: string; settings: string; prefs: string };
  reports: Report[];
  settings: RunSettings;
  prefs: Record<string, unknown>;
};

export function seedPayload(options: { now?: number } = {}): SeedPayload {
  return {
    keys: { reports: REPORT_KEY, settings: SETTINGS_KEY, prefs: PREFS_KEY },
    reports: history(options.now ?? Date.now()),
    settings,
    prefs: { theme: "light", contrast: false, sound: true, zoom: 1, locale: "auto" }
  };
}

// Seeds only once, so a reload inside a recording keeps what the run changed.
export function applySeed(payload: SeedPayload): void {
  if (localStorage.getItem(payload.keys.settings) !== null) return;
  localStorage.setItem(payload.keys.reports, JSON.stringify(payload.reports));
  localStorage.setItem(payload.keys.settings, JSON.stringify(payload.settings));
  localStorage.setItem(payload.keys.prefs, JSON.stringify(payload.prefs));
}
