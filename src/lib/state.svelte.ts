import { loadContent } from "./content/load";
import { kanjiBySet, setsWithWords, wordsPerKanji, SET_IDS, type SetId } from "./content/sets";
import type { Content, Word } from "./content/types";
import {
  buildQuestions,
  checkChoice,
  checkTyped,
  eligibleWords,
  type Answer,
  type Question
} from "./quiz/questions";
import {
  normalizeSettings,
  parseSettings,
  DEFAULT_SETTINGS,
  ONE_PASS,
  type RunSettings
} from "./quiz/settings";
import { newReportId, summarize, type Report, type Summary } from "./quiz/report";
import {
  deletePreset,
  deleteReports,
  listPresets,
  listReports,
  loadJson,
  savePreset,
  saveReport,
  storeJson,
  type Preset
} from "./storage";

export type Route = "setup" | "study" | "quiz" | "result" | "reports";
export type Phase = "answering" | "feedback" | "done";

/** The tabs the header pages between. Study and the run are sub-screens. */
export const TAB_ROUTES = ["setup", "reports"] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

const SETTINGS_KEY = "kanji-trainer-settings";


class AppState {
  route = $state<Route>("setup");
  content = $state<Content | null>(null);
  contentFailed = $state(false);
  settings = $state<RunSettings>({ ...DEFAULT_SETTINGS });
  notes = $state<string[]>([]);
  presets = $state<Preset[]>([]);
  message = $state("");

  questions = $state<Question[]>([]);
  answers = $state<Answer[]>([]);
  index = $state(0);
  phase = $state<Phase>("answering");
  typed = $state("");
  picked = $state<string | null>(null);
  lastCorrect = $state(false);
  confirmQuit = $state(false);
  questionStartedAt = 0;
  runStartedAt = 0;

  reports = $state<Report[]>([]);
  lastReport = $state<Report | null>(null);

  words = $derived<Word[]>(this.content?.words ?? []);
  levels = $derived<string[]>([...new Set(this.words.map((word) => word.level))]);
  availableSets = $derived<SetId[]>(setsWithWords(this.words));
  kanjiInSet = $derived(kanjiBySet(this.words));
  wordCounts = $derived(wordsPerKanji(this.words));

  /** Every kanji the chosen sets teach — what an empty selection stands for. */
  kanjiOfChosenSets = $derived<string[]>(
    SET_IDS.filter((id) => this.settings.sets.includes(id)).flatMap((id) => this.kanjiInSet[id])
  );
  selectedKanji = $derived<Set<string>>(
    new Set(this.settings.kanji.length === 0 ? this.kanjiOfChosenSets : this.settings.kanji)
  );

  pool = $derived<Word[]>(eligibleWords(this.settings, this.words));
  eligibleCount = $derived(this.pool.length);
  questionTotal = $derived(
    this.settings.questionCount === ONE_PASS ? this.eligibleCount : this.settings.questionCount
  );
  canStart = $derived(this.eligibleCount > 0);

  current = $derived<Question | null>(this.questions[this.index] ?? null);
  currentWord = $derived(
    this.current === null
      ? null
      : (this.words.find((word) => word.id === this.current?.wordId) ?? null)
  );
  progress = $derived(
    this.questions.length === 0 ? 0 : (this.index + (this.phase === "answering" ? 0 : 1)) / this.questions.length
  );
  score = $derived(this.answers.filter((answer) => answer.correct).length);
  lastSummary = $derived<Summary | null>(
    this.lastReport === null ? null : summarize(this.lastReport)
  );
  missedWords = $derived(
    this.lastSummary === null
      ? []
      : this.lastSummary.missedWordIds.flatMap((id) => {
          const word = this.words.find((entry) => entry.id === id);
          return word === undefined ? [] : [word];
        })
  );

  load(): void {
    this.settings = parseSettings(loadJson<unknown>(SETTINGS_KEY, null));
    this.reports = listReports();
    this.presets = listPresets();
    void this.loadContent();
  }

  async loadContent(): Promise<void> {
    this.contentFailed = false;
    const content = await loadContent(this.settings.level);
    this.content = content;
    this.contentFailed = content === null;
  }

  updateSettings(patch: Partial<RunSettings>): void {
    const result = normalizeSettings({ ...this.settings, ...patch });
    this.settings = result.settings;
    this.notes = result.notes;
    storeJson(SETTINGS_KEY, this.settings);
  }

  toggleSet(id: SetId): void {
    const on = this.settings.sets.includes(id);
    const sets = on
      ? this.settings.sets.filter((entry) => entry !== id)
      : [...this.settings.sets, id];
    // A kanji selection is held per character, so a set leaving takes its
    // characters with it rather than leaving them orphaned in the list.
    const kanji =
      this.settings.kanji.length === 0
        ? []
        : this.settings.kanji.filter((character) => !this.kanjiInSet[id].includes(character));
    this.updateSettings({ sets, kanji });
  }

  selectAllSets(): void {
    this.updateSettings({ sets: [...this.availableSets], kanji: [] });
  }

  clearSets(): void {
    this.updateSettings({ sets: [], kanji: [] });
  }

  toggleKanji(character: string): void {
    const everything = this.kanjiOfChosenSets;
    const current = this.settings.kanji.length === 0 ? everything : this.settings.kanji;
    const next = current.includes(character)
      ? current.filter((entry) => entry !== character)
      : [...current, character];

    // Unticking the last one leaves nothing to practise, which is what clearing
    // the sets means; holding none back is what an empty list means.
    if (next.length === 0) {
      this.clearSets();
      return;
    }
    this.updateSettings({ kanji: next.length === everything.length ? [] : next });
  }

  selectAllKanji(): void {
    this.updateSettings({ kanji: [] });
  }


  storePreset(name: string): void {
    this.presets = savePreset(name, this.settings);
    this.message = "setup.presets.saved";
  }

  applyPreset(name: string): void {
    const preset = this.presets.find((entry) => entry.name === name);
    if (preset === undefined) return;
    this.updateSettings({ ...preset.settings });
  }

  removePreset(name: string): void {
    this.presets = deletePreset(name);
  }

  start(): void {
    const questions = buildQuestions(this.settings, this.words);
    if (questions.length === 0) return;
    this.questions = questions;
    this.answers = [];
    this.index = 0;
    this.phase = "answering";
    this.typed = "";
    this.picked = null;
    this.lastCorrect = false;
    this.confirmQuit = false;
    this.runStartedAt = Date.now();
    this.questionStartedAt = this.runStartedAt;
    this.route = "quiz";
  }

  record(correct: boolean, given: string): void {
    const question = this.current;
    if (question === null) return;
    this.answers = [
      ...this.answers,
      {
        wordId: question.wordId,
        correct,
        elapsedMs: Date.now() - this.questionStartedAt,
        given
      }
    ];
    this.lastCorrect = correct;
    this.phase = "feedback";
  }

  answerChoice(choice: string): void {
    if (this.phase !== "answering" || this.current === null) return;
    this.picked = choice;
    this.record(checkChoice(this.current, choice), choice);
  }

  submitTyped(): void {
    if (this.phase !== "answering" || this.current === null) return;
    const given = this.typed.trim();
    if (given === "") return;
    this.record(checkTyped(this.current, given), given);
  }

  next(): void {
    if (this.phase !== "feedback") return;
    if (this.index + 1 >= this.questions.length) {
      this.finish();
      return;
    }
    this.index += 1;
    this.phase = "answering";
    this.typed = "";
    this.picked = null;
    this.questionStartedAt = Date.now();
  }

  finish(): void {
    const report: Report = {
      id: newReportId(),
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - this.runStartedAt,
      settings: { ...this.settings },
      answers: [...this.answers]
    };
    this.lastReport = report;
    this.reports = saveReport(report);
    this.phase = "done";
    this.route = "result";
  }

  askQuit(): void {
    this.confirmQuit = true;
  }

  quit(): void {
    this.questions = [];
    this.answers = [];
    this.confirmQuit = false;
    this.route = "setup";
  }

  removeReports(ids: readonly string[]): void {
    this.reports = deleteReports(ids);
    this.message = "reports.deleted";
  }

  go(route: Route): void {
    this.message = "";
    this.route = route;
  }
}

export const app = new AppState();
