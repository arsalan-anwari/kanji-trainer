import { loadContent } from "./content/load";
import {
  countBySubcategory,
  groupWordsByKanji,
  kanjiBySet,
  setsWithWords,
  subcategoriesBySet,
  subcategoryKey,
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
import { settingsFromMistakes } from "./quiz/diagnosis";
import { emptyFilter, filterWords, kanjiIndex, type WordFilter } from "./browse/cards";
import { scoreTier } from "./quiz/score";
import { sfx, type FanfareGrade } from "kaizen-ui";
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

export type Route = "setup" | "study" | "words" | "quiz" | "result" | "reports" | "chart" | "print";
export type Phase = "answering" | "feedback" | "done";

/** The tabs the header pages between. Study and the run are sub-screens. */
export const TAB_ROUTES = ["setup", "reports", "chart"] as const;

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
  chartFilter = $state<WordFilter>(emptyFilter(DEFAULT_SETTINGS.level));
  printExcluded = $state<Set<string>>(new Set());
  lastReport = $state<Report | null>(null);
  splash = $state<FanfareGrade | null>(null);

  words = $derived<Word[]>(this.content?.words ?? []);
  components = $derived(componentIndex(this.content?.kanji ?? []));
  looks = $derived(lookIndex(this.content?.kanji ?? []));
  levels = $derived<string[]>([...new Set(this.words.map((word) => word.level))]);
  availableSets = $derived<SetId[]>(setsWithWords(this.words));
  kanjiInSet = $derived(kanjiBySet(this.words));
  excludedWords = $derived<Set<string>>(new Set(this.settings.excludedWords));
  subcategoriesInSet = $derived(subcategoriesBySet(this.words));
  /** How many words each (set, subcategory) pair still holds, for the badges. */
  subcategoryCounts = $derived(
    countBySubcategory(this.words.filter((word) => !this.excludedWords.has(word.id)))
  );

  /** Every subcategory the chosen sets hold — what an empty selection stands for. */
  subcategoriesOfChosenSets = $derived<string[]>(
    SET_IDS.filter((id) => this.settings.sets.includes(id)).flatMap((id) =>
      this.subcategoriesInSet[id].map((subcategory) => subcategoryKey(id, subcategory))
    )
  );
  selectedSubcategories = $derived<Set<string>>(
    new Set(
      this.settings.subcategories.length === 0
        ? this.subcategoriesOfChosenSets
        : this.settings.subcategories
    )
  );

  kanjiByCharacter = $derived(kanjiIndex(this.content?.kanji ?? []));
  charted = $derived<Word[]>(filterWords(this.words, this.chartFilter));
  printWords = $derived<Word[]>(this.charted.filter((word) => !this.printExcluded.has(word.id)));

  pickerOrder = $derived<string[]>(SET_IDS.flatMap((id) => this.kanjiInSet[id]));
  selectableWords = $derived<Word[]>(
    eligibleWords({ ...this.settings, excludedWords: [] }, this.words)
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
    this.chartFilter = emptyFilter(this.settings.level);
    this.presets = listPresets();
    const chosen = loadJson<unknown>(CHOSEN_PRESET_KEY, "");
    this.#chosenPreset =
      typeof chosen === "string" && this.presets.some((preset) => preset.name === chosen)
        ? chosen
        : "";
    void this.refreshReports();
    void this.loadContent();
  }

  async refreshReports(): Promise<void> {
    this.reports = await listReports();
  }

  async loadContent(): Promise<void> {
    this.contentFailed = false;
    const content = await loadContent(this.settings.level);
    this.content = content;
    this.contentFailed = content === null;
  }

  updateSettings(patch: Partial<RunSettings>): void {
    sfx.select();
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
    // A subcategory selection is held per pair, so a set leaving takes its
    // pairs with it rather than leaving them orphaned in the list.
    const subcategories =
      this.settings.subcategories.length === 0
        ? []
        : this.settings.subcategories.filter((key) => !key.startsWith(`${id}/`));
    this.updateSettings({ sets, subcategories });
  }

  selectAllSets(): void {
    this.updateSettings({ sets: [...this.availableSets], subcategories: [] });
  }

  clearSets(): void {
    this.updateSettings({ sets: [], subcategories: [] });
  }

  toggleSubcategory(key: string): void {
    const everything = this.subcategoriesOfChosenSets;
    const current =
      this.settings.subcategories.length === 0 ? everything : this.settings.subcategories;
    const next = current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key];

    // Unticking the last one leaves nothing to practise, which is what clearing
    // the sets means; holding none back is what an empty list means.
    if (next.length === 0) {
      this.clearSets();
      return;
    }
    this.updateSettings({ subcategories: next.length === everything.length ? [] : next });
  }

  /** Every subcategory of one set, on or off together. */
  setSubcategoriesOf(id: SetId, on: boolean): void {
    const everything = this.subcategoriesOfChosenSets;
    const current =
      this.settings.subcategories.length === 0 ? everything : this.settings.subcategories;
    const mine = this.subcategoriesInSet[id].map((entry) => subcategoryKey(id, entry));
    const next = on
      ? [...current.filter((key) => !mine.includes(key)), ...mine]
      : current.filter((key) => !mine.includes(key));
    if (next.length === 0) {
      this.clearSets();
      return;
    }
    this.updateSettings({ subcategories: next.length === everything.length ? [] : next });
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


  storePreset(name: string): void {
    this.presets = savePreset(name, {
      sets: this.settings.sets,
      subcategories: this.settings.subcategories,
      excludedWords: this.settings.excludedWords
    });
    this.chosenPreset = name;
    this.message = "setup.presets.saved";
  }

  applyPreset(name: string): void {
    const preset = this.presets.find((entry) => entry.name === name);
    if (preset === undefined) return;
    this.chosenPreset = name;
    this.updateSettings(preset.selection);
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
    this.splash = null;
    sfx.start();
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
    if (correct) sfx.correct();
    else sfx.wrong();
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
    this.record(checkTyped(this.current, given, this.settings.format), given);
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
    this.phase = "done";
    this.route = "result";
    const summary = summarize(report);
    this.splash = scoreTier(summary.accuracy, summary.total);
    sfx.score(this.splash);
    void saveReport(report).then(() => this.refreshReports());
  }

  dismissSplash(): void {
    this.splash = null;
  }

  askQuit(): void {
    sfx.click();
    this.confirmQuit = true;
  }

  showHint(): void {
    if (this.hint === null) return;
    sfx.hint();
    this.hintOpen = true;
  }

  hideHint(): void {
    this.hintOpen = false;
  }

  quit(): void {
    sfx.click();
    this.questions = [];
    this.answers = [];
    this.confirmQuit = false;
    this.hintOpen = false;
    this.route = "setup";
    this.splash = null;
  }

  async removeReports(ids: readonly string[]): Promise<void> {
    await deleteReports(ids);
    await this.refreshReports();
    this.message = "reports.deleted";
  }

  practiseMistakes(reports: readonly Report[]): void {
    const patch = settingsFromMistakes(reports, this.words);
    if (Object.keys(patch).length === 0) {
      this.message = "reports.practise.empty";
      return;
    }
    this.updateSettings(patch);
    this.route = "setup";
    this.message = "reports.practise.loaded";
  }

  togglePrintWord(id: string): void {
    const next = new Set(this.printExcluded);
    if (!next.delete(id)) next.add(id);
    this.printExcluded = next;
  }

  setPrintWords(ids: readonly string[], on: boolean): void {
    const next = new Set(this.printExcluded);
    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    this.printExcluded = next;
  }

  go(route: Route): void {
    sfx.click();
    this.message = "";
    this.route = route;
    if (route === "reports") void this.refreshReports();
  }
}

export const app = new AppState();
