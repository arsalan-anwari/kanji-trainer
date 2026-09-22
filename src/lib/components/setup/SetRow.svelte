<script lang="ts">
  import { Chip, RowBar, roving, viewport } from "kaizen-ui";
  import { subcategoryKey, type SetId } from "../../content/sets";
  import { app } from "../../state.svelte";
  import { n, t } from "../../i18n.svelte";

  let { id, subcategories }: { id: SetId; subcategories: string[] } = $props();

  const keys = $derived(subcategories.map((entry) => subcategoryKey(id, entry)));
  const on = $derived(app.settings.sets.includes(id));
  const taken = $derived(on ? keys.filter((key) => app.selectedSubcategories.has(key)).length : 0);
  const label = $derived(t(`common.set.${id}`));

  // Wide enough for a two-word subcategory label without wrapping mid-word.
  const tracks = "repeat(auto-fill, minmax(8.5rem, 1fr))";
</script>

{#snippet tiles()}
  {#each subcategories as subcategory, index (subcategory)}
    {@const key = keys[index]}
    <Chip
      size="sm"
      class="w-full min-w-0"
      disabled={!on}
      active={on && app.selectedSubcategories.has(key)}
      title={t("setup.sets.count", { count: n(app.subcategoryCounts[key] ?? 0) })}
      onclick={() => app.toggleSubcategory(key)}
    >
      <span class="flex w-full min-w-0 items-baseline justify-between gap-2">
        <span class="min-w-0 truncate">{t(`common.subcategory.${subcategory}`)}</span>
        <span class="shrink-0 text-[0.625rem] font-medium tabular-nums opacity-70">
          {n(app.subcategoryCounts[key] ?? 0)}
        </span>
      </span>
    </Chip>
  {/each}
{/snippet}

{#if viewport.wide}
  <div class="flex items-start gap-2 sm:gap-3">
    <button
      type="button"
      class="h-12 w-24 shrink-0 cursor-pointer rounded-lg border-2 px-1 text-[0.6875rem] font-bold transition-colors {on
        ? 'border-selected bg-selected text-background'
        : 'border-border bg-surface text-muted-foreground hover:bg-accent'}"
      aria-pressed={on}
      onclick={() => app.toggleSet(id)}
    >
      <span class="block">{label}</span>
      <span class="block font-normal tabular-nums opacity-80">
        {n(taken)}/{n(subcategories.length)}
      </span>
    </button>
    <div
      use:roving
      class="grid min-w-0 flex-1 gap-1.5 sm:gap-2"
      style="grid-template-columns: {tracks}"
    >
      {@render tiles()}
    </div>
  </div>
{:else}
  <RowBar
    {label}
    hint="{n(taken)}/{n(subcategories.length)}"
    active={on}
    expandLabel={t("common.show", { label })}
    collapseLabel={t("common.hide", { label })}
    onpress={() => app.toggleSet(id)}
  >
    <div use:roving class="grid gap-1.5" style="grid-template-columns: {tracks}">
      {@render tiles()}
    </div>
  </RowBar>
{/if}
