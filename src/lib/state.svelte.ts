import { mergeContents } from "./content/load";
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
import type { Content, Kanji, Word } from "./content/types";
import {
  enabledPacks,
  isBase,
  missingBases,
  offers,
  type CatalogEntry,
  type InstalledPack,
  type Offer
} from "./packs/catalog";
import {
  deletePack,
  fetchCatalog,
  installPack,
  listInstalled,
  loadPackContent,
  preparePacks,
  type Progress
} from "./packs/store";
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
  promptSurface,
  remainingMs,
  usesAudio,
  DEFAULT_SETTINGS,
  ONE_PASS,
  type RunSettings
} from "./quiz/settings";
import { fallbackHint, hintFor, lookIndex, type Hint } from "./quiz/hints";
import { componentIndex } from "./quiz/similarity";
import { isCounted, newReportId, packsOf, summarize, type Report, type Summary } from "./quiz/report";
import { settingsFromMistakes } from "./quiz/diagnosis";
import { emptyFilter, filterWords, kanjiIndex, type WordFilter } from "./browse/cards";
import { scoreTier } from "./quiz/score";
import { sfx, type FanfareGrade } from "kaizen-ui";
import { clips } from "./audio/clips.svelte";
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

export type Route =
  | "setup"
  | "study"
  | "words"
  | "quiz"
  | "result"
  | "reports"
  | "chart"
  | "print"
  | "market";
export type Phase = "answering" | "feedback" | "done";

/** The tabs the header pages between. Study and the run are sub-screens. */
export const TAB_ROUTES = ["setup", "reports", "chart", "market"] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

const SETTINGS_KEY = "kanji-trainer-settings";
const CHOSEN_PRESET_KEY = "kanji-trainer-chosen-preset";
const DISABLED_PACKS_KEY = "kanji-trainer-disabled-packs";

function pickIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}


class AppState {
  route = $state<Route>("setup");
  installed = $state<InstalledPack[]>([]);
  packContents = $state<Record<string, Content>>({});
  packsLoaded = $state(false);
  contentFailed = $state(false);
  catalog = $state<CatalogEntry[]>([]);
  catalogFresh = $state(false);
  catalogChecked = $state(false);
  disabledPacks = $state<string[]>([]);
  installing = $state<Record<string, Progress>>({});
  installFailed = $state<string[]>([]);
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
  staged = $state<string | null>(null);
  lastCorrect = $state(false);
  lastTimedOut = $state(false);
  confirmQuit = $state(false);
  hintOpen = $state(false);
  now = $state(0);
  questionStartedAt = $state(0);
  runStartedAt = $state(0);
  answeredAt = $state(0);
  pausedAt = 0;
  timer: ReturnType<typeof setInterval> | null = null;

  reports = $state<Report[]>([]);
  chartFilter = $state<WordFilter>(emptyFilter(DEFAULT_SETTINGS.level));
  printExcluded = $state<Set<string>>(new Set());
  lastReport = $state<Report | null>(null);
  splash = $state<FanfareGrade | null>(null);

  enabledPackIds = $derived<string[]>(enabledPacks(this.installed, this.disabledPacks));
  merged = $derived(
    mergeContents(this.enabledPackIds.flatMap((id) => this.packContents[id] ?? []))
  );
  words = $derived<Word[]>(this.merged.words);
  kanji = $derived<Kanji[]>(this.merged.kanji);
  ready = $derived(this.words.length > 0);
  offers = $derived<Offer[]>(offers(this.catalog, this.installed));
  updateCount = $derived(this.offers.filter((offer) => offer.state === "update").length);
  missingBases = $derived<CatalogEntry[]>(missingBases(this.catalog, this.installed));
  needsBase = $derived(
    this.packsLoaded &&
      (!this.installed.some(isBase) || (this.catalogFresh && this.missingBases.length > 0))
  );
  components = $derived(componentIndex(this.kanji));
  looks = $derived(lookIndex(this.kanji));
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

  kanjiByCharacter = $derived(kanjiIndex(this.kanji));
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
  questionRemaining = $derived(
    remainingMs(
      this.settings.perQuestionSeconds,
      (this.phase === "answering" ? this.now : this.answeredAt) - this.questionStartedAt
    )
  );
  totalRemaining = $derived(remainingMs(this.settings.totalSeconds, this.now - this.runStartedAt));
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
    this.disabledPacks = pickIds(loadJson<unknown>(DISABLED_PACKS_KEY, []));
    void this.refreshReports();
    void this.loadPacks();
    void this.refreshCatalog();
  }

  async refreshReports(): Promise<void> {
    this.reports = await listReports();
  }

  async loadPacks(): Promise<void> {
    this.contentFailed = false;
    await preparePacks();
    const installed = await listInstalled();
    const loaded = await Promise.all(
      installed.map(async (pack) => [pack.id, await loadPackContent(pack.id)] as const)
    );
    const contents: Record<string, Content> = {};
    for (const [id, content] of loaded) if (content !== null) contents[id] = content;
    this.installed = installed;
    this.packContents = contents;
    this.contentFailed = installed.some(isBase) && Object.keys(contents).length === 0;
    this.packsLoaded = true;
  }

  async refreshCatalog(): Promise<void> {
    const result = await fetchCatalog();
    this.catalogChecked = true;
    if (result === null) return;
    this.catalog = result.packs;
    this.catalogFresh = result.fresh;
  }

  async #reloadPack(id: string): Promise<void> {
    this.installed = await listInstalled();
    const content = await loadPackContent(id);
    const next = { ...this.packContents };
    if (content === null) delete next[id];
    else next[id] = content;
    this.packContents = next;
  }

  async installPack(id: string): Promise<boolean> {
    if (id in this.installing) return false;
    this.installFailed = this.installFailed.filter((entry) => entry !== id);
    this.installing = { ...this.installing, [id]: { done: 0, total: 0 } };
    const ok = await installPack(id, (progress) => {
      this.installing = { ...this.installing, [id]: progress };
    });
    const rest = { ...this.installing };
    delete rest[id];
    this.installing = rest;
    if (ok) await this.#reloadPack(id);
    else this.installFailed = [...this.installFailed, id];
    return ok;
  }

  async installMissingBases(): Promise<void> {
    if (this.catalog.length === 0) await this.refreshCatalog();
    for (const entry of this.missingBases) {
      if (!(await this.installPack(entry.id))) return;
    }
  }

  async removePack(id: string): Promise<boolean> {
    const ok = await deletePack(id);
    if (ok) await this.#reloadPack(id);
    return ok;
  }

  setPackEnabled(id: string, on: boolean): void {
    sfx.select();
    const rest = this.disabledPacks.filter((entry) => entry !== id);
    this.disabledPacks = on ? rest : [...rest, id];
    storeJson(DISABLED_PACKS_KEY, this.disabledPacks);
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
    this.staged = null;
    this.lastCorrect = false;
    this.confirmQuit = false;
    this.hintOpen = false;
    this.now = Date.now();
    this.runStartedAt = this.now;
    this.questionStartedAt = this.now;
    this.route = "quiz";
    this.splash = null;
    sfx.start();
    this.#startTimer();
    this.#cue();
  }

  #startTimer(): void {
    this.#stopTimer();
    this.timer = setInterval(() => this.#tick(), 100);
  }

  #stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  #tick(): void {
    this.now = Date.now();
    if (this.phase !== "answering") return;
    if (this.totalRemaining === 0) {
      this.finish();
      return;
    }
    if (this.questionRemaining === 0) this.record(false, "", true);
  }

  pause(): void {
    if (this.timer === null) return;
    this.#stopTimer();
    this.pausedAt = Date.now();
  }

  resume(): void {
    if (this.timer !== null || this.route !== "quiz" || this.confirmQuit) return;
    const held = Date.now() - this.pausedAt;
    this.runStartedAt += held;
    this.questionStartedAt += held;
    this.answeredAt += held;
    this.now = Date.now();
    this.#startTimer();
  }

  #cue(): void {
    const question = this.current;
    if (question === null || !usesAudio(this.settings.format)) return;
    if (promptSurface(this.settings.format) !== "audio") {
      clips.preload(question.choices);
      return;
    }
    void clips.play(question.prompt);
    const next = this.questions[this.index + 1];
    if (next !== undefined) clips.preload([next.prompt]);
  }

  replayPrompt(): void {
    const question = this.current;
    if (question === null || promptSurface(this.settings.format) !== "audio") return;
    void clips.play(question.prompt);
  }

  stageChoice(choice: string): void {
    if (this.phase !== "answering") return;
    this.staged = choice;
    void clips.play(choice);
  }

  submitStaged(): void {
    if (this.staged === null) return;
    this.answerChoice(this.staged);
  }

  record(correct: boolean, given: string, timedOut = false): void {
    const question = this.current;
    if (question === null) return;
    this.answeredAt = Date.now();
    this.answers = [
      ...this.answers,
      {
        wordId: question.wordId,
        correct,
        elapsedMs: this.answeredAt - this.questionStartedAt,
        given,
        timedOut
      }
    ];
    this.lastCorrect = correct;
    this.lastTimedOut = timedOut;
    this.phase = "feedback";
    if (correct) sfx.correct();
    else sfx.wrong();
    if (correct) this.#advanceAfterRight();
  }

  #advanceAfterRight(): void {
    const { questions, index } = this;
    setTimeout(() => {
      if (this.questions === questions && this.index === index && !this.confirmQuit) this.next();
    }, 700);
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
    clips.stop();
    this.index += 1;
    this.phase = "answering";
    this.typed = "";
    this.picked = null;
    this.staged = null;
    this.hintOpen = false;
    this.questionStartedAt = Date.now();
    this.now = this.questionStartedAt;
    this.#cue();
  }

  finish(): void {
    this.#stopTimer();
    const report: Report = {
      id: newReportId(),
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - this.runStartedAt,
      settings: { ...this.settings },
      answers: [...this.answers],
      packs: packsOf(
        this.answers.map((answer) => answer.wordId),
        this.words
      )
    };
    this.lastReport = report;
    clips.stop();
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
    this.pause();
    this.confirmQuit = true;
  }

  cancelQuit(): void {
    this.confirmQuit = false;
    this.resume();
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
    this.#stopTimer();
    sfx.click();
    clips.stop();
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

  countedReports(reports: readonly Report[]): Report[] {
    return reports.filter((report) => isCounted(report, this.enabledPackIds));
  }

  practiseMistakes(reports: readonly Report[]): void {
    const patch = settingsFromMistakes(this.countedReports(reports), this.words);
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
    clips.stop();
    this.message = "";
    this.route = route;
    if (route === "reports") void this.refreshReports();
  }
}

export const app = new AppState();
