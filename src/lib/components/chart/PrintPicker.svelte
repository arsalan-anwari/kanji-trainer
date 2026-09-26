<script lang="ts">
  import ExpandAllButton from "../setup/ExpandAllButton.svelte";
  import { Button, Chip, EmptyState, Icon, Popover } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { groupWordsBySet } from "../../content/sets";
  import { GRID_SIZES, pageCount } from "../../print/pdf";
  import { printJob } from "../../print/job.svelte";
  import WordFilterPanel from "./WordFilterPanel.svelte";
  import WordToggleTree from "../setup/WordToggleTree.svelte";
  import { n, t } from "../../i18n.svelte";

  let anchor = $state<HTMLElement | null>(null);
  let asking = $state(false);
  let size = $state<number | "all">(3);

  const sizes = $derived(size === "all" ? GRID_SIZES : [size]);
  const pages = $derived(sizes.reduce((sum, each) => sum + pageCount(app.printWords.length, each), 0));

  const tree = $derived(groupWordsBySet(app.charted));
  const openByDefault = $derived(app.chartFilter.search.trim() !== "" || tree.length === 1);
  const chartedIds = $derived(app.charted.map((word) => word.id));

  function start(): void {
    asking = false;
    void printJob.start(app.printWords, sizes);
    app.go("chart");
  }
</script>

<div class="flex flex-col gap-4">
  <div
    data-section
    class="sheet ruled flex flex-col gap-3 rounded-2xl border-2 border-border bg-sidebar p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-h2 leading-tight font-bold">{t("chart.export.title")}</span>
      <span class="text-sm text-muted-foreground">
        {t("chart.export.selected", { count: n(app.printWords.length) })}
      </span>
    </div>
    <div class="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" onclick={() => app.go("chart")}>
        <Icon name="chevron-left" />
        {t("chart.export.back")}
      </Button>
      <ExpandAllButton />
      <span bind:this={anchor}>
        <Button
          variant="brand"
          disabled={app.printWords.length === 0 || printJob.busy}
          onclick={() => (asking = true)}
        >
          <Icon name="download" />
          {t("chart.export.pdf")}
        </Button>
      </span>
    </div>
  </div>

  {#if printJob.busy}
    <p class="text-sm font-semibold text-muted-foreground">{t("chart.export.busyNote")}</p>
  {/if}

  <WordFilterPanel
    filter={app.chartFilter}
    words={app.words}
    levels={app.levels}
    onchange={(filter) => (app.chartFilter = filter)}
  >
    {#snippet actions()}
      <Button
        size="sm"
        variant="outline"
        disabled={app.printWords.length === app.charted.length}
        onclick={() => app.setPrintWords(chartedIds, true)}
      >
        <Icon name="select-all" />
        {t("setup.words.selectAll")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={app.printWords.length === 0}
        onclick={() => app.setPrintWords(chartedIds, false)}
      >
        <Icon name="select-none" />
        {t("setup.words.unselectAll")}
      </Button>
    {/snippet}
  </WordFilterPanel>

  <WordToggleTree
    {tree}
    {openByDefault}
    isOn={(id) => !app.printExcluded.has(id)}
    ontoggle={(id) => app.togglePrintWord(id)}
    onset={(ids, on) => app.setPrintWords(ids, on)}
  />
  {#if tree.length === 0}
    <EmptyState icon="target" title={t("chart.empty")} />
  {/if}
</div>

{#if asking}
  <Popover
    {anchor}
    width={20}
    label={t("chart.export.grid.title")}
    closeLabel={t("common.close")}
    onclose={() => (asking = false)}
  >
    {#snippet children(close)}
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{t("chart.export.grid.description")}</p>
        <div role="group" aria-label={t("chart.export.grid.title")} class="grid grid-cols-5 gap-2">
          {#each GRID_SIZES as option (option)}
            <Chip size="sm" active={size === option} onclick={() => (size = option)}>
              {t("chart.export.grid.size", { size: option })}
            </Chip>
          {/each}
          <Chip size="sm" active={size === "all"} onclick={() => (size = "all")}>
            {t("chart.export.grid.all")}
          </Chip>
        </div>
        <p class="text-sm font-semibold tabular-nums" aria-live="polite">
          {size === "all"
            ? t("chart.export.grid.pagesAll", {
                cards: n(app.printWords.length),
                files: n(sizes.length),
                pages: n(pages)
              })
            : t("chart.export.grid.pages", { cards: n(app.printWords.length), pages: n(pages) })}
        </p>
        <div class="flex gap-2">
          <Button variant="outline" full onclick={close}>{t("common.cancel")}</Button>
          <Button variant="brand" full onclick={start}>{t("chart.export.grid.start")}</Button>
        </div>
      </div>
    {/snippet}
  </Popover>
{/if}
