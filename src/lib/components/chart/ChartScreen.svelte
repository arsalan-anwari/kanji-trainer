<script lang="ts">
  import ExpandAllButton from "../setup/ExpandAllButton.svelte";
  import { Button, EmptyState, Icon, Progress, roving } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { groupWordsBySet } from "../../content/sets";
  import { cardFace } from "../../browse/cards";
  import { audioUrl, imageUrl } from "../../quiz/hints";
  import { printJob, type PrintFile } from "../../print/job.svelte";
  import { savePdf, savePdfs } from "../../storage";
  import FlashCard from "./FlashCard.svelte";
  import WordFilterPanel from "./WordFilterPanel.svelte";
  import SetIcon from "../setup/SetIcon.svelte";
  import { n, t } from "../../i18n.svelte";

  const tree = $derived(groupWordsBySet(app.charted));
  const openByDefault = $derived(tree.length === 1);

  let opened = $state<Record<string, boolean>>({});
  let saveMessage = $state("");
  let saveFailed = $state(false);

  const job = $derived(printJob.job);

  const fileName = (size: number): string =>
    `kanji-flashcards-${new Date().toISOString().slice(0, 10)}-${size}x${size}.pdf`;

  async function download(files: readonly PrintFile[]): Promise<void> {
    try {
      const saved =
        files.length === 1
          ? await savePdf(files[0].pdf, fileName(files[0].size))
          : await savePdfs(files.map((file) => ({ name: fileName(file.size), bytes: file.pdf })));
      if (saved) {
        saveMessage = files.length === 1 ? "chart.export.saved" : "chart.export.savedAll";
        saveFailed = false;
      }
    } catch {
      saveMessage = "common.file.writeFailed";
      saveFailed = true;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div
    data-section
    class="sheet ruled flex flex-col gap-3 rounded-2xl border-2 border-border bg-sidebar p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-h2 leading-tight font-bold">{t("chart.title")}</span>
    </div>
    <div class="flex shrink-0 flex-wrap gap-2">
      <ExpandAllButton />
      <Button variant="brand" disabled={app.charted.length === 0} onclick={() => app.go("print")}>
        <Icon name="download" />
        {t("chart.export.open")}
      </Button>
    </div>
  </div>

  {#if job.state !== "idle"}
    <div
      data-section
      class="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="font-bold" aria-live="polite">
          {t(
            job.state === "ready" && job.files.length > 1
              ? "chart.export.state.readyAll"
              : `chart.export.state.${job.state}`
          )}
        </span>
        {#if job.state === "running"}
          <Progress
            value={job.total === 0 ? 0 : job.done / job.total}
            label={t("chart.export.progress", { done: n(job.done), total: n(job.total) })}
          />
          <span class="text-xs tabular-nums text-muted-foreground">
            {t("chart.export.progress", { done: n(job.done), total: n(job.total) })}
          </span>
        {:else if job.state === "ready"}
          <span class="text-sm text-muted-foreground">
            {#if job.files.length === 1}
              {t("chart.export.summary", {
                cards: n(job.cards),
                pages: n(job.files[0].pages),
                size: job.files[0].size
              })}
            {:else}
              {t("chart.export.summaryAll", {
                cards: n(job.cards),
                files: n(job.files.length),
                grids: job.files.map((file) => t("chart.export.grid.size", { size: file.size })).join(", ")
              })}
            {/if}
          </span>
          {#if saveMessage !== ""}
            <span
              class="text-xs font-bold {saveFailed ? 'text-danger' : 'text-success'}"
              role="status"
            >
              {t(saveMessage)}
            </span>
          {/if}
        {/if}
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        {#if job.state === "running"}
          <Button variant="outline" onclick={() => printJob.cancel()}>
            <Icon name="close" />
            {t("common.cancel")}
          </Button>
        {:else}
          {#if job.state === "ready"}
            <Button variant="brand" onclick={() => download(job.files)}>
              <Icon name="download" />
              {t(job.files.length === 1 ? "chart.export.download" : "chart.export.downloadAll")}
            </Button>
          {/if}
          <Button
            variant="outline"
            onclick={() => {
              saveMessage = "";
              printJob.discard();
            }}
          >
            <Icon name="trash" />
            {t("chart.export.discard")}
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <WordFilterPanel
    filter={app.chartFilter}
    words={app.words}
    levels={app.levels}
    onchange={(filter) => (app.chartFilter = filter)}
  />

  {#each tree as branch (branch.set)}
    {@const open = opened[branch.set] ?? openByDefault}
    {@const count = branch.groups.reduce((sum, group) => sum + group.words.length, 0)}
    <details
      data-section
      {open}
      ontoggle={(event) => (opened[branch.set] = event.currentTarget.open)}
      class="rounded-2xl border-2 border-border bg-surface"
    >
      <summary
        class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden"
      >
        <SetIcon set={branch.set} />
        <span>{t(`common.set.${branch.set}`)}</span>
        <span class="text-sm font-normal tabular-nums text-muted-foreground">
          {t("common.words", { count: n(count) })}
        </span>
        <Icon name="chevron-down" class="ml-auto size-4 text-muted-foreground" />
      </summary>
      {#if open}
        <div class="flex flex-col gap-4 border-t-2 border-border px-4 py-4">
          {#each branch.groups as group (group.subcategory)}
            {@const groupLabel = t(`common.subcategory.${group.subcategory}`)}
            <section class="flex flex-col gap-2">
              <h3 class="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <SetIcon set={branch.set} subcategory={group.subcategory} />
                {groupLabel}
              </h3>
              <div
                use:roving
                role="group"
                aria-label={groupLabel}
                class="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3"
              >
                {#each group.words as word (word.id)}
                  <FlashCard
                    face={cardFace(word)}
                    image={imageUrl(word)}
                    audio={word.hasAudio ? audioUrl(word) : null}
                  />
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </details>
  {:else}
    <EmptyState icon="target" title={t("chart.empty")} />
  {/each}
</div>
