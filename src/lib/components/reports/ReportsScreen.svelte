<script lang="ts">
  import { Badge, Button, Card, ConfirmDialog, EmptyState, Icon, Stat } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { summarize } from "../../quiz/report";
  import { ANY_QUERY, queryReports, type ReportQuery } from "../../quiz/query";
  import ReportFilters from "./ReportFilters.svelte";
  import { n, t } from "../../i18n.svelte";

  let query = $state<ReportQuery>({ ...ANY_QUERY });
  let picked = $state<string[]>([]);
  let confirming = $state(false);

  const shown = $derived(queryReports(app.reports, query));
  const chosen = $derived(
    picked.length === 0 ? shown : shown.filter((report) => picked.includes(report.id))
  );
  const answers = $derived(chosen.flatMap((report) => report.answers));
  const right = $derived(answers.filter((answer) => answer.correct).length);
  const accuracy = $derived(answers.length === 0 ? 0 : Math.round((right / answers.length) * 100));
  const allPicked = $derived(
    shown.length > 0 && shown.every((report) => picked.includes(report.id))
  );

  function toggle(id: string): void {
    picked = picked.includes(id) ? picked.filter((entry) => entry !== id) : [...picked, id];
  }

  function remove(): void {
    const ids = chosen.map((report) => report.id);
    app.removeReports(ids);
    picked = [];
    confirming = false;
  }
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
        {picked.length === 0
          ? t("reports.runs", { count: n(shown.length) })
          : t("reports.selected", { count: n(picked.length) })}
      </button>

      <Button
        size="sm"
        variant="ghost"
        disabled={chosen.length === 0}
        onclick={() => (confirming = true)}
      >
        <Icon name="trash" />
        {t("reports.list.remove")}
      </Button>
    </div>

    <ul class="flex flex-col gap-2">
      {#each shown as report (report.id)}
        {@const summary = summarize(report)}
        <li>
          <button
            type="button"
            aria-pressed={picked.includes(report.id)}
            class="flex w-full cursor-pointer flex-col gap-1 rounded-xl border-2 px-3 py-2 text-left transition-colors {picked.includes(
              report.id
            )
              ? 'border-selected bg-selected-soft'
              : 'border-wire bg-surface hover:bg-accent'}"
            onclick={() => toggle(report.id)}
          >
            <span class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-semibold">
                {new Date(report.createdAt).toLocaleString()}
              </span>
              <span class="text-sm font-bold tabular-nums">
                {t("reports.entry", { score: n(summary.score), total: n(summary.total) })}
              </span>
            </span>
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

  <div class="flex flex-col gap-5">
    <div
      data-section
      class="sheet ruled flex flex-col gap-4 rounded-2xl border-2 border-border bg-sidebar p-4 sm:p-5"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-h2 leading-tight font-bold">{t("reports.title")}</span>
        <span class="text-sm text-muted-foreground">{t("reports.description")}</span>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <Stat tone="brand" value={`${n(accuracy)}%`} label={t("reports.stat.accuracy")} />
        <Stat value={n(chosen.length)} label={t("reports.stat.runs")} />
        <Stat value={n(answers.length)} label={t("reports.stat.answers")} />
      </div>

      {#if app.message !== ""}
        <p class="text-xs font-bold text-success">{t(app.message)}</p>
      {/if}
    </div>

    <Card title={t("reports.soon.title")} description={t("reports.soon.description")}>
      {#snippet icon()}<Icon name="trophy" class="size-5" />{/snippet}
      <EmptyState icon="target" title={t("reports.soon.empty")} />
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
