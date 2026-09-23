<script lang="ts">
  import { Button, Chip, EmptyState, Glyph, Icon, roving } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import {
    countBySet,
    countBySubcategory,
    groupWordsBySet,
    SET_IDS,
    subcategoryKey,
    SUBCATEGORIES,
    type SetId
  } from "../../content/sets";
  import { WORD_SHAPES } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

  let search = $state("");
  let categoryFilter = $state<SetId[]>([]);
  let subcategoryFilter = $state<string[]>([]);

  const needle = $derived(search.trim().toLowerCase());

  const activeFilters = $derived(
    (search.trim() !== "" ? 1 : 0) +
      (categoryFilter.length > 0 ? 1 : 0) +
      (subcategoryFilter.length > 0 ? 1 : 0)
  );

  // The category filter narrows the pool before the subcategory filter reads
  // it, so the subcategory row only ever offers pairs that still hold a word.
  const categoryScoped = $derived(
    app.selectableWords.filter(
      (word) => categoryFilter.length === 0 || categoryFilter.includes(word.set)
    )
  );

  const categoryCounts = $derived(countBySet(app.selectableWords));
  const subcategoryCounts = $derived(countBySubcategory(categoryScoped));

  const visible = $derived(
    categoryScoped.filter((word) => {
      if (subcategoryFilter.length > 0 && !subcategoryFilter.includes(word.subcategory))
        return false;
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

  function toggleCategory(id: SetId): void {
    const current = new Set(categoryFilter);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    categoryFilter = [...current];

    // Drop any subcategory no longer offered by a still-selected category.
    const stillOffered = new Set(
      categoryFilter.flatMap((set) => SUBCATEGORIES[set] as readonly string[])
    );
    subcategoryFilter = subcategoryFilter.filter((sub) => stillOffered.has(sub));
  }

  function toggleSubcategory(sub: string): void {
    const current = new Set(subcategoryFilter);
    if (current.has(sub)) current.delete(sub);
    else current.add(sub);
    subcategoryFilter = [...current];
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
        disabled={app.eligibleCount === 0}
        onclick={() => app.clearWords(app.selectableWords.map((word) => word.id))}
      >
        <Icon name="select-none" />
        {t("setup.words.unselectAll")}
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

  <details data-section class="rounded-2xl border-2 border-border bg-surface">
    <summary
      class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden"
    >
      <Icon name="filter" class="size-4" />
      <span>{t("setup.words.filters")}</span>
      {#if activeFilters > 0}
        <span
          class="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] tabular-nums text-brand-foreground"
        >
          {activeFilters}
        </span>
      {/if}
      <Icon name="chevron-down" class="ml-auto size-4 text-muted-foreground" />
    </summary>
    <div class="flex flex-col gap-3 border-t-2 border-border px-4 py-4">
      <input
        type="text"
        bind:value={search}
        placeholder={t("setup.words.search")}
        aria-label={t("setup.words.search")}
        autocomplete="off"
        class="w-full rounded-lg border-2 border-wire bg-surface px-3.5 py-2 text-sm focus-visible:border-selected focus-visible:outline-none"
      />

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
        <span class="text-xs font-bold text-muted-foreground">{t("setup.words.category")}</span>
        <div role="group" aria-label={t("setup.words.category")} class="flex flex-wrap gap-2">
          {#each SET_IDS as id (id)}
            <Chip
              size="sm"
              disabled={(categoryCounts[id] ?? 0) === 0}
              active={categoryFilter.includes(id)}
              onclick={() => toggleCategory(id)}
            >
              {t(`common.set.${id}`)}
            </Chip>
          {/each}
        </div>
      </div>

      {#each categoryFilter as category (category)}
        <div class="flex flex-wrap items-center gap-2 pl-5">
          <Icon name="chevron-down" class="size-3.5 -rotate-90 text-muted-foreground" />
          <span class="text-xs font-bold text-muted-foreground">{t(`common.set.${category}`)}</span>
          <div
            role="group"
            aria-label={t(`common.set.${category}`)}
            class="flex flex-wrap gap-2"
          >
            {#each SUBCATEGORIES[category] as sub (sub)}
              <Chip
                size="sm"
                disabled={(subcategoryCounts[subcategoryKey(category, sub)] ?? 0) === 0}
                active={subcategoryFilter.includes(sub)}
                onclick={() => toggleSubcategory(sub)}
              >
                {t(`common.subcategory.${sub}`)}
              </Chip>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </details>

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
          <details open={openByDefault} class="rounded-xl border-2 border-border bg-surface">
            <summary
              class="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 font-bold [&::-webkit-details-marker]:hidden"
            >
              <span>{groupLabel}</span>
              <span class="text-xs font-normal tabular-nums text-muted-foreground">
                {t("setup.words.taken", {
                  taken: n(groupIds.filter((id) => !app.excludedWords.has(id)).length),
                  total: n(groupIds.length)
                })}
              </span>
              <span
                role="presentation"
                class="ml-auto flex gap-2"
                onclick={(event) => event.stopPropagation()}
              >
                <Button size="sm" variant="outline" onclick={() => app.selectWords(groupIds)}>
                  <Icon name="select-all" />
                  {t("setup.words.selectAll")}
                </Button>
                <Button size="sm" variant="outline" onclick={() => app.clearWords(groupIds)}>
                  <Icon name="select-none" />
                  {t("setup.words.clear")}
                </Button>
              </span>
              <Icon name="chevron-down" class="size-4 text-muted-foreground" />
            </summary>
            <div
              use:roving
              role="group"
              aria-label={t("setup.words.group", { label: groupLabel })}
              class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 border-t border-wire p-3"
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
                  <span class="flex flex-col">
                    <Glyph text={word.written} class="text-lg font-bold" />
                    <Glyph text={word.reading} class="text-sm text-muted-foreground" />
                  </span>
                  <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
                </button>
              {/each}
            </div>
          </details>
        {/each}
      </div>
    </details>
  {:else}
    <EmptyState icon="target" title={t(needle === "" ? "setup.words.empty" : "setup.words.noMatch")} />
  {/each}
</div>
