<script lang="ts">
  import {
    AccuracyGrid,
    AreaSparkGrid,
    Badge,
    BulletGraph,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    Icon,
    MissBoard,
    Pagination,
    Popover,
    Stat,
    TreeTable,
    masteryLevels,
    type AreaSparkGroup,
    type AreaSparkSeries,
    type IconName,
    type Mastery,
    type MissSection,
    type StatRow,
    type TreeTableGroup
  } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { isCounted, summarize } from "../../quiz/report";
  import {
    formatTree,
    missesBySetAndWord,
    statsByKanji,
    statsBySet,
    timeSeriesByFormat,
    TIME_BASELINE_RUNS
  } from "../../quiz/diagnosis";
  import { exportReports, importReports } from "../../storage";
  import { ANY_QUERY, queryLabels, queryReports, windowLabel, type ReportQuery } from "../../quiz/query";
  import ReportFilters from "./ReportFilters.svelte";
  import { n, t } from "../../i18n.svelte";

  let query = $state<ReportQuery>({ ...ANY_QUERY });
  let picked = $state<string[]>([]);
  let confirming = $state(false);

  const shown = $derived(queryReports(app.reports, query));
  const chosen = $derived(
    picked.length === 0 ? shown : shown.filter((report) => picked.includes(report.id))
  );
  const counted = $derived(app.countedReports(chosen));
  const answers = $derived(counted.flatMap((report) => report.answers));
  const right = $derived(answers.filter((answer) => answer.correct).length);
  const accuracy = $derived(answers.length === 0 ? 0 : Math.round((right / answers.length) * 100));
  const allPicked = $derived(
    shown.length > 0 && shown.every((report) => picked.includes(report.id))
  );
  const tags = $derived(queryLabels(query, (id) => app.packTitle(id)));

  const perPage = 4;
  let page = $state(1);
  const pages = $derived(Math.max(1, Math.ceil(shown.length / perPage)));
  const pageItems = $derived(shown.slice((page - 1) * perPage, page * perPage));
  let listTop = $state<HTMLElement | null>(null);

  $effect(() => {
    void shown;
    page = 1;
  });

  const kanjiRows = $derived(statsByKanji(answers, app.words));
  const setRows = $derived<StatRow[]>(
    statsBySet(answers, app.words).map((row) => ({ ...row, label: t(`common.set.${row.key}`) }))
  );

  const formatTreeRows = $derived<TreeTableGroup[]>(
    formatTree(counted).map((group) => ({
      ...group,
      label: t(`common.category.${group.key}`),
      children: group.children.map((child) => ({ ...child, label: t(`common.format.${child.key}`) }))
    }))
  );

  const missSections = $derived<MissSection[]>(
    missesBySetAndWord(counted, app.words).map((section) => ({
      ...section,
      label: t(`common.set.${section.key}`)
    }))
  );

  const speedGroups = $derived<AreaSparkGroup[]>(
    timeSeriesByFormat(counted, TIME_BASELINE_RUNS).map((group) => ({
      ...group,
      label: t(`common.category.${group.key}`),
      series: group.series.map((series) => ({ ...series, label: t(`common.format.${series.key}`) }))
    }))
  );

  function masteryLabels(): Record<Mastery, string> {
    return Object.fromEntries(
      masteryLevels.map((level) => [level, t(`reports.mastery.${level}`)])
    ) as Record<Mastery, string>;
  }

  function describeStat(row: StatRow): string {
    return t("reports.tip.stat", {
      correct: row.correct,
      total: row.total,
      mastery: t(`reports.mastery.${row.mastery}`)
    });
  }

  function describeSpeed(series: AreaSparkSeries): string {
    return t("reports.tip.speed", { label: series.label, averageMs: n(series.average) });
  }

  function toggle(id: string): void {
    picked = picked.includes(id) ? picked.filter((entry) => entry !== id) : [...picked, id];
  }

  async function remove(): Promise<void> {
    const ids = chosen.map((report) => report.id);
    await app.removeReports(ids);
    picked = [];
    confirming = false;
  }

  async function save(): Promise<void> {
    try {
      if (!(await exportReports(chosen))) return;
      app.message = "reports.exported";
    } catch {
      app.message = "common.file.writeFailed";
    }
  }

  async function load(): Promise<void> {
    try {
      const result = await importReports();
      if (result === null) return;
      await app.refreshReports();
      app.message = result.skipped === 0 ? "reports.imported" : "reports.importedSome";
    } catch (error) {
      app.message = error instanceof Error ? error.message : "common.file.readFailed";
    }
  }

  type Action = {
    icon: IconName;
    label: string;
    disabled: boolean;
    danger?: boolean;
    run: () => void;
  };

  let acting = $state(false);
  let actionAnchor = $state<HTMLElement | null>(null);

  const actions = $derived<Action[]>([
    { icon: "download", label: t("reports.list.export"), disabled: chosen.length === 0, run: save },
    { icon: "folder-open", label: t("reports.list.import"), disabled: false, run: load },
    {
      icon: "trash",
      label: t("reports.list.remove"),
      disabled: chosen.length === 0,
      danger: true,
      run: () => (confirming = true)
    }
  ]);
</script>

<div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
  <div class="flex flex-col gap-3">
    <ReportFilters bind:query />

    <div class="flex items-center justify-between gap-2">
      <button
        type="button"
        class="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
        disabled={shown.length === 0}
        aria-pressed={allPicked}
        aria-label={t(allPicked ? "reports.list.clearSelection" : "reports.list.selectAll")}
        onclick={() => (picked = allPicked ? [] : shown.map((report) => report.id))}
      >
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded border-2 {picked.length ===
          0
            ? 'border-border'
            : 'border-selected bg-selected-soft text-selected'}"
          aria-hidden="true"
        >
          {#if allPicked}
            <Icon name="check" class="size-3.5" />
          {:else if picked.length > 0}
            <span class="h-0.5 w-2.5 rounded-full bg-selected"></span>
          {/if}
        </span>
        <span class="truncate">
          {picked.length === 0
            ? t("reports.list.shown", { count: shown.length })
            : t("reports.list.pickedOf", { picked: picked.length, total: shown.length })}
        </span>
      </button>

      <span bind:this={actionAnchor} class="inline-flex">
        <Button size="sm" variant="outline" onclick={() => (acting = true)}>
          {t("reports.list.actions")}
          <Icon name="chevron-down" class="size-4" />
        </Button>
      </span>

      {#if acting}
        <Popover
          anchor={actionAnchor}
          width={17}
          label={t("reports.list.actions")}
          closeLabel={t("common.close")}
          onclose={() => (acting = false)}
        >
          {#snippet children(close)}
            <div class="flex flex-col gap-1">
              {#each actions as action (action.label)}
                <button
                  type="button"
                  class="flex h-11 shrink-0 cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-40 {action.danger ===
                  true
                    ? 'text-danger'
                    : ''}"
                  disabled={action.disabled}
                  onclick={() => {
                    close();
                    action.run();
                  }}
                >
                  <Icon name={action.icon} class="size-4.5 shrink-0" />
                  <span class="min-w-0 flex-1">{action.label}</span>
                </button>
              {/each}
            </div>
          {/snippet}
        </Popover>
      {/if}
    </div>

    <div data-section class="flex flex-col gap-3">
      <div
        bind:this={listTop}
        class="sheet ruled rounded-2xl border-2 border-border bg-surface p-2 sm:p-3"
      >
        <ul class="flex flex-col gap-2 p-1">
          {#each pageItems as report (report.id)}
            {@const summary = summarize(report)}
            <li>
              <button
                type="button"
                aria-pressed={picked.includes(report.id)}
                class="flex w-full cursor-pointer flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-colors {picked.includes(
                  report.id
                )
                  ? 'border-selected bg-selected-soft'
                  : 'border-wire bg-surface hover:bg-accent'}"
                onclick={() => toggle(report.id)}
              >
                <span class="text-sm font-semibold">
                  {new Date(report.createdAt).toLocaleString()}
                </span>
                <span class="text-xs text-muted-foreground tabular-nums">
                  {t("reports.entry", { score: n(summary.score), total: n(summary.total) })}
                </span>
                {#if !isCounted(report, app.enabledPackIds)}
                  <span class="flex items-start gap-1.5 text-xs font-bold text-danger">
                    <Icon name="info" class="size-4 shrink-0" />
                    {t("reports.packMissing")}
                  </span>
                {/if}
                <span class="flex flex-wrap gap-1">
                  <Badge tone="outline">{report.settings.level}</Badge>
                  <Badge tone="outline">{t(`common.format.${report.settings.format}`)}</Badge>
                  <Badge tone="outline">{t(`common.answerStyle.${report.settings.answerStyle}`)}</Badge>
                </span>
              </button>
            </li>
          {:else}
            <li><EmptyState icon="sprout" title={t("reports.none")} /></li>
          {/each}
        </ul>
      </div>
    </div>

    <Pagination
      bind:page
      {pages}
      class="[&_button]:h-20"
      label={t("reports.pages.label")}
      previousLabel={t("reports.pages.previous")}
      nextLabel={t("reports.pages.next")}
      describe={(at, total) => t("reports.pages.at", { page: at, pages: total })}
      onpick={() => listTop?.scrollIntoView({ block: "nearest" })}
    />
  </div>

  <div class="flex flex-col gap-5">
    <div
      data-section
      class="sheet ruled flex flex-col gap-4 rounded-2xl border-2 border-border bg-sidebar p-4 sm:p-5"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
          <span class="text-h2 leading-tight font-bold">{windowLabel(query.window)}</span>
          {#if tags.length > 0}
            <div class="flex flex-wrap gap-1">
              {#each tags as tag (tag)}
                <Badge tone="outline">{tag}</Badge>
              {/each}
            </div>
          {/if}
        </div>
        <Button
          variant="brand"
          disabled={answers.length === 0}
          onclick={() => app.practiseMistakes(counted)}
        >
          <Icon name="flame" class="size-5 text-seal" />
          {t("reports.practise.button")}
        </Button>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <Stat tone="brand" value={`${n(accuracy)}%`} label={t("reports.stat.accuracy")} />
        <Stat value={n(counted.length)} label={t("reports.stat.runs")} />
        <Stat value={n(answers.length)} label={t("reports.stat.answers")} />
      </div>

      {#if app.message !== ""}
        <p class="text-xs font-bold text-success">{t(app.message)}</p>
      {/if}
    </div>

    <Card
      title={t("reports.diagnosis.kanji.title")}
      description={t("reports.diagnosis.kanji.description")}
    >
      {#snippet icon()}<Icon name="target" class="size-5" />{/snippet}
      <AccuracyGrid
        rows={kanjiRows}
        limit={24}
        labels={masteryLabels()}
        describe={describeStat}
        empty={t("reports.diagnosis.kanji.empty")}
      />
    </Card>

    <Card
      title={t("reports.diagnosis.sets.title")}
      description={t("reports.diagnosis.sets.description")}
    >
      {#snippet icon()}<Icon name="sprout" class="size-5" />{/snippet}
      <BulletGraph
        rows={setRows}
        labels={masteryLabels()}
        describe={describeStat}
        empty={t("reports.diagnosis.sets.empty")}
      />
    </Card>

    <Card
      title={t("reports.diagnosis.formats.title")}
      description={t("reports.diagnosis.formats.description")}
    >
      {#snippet icon()}<Icon name="sliders" class="size-5" />{/snippet}
      <TreeTable
        groups={formatTreeRows}
        columns={{
          group: t("reports.diagnosis.formats.columns.group"),
          accuracy: t("reports.diagnosis.formats.columns.accuracy"),
          bar: t("reports.diagnosis.formats.columns.bar"),
          score: t("reports.diagnosis.formats.columns.score")
        }}
        empty={t("reports.diagnosis.formats.empty")}
      />
    </Card>

    <Card
      title={t("reports.diagnosis.mistakes.title")}
      description={t("reports.diagnosis.mistakes.description")}
    >
      {#snippet icon()}<Icon name="flame" class="size-5" />{/snippet}
      <MissBoard sections={missSections} empty={t("reports.diagnosis.mistakes.empty")} />
    </Card>

    <Card
      title={t("reports.diagnosis.time.title")}
      description={t("reports.diagnosis.time.description")}
    >
      {#snippet icon()}<Icon name="info" class="size-5" />{/snippet}
      <AreaSparkGrid
        groups={speedGroups}
        empty={t("reports.diagnosis.time.empty")}
        unit="ms"
        describeSeries={describeSpeed}
      />
    </Card>
  </div>
</div>

{#if confirming}
  <ConfirmDialog
    title={t("reports.confirmTitle")}
    confirmLabel={t("common.delete")}
    cancelLabel={t("common.keep")}
    closeLabel={t("common.close")}
    onconfirm={remove}
    oncancel={() => (confirming = false)}
  >
    {t("reports.confirmBody", { count: n(chosen.length) })}
  </ConfirmDialog>
{/if}
