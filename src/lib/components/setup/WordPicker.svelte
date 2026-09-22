<script lang="ts">
  import { Button, Card, Chip, EmptyState, Glyph, Icon, TextField, roving } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { groupWordsBySet } from "../../content/sets";
  import { WORD_SHAPES } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const SHOWN = ["all", "kept", "held"] as const;

  let search = $state("");
  let shown = $state<(typeof SHOWN)[number]>("all");

  const needle = $derived(search.trim().toLowerCase());

  const visible = $derived(
    app.selectableWords.filter((word) => {
      const held = app.excludedWords.has(word.id);
      if (shown === "kept" && held) return false;
      if (shown === "held" && !held) return false;
      if (needle === "") return true;
      return [word.written, ...word.readings, ...word.glosses].some((text) =>
        text.toLowerCase().includes(needle)
      );
    })
  );

  // One collapsed row per set instead of one card per subcategory: the long
  // list is what makes this page crawl on WebKitGTK.
  const tree = $derived(groupWordsBySet(visible));

  // Nothing to hunt through when a search is on or a single set is in play.
  const openByDefault = $derived(needle !== "" || tree.length === 1);

  function toggleShape(shape: (typeof WORD_SHAPES)[number]): void {
    const current = new Set(app.settings.wordShapes);
    if (current.has(shape)) current.delete(shape);
    else current.add(shape);
    app.updateSettings({ wordShapes: [...current] });
  }
</script>

<div class="flex flex-col gap-4">
  <div
    data-section
    class="sheet ruled flex flex-col gap-3 rounded-2xl border-2 border-border bg-sidebar p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-h2 leading-tight font-bold">{t("setup.words.title")}</span>
      <span class="text-sm text-muted-foreground">
        {t("setup.words.inPlay", { count: n(app.eligibleCount) })}
      </span>
    </div>
    <div class="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" onclick={() => app.go("setup")}>
        <Icon name="chevron-left" />
        {t("setup.words.back")}
      </Button>
      <Button
        variant="outline"
        disabled={app.settings.excludedWords.length === 0}
        onclick={() => app.resetWords()}
      >
        <Icon name="restore" />
        {t("setup.words.reset")}
      </Button>
    </div>
  </div>

  <Card title={t("setup.words.filters")} description={t("setup.words.filtersHint")}>
    {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
    <div class="flex flex-col gap-3">
      <TextField bind:value={search} label={t("setup.words.search")} placeholder={t("setup.words.search")} />

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold text-muted-foreground">{t("setup.level.title")}</span>
        <div role="group" aria-label={t("setup.level.title")} class="flex flex-wrap gap-2">
          {#each LEVELS as level (level)}
            {@const known = app.levels.includes(level)}
            <Chip
              size="sm"
              disabled={!known}
              active={app.settings.level === level}
              title={known ? level : t("setup.level.unavailable", { level })}
              onclick={() => app.updateSettings({ level })}
            >
              {level}
            </Chip>
          {/each}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold text-muted-foreground">{t("setup.wordShapes.title")}</span>
        <div role="group" aria-label={t("setup.wordShapes.title")} class="flex flex-wrap gap-2">
          {#each WORD_SHAPES as shape (shape)}
            <Chip
              size="sm"
              active={app.settings.wordShapes.includes(shape)}
              title={t(`setup.wordShapes.${shape}`)}
              onclick={() => toggleShape(shape)}
            >
              {t(`common.wordShapes.${shape}`)}
            </Chip>
          {/each}
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold text-muted-foreground">{t("setup.words.shown")}</span>
        <div role="group" aria-label={t("setup.words.shown")} class="flex flex-wrap gap-2">
          {#each SHOWN as option (option)}
            <Chip size="sm" active={shown === option} onclick={() => (shown = option)}>
              {t(`setup.words.shown-${option}`)}
            </Chip>
          {/each}
        </div>
      </div>
    </div>
  </Card>

  {#each tree as branch (branch.set)}
    {@const ids = branch.groups.flatMap((group) => group.words.map((word) => word.id))}
    {@const taken = ids.filter((id) => !app.excludedWords.has(id)).length}
    {@const label = t(`common.set.${branch.set}`)}
    <details
      data-section
      open={openByDefault}
      class="rounded-2xl border-2 border-border bg-surface"
    >
      <summary
        class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden"
      >
        <span>{label}</span>
        <span class="text-sm font-normal tabular-nums text-muted-foreground">
          {t("setup.words.taken", { taken: n(taken), total: n(ids.length) })}
        </span>
        <Icon name="chevron-down" class="ml-auto size-4 text-muted-foreground" />
      </summary>

      <div class="flex flex-col gap-4 border-t-2 border-border px-4 py-4">
        {#each branch.groups as group (group.subcategory)}
          {@const groupIds = group.words.map((word) => word.id)}
          {@const groupLabel = t(`common.subcategory.${group.subcategory}`)}
          <section class="flex flex-col gap-2">
            <h4 class="flex flex-wrap items-baseline gap-2 border-b border-wire pb-1">
              <span class="font-bold">{groupLabel}</span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {t("setup.words.taken", {
                  taken: n(groupIds.filter((id) => !app.excludedWords.has(id)).length),
                  total: n(groupIds.length)
                })}
              </span>
              <span class="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onclick={() => app.selectWords(groupIds)}>
                  <Icon name="select-all" />
                  {t("setup.words.selectAll")}
                </Button>
                <Button size="sm" variant="outline" onclick={() => app.clearWords(groupIds)}>
                  <Icon name="select-none" />
                  {t("setup.words.clear")}
                </Button>
              </span>
            </h4>
            <div
              use:roving
              role="group"
              aria-label={t("setup.words.group", { label: groupLabel })}
              class="grid gap-2 sm:grid-cols-2"
            >
              {#each group.words as word (word.id)}
                {@const on = !app.excludedWords.has(word.id)}
                <button
                  type="button"
                  aria-pressed={on}
                  class="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {on
                    ? 'border-selected bg-selected-soft'
                    : 'border-wire bg-surface opacity-50 hover:bg-accent'}"
                  onclick={() => app.toggleWord(word.id)}
                >
                  <span class="flex flex-wrap items-baseline gap-x-2">
                    <Glyph text={word.written} class="text-lg font-bold" />
                    <Glyph text={word.reading} class="text-sm text-muted-foreground" />
                  </span>
                  <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </details>
  {:else}
    <EmptyState icon="target" title={t(needle === "" ? "setup.words.empty" : "setup.words.noMatch")} />
  {/each}
</div>
