import { loadContent } from "./content/load";
import {
  groupWordsByKanji,
  kanjiBySet,
  setsWithWords,
  wordsPerKanji,
  SET_IDS,
  type SetId
} from "./content/sets";
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
import { fallbackHint, hintFor, lookIndex, type Hint } from "./quiz/hints";
import { componentIndex } from "./quiz/similarity";
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

export type Route = "setup" | "study" | "words" | "quiz" | "result" | "reports";
export type Phase = "answering" | "feedback" | "done";

/** The tabs the header pages between. Study and the run are sub-screens. */
export const TAB_ROUTES = ["setup", "reports"] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

const SETTINGS_KEY = "kanji-trainer-settings";
const CHOSEN_PRESET_KEY = "kanji-trainer-chosen-preset";


class AppState {
  route = $state<Route>("setup");
  content = $state<Content | null>(null);
  contentFailed = $state(false);
  settings = $state<RunSettings>({ ...DEFAULT_SETTINGS });
  notes = $state<string[]>([]);
  presets = $state<Preset[]>([]);
  #chosenPreset = $state("");
  message = $state("");

  questions = $state<Question[]>([]);
  answers = $state<Answer[]>([]);
  index = $state(0);
  phase = $state<Phase>("answering");
  typed = $state("");
  picked = $state<string | null>(null);
  lastCorrect = $state(false);
  confirmQuit = $state(false);
  hintOpen = $state(false);
  questionStartedAt = 0;
  runStartedAt = 0;

  reports = $state<Report[]>([]);
  lastReport = $state<Report | null>(null);

  words = $derived<Word[]>(this.content?.words ?? []);
  components = $derived(componentIndex(this.content?.kanji ?? []));
  looks = $derived(lookIndex(this.content?.kanji ?? []));
  levels = $derived<string[]>([...new Set(this.words.map((word) => word.level))]);
  availableSets = $derived<SetId[]>(setsWithWords(this.words));
  kanjiInSet = $derived(kanjiBySet(this.words));
  excludedWords = $derived<Set<string>>(new Set(this.settings.excludedWords));
  wordCounts = $derived(
    wordsPerKanji(this.words.filter((word) => !this.excludedWords.has(word.id)))
  );

  /** Every kanji the chosen sets teach — what an empty selection stands for. */
  kanjiOfChosenSets = $derived<string[]>(
    SET_IDS.filter((id) => this.settings.sets.includes(id)).flatMap((id) => this.kanjiInSet[id])
  );
  selectedKanji = $derived<Set<string>>(
    new Set(this.settings.kanji.length === 0 ? this.kanjiOfChosenSets : this.settings.kanji)
  );

  pickerOrder = $derived<string[]>(SET_IDS.flatMap((id) => this.kanjiInSet[id]));
  selectableWords = $derived<Word[]>(
    eligibleWords({ ...this.settings, excludedWords: [] }, this.words)
  );
  wordGroups = $derived(groupWordsByKanji(this.selectableWords, this.pickerOrder));

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
  hint = $derived<Hint | null>(
    this.currentWord === null
      ? null
      : hintFor(this.currentWord, this.settings.format, this.settings.difficulty, this.looks)
  );
  hintFallback = $derived<Hint | null>(
    this.currentWord === null
      ? null
      : fallbackHint(this.currentWord, this.settings.format, this.looks)
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

  get chosenPreset(): string {
    return this.#chosenPreset;
  }

  set chosenPreset(name: string) {
    this.#chosenPreset = name;
    storeJson(CHOSEN_PRESET_KEY, name);
  }

  load(): void {
    this.settings = parseSettings(loadJson<unknown>(SETTINGS_KEY, null));
    this.reports = listReports();
    this.presets = listPresets();
    const chosen = loadJson<unknown>(CHOSEN_PRESET_KEY, "");
    this.#chosenPreset =
      typeof chosen === "string" && this.presets.some((preset) => preset.name === chosen)
        ? chosen
        : "";
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

  toggleWord(id: string): void {
    const held = this.settings.excludedWords;
    this.updateSettings({
      excludedWords: held.includes(id) ? held.filter((entry) => entry !== id) : [...held, id]
    });
  }

  selectWords(ids: readonly string[]): void {
    const wanted = new Set(ids);
    this.updateSettings({
      excludedWords: this.settings.excludedWords.filter((id) => !wanted.has(id))
    });
  }

  clearWords(ids: readonly string[]): void {
    const held = new Set(this.settings.excludedWords);
    for (const id of ids) held.add(id);
    this.updateSettings({ excludedWords: [...held] });
  }

  resetWords(): void {
    this.updateSettings({ excludedWords: [] });
  }


  storePreset(name: string): void {
    this.presets = savePreset(name, this.settings);
    this.chosenPreset = name;
    this.message = "setup.presets.saved";
  }

  applyPreset(name: string): void {
    const preset = this.presets.find((entry) => entry.name === name);
    if (preset === undefined) return;
    this.chosenPreset = name;
    this.updateSettings({ ...preset.settings });
  }

  removePreset(name: string): void {
    this.presets = deletePreset(name);
    this.chosenPreset = "";
  }

  start(): void {
    const questions = buildQuestions(this.settings, this.words, Math.random, this.components);
    if (questions.length === 0) return;
    this.questions = questions;
    this.answers = [];
    this.index = 0;
    this.phase = "answering";
    this.typed = "";
    this.picked = null;
    this.lastCorrect = false;
    this.confirmQuit = false;
    this.hintOpen = false;
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
    this.hintOpen = false;
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

  showHint(): void {
    if (this.hint !== null) this.hintOpen = true;
  }

  hideHint(): void {
    this.hintOpen = false;
  }

  quit(): void {
    this.questions = [];
    this.answers = [];
    this.confirmQuit = false;
    this.hintOpen = false;
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
