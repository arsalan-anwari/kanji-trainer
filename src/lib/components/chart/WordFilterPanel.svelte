<script lang="ts">
  import { Chip, Icon } from "kaizen-ui";
  import type { Snippet } from "svelte";
  import {
    countBySet,
    SET_IDS,
    subcategoriesBySet,
    subcategoryKey
  } from "../../content/sets";
  import type { Word } from "../../content/types";
  import { atLevel } from "../../quiz/questions";
  import { WORD_SHAPES } from "../../quiz/settings";
  import {
    activeFilterCount,
    toggled,
    toggleFilterSet,
    type WordFilter
  } from "../../browse/cards";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

  let {
    filter,
    words,
    levels,
    onchange,
    actions
  }: {
    filter: WordFilter;
    words: readonly Word[];
    levels: readonly string[];
    onchange: (filter: WordFilter) => void;
    actions?: Snippet;
  } = $props();

  const levelWords = $derived(atLevel(words, filter.level));
  const setCounts = $derived(countBySet(levelWords));
  const offered = $derived(subcategoriesBySet(levelWords));
  const packs = $derived([...new Set(levelWords.map((word) => word.pack))]);
  const active = $derived(activeFilterCount(filter));
</script>

<section data-section class="rounded-2xl border-2 border-border bg-surface">
  <div class="flex flex-wrap items-center gap-2 px-4 py-3 font-bold">
    <Icon name="filter" class="size-4" />
    <span>{t("setup.words.filters")}</span>
    {#if active > 0}
      <span
        class="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] tabular-nums text-brand-foreground"
      >
        {active}
      </span>
    {/if}
    {#if actions}
      <div class="ml-auto flex flex-wrap gap-2 font-normal">{@render actions()}</div>
    {/if}
  </div>
  <div class="flex flex-col gap-3 border-t-2 border-border px-4 py-4">
    <input
      type="text"
      value={filter.search}
      oninput={(event) => onchange({ ...filter, search: event.currentTarget.value })}
      placeholder={t("setup.words.search")}
      aria-label={t("setup.words.search")}
      autocomplete="off"
      class="w-full rounded-lg border-2 border-wire bg-surface px-3.5 py-2 text-sm focus-visible:border-selected focus-visible:outline-none"
    />

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-bold text-muted-foreground">{t("setup.level.title")}</span>
      <div role="group" aria-label={t("setup.level.title")} class="flex flex-wrap gap-2">
        {#each LEVELS as level (level)}
          {@const known = levels.includes(level)}
          <Chip
            size="sm"
            disabled={!known}
            active={filter.level === level}
            title={known ? level : t("setup.level.unavailable", { level })}
            onclick={() => onchange({ ...filter, level, sets: [], subcategories: [], packs: [] })}
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
            active={filter.shapes.includes(shape)}
            title={t(`setup.wordShapes.${shape}`)}
            onclick={() => onchange({ ...filter, shapes: toggled(filter.shapes, shape) })}
          >
            {t(`common.wordShapes.${shape}`)}
          </Chip>
        {/each}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-bold text-muted-foreground">{t("setup.words.packs")}</span>
      <div role="group" aria-label={t("setup.words.packs")} class="flex flex-wrap gap-2">
        {#each packs as pack (pack)}
          <Chip
            size="sm"
            active={filter.packs.includes(pack)}
            onclick={() => onchange({ ...filter, packs: toggled(filter.packs, pack) })}
          >
            {app.packTitle(pack)}
          </Chip>
        {/each}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-bold text-muted-foreground">{t("setup.words.category")}</span>
      <div role="group" aria-label={t("setup.words.category")} class="flex flex-wrap gap-2">
        {#each SET_IDS.filter((id) => setCounts[id] > 0) as id (id)}
          <Chip
            size="sm"
            active={filter.sets.includes(id)}
            onclick={() => onchange(toggleFilterSet(filter, id))}
          >
            {t(`common.set.${id}`)}
          </Chip>
        {/each}
      </div>
    </div>

    {#each filter.sets as set (set)}
      <div class="flex flex-wrap items-center gap-2 pl-5">
        <Icon name="chevron-down" class="size-3.5 -rotate-90 text-muted-foreground" />
        <span class="text-xs font-bold text-muted-foreground">{t(`common.set.${set}`)}</span>
        <div role="group" aria-label={t(`common.set.${set}`)} class="flex flex-wrap gap-2">
          {#each offered[set] as sub (sub)}
            {@const key = subcategoryKey(set, sub)}
            <Chip
              size="sm"
              active={filter.subcategories.includes(key)}
              onclick={() =>
                onchange({ ...filter, subcategories: toggled(filter.subcategories, key) })}
            >
              {t(`common.subcategory.${sub}`)}
            </Chip>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>
