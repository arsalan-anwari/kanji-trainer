<script lang="ts">
  import { Chip, Glyph, RowBar, roving, viewport } from "kaizen-ui";
  import type { SetId } from "../../content/sets";
  import { app } from "../../state.svelte";
  import { n, t } from "../../i18n.svelte";

  let { id, kanji }: { id: SetId; kanji: string[] } = $props();

  const on = $derived(app.settings.sets.includes(id));
  const taken = $derived(on ? kanji.filter((character) => app.selectedKanji.has(character)).length : 0);
  const label = $derived(t(`common.set.${id}`));

  // Matches the Chip md min width so a tile never outgrows its cell.
  const tracks = "repeat(auto-fill, minmax(3.5rem, 1fr))";
</script>

{#snippet tiles()}
  {#each kanji as character (character)}
    <Chip
      class="w-full min-w-0"
      disabled={!on}
      active={on && app.selectedKanji.has(character)}
      title={t("setup.kanji.wordCount", { count: n(app.wordCounts[character] ?? 0) })}
      onclick={() => app.toggleKanji(character)}
    >
      <span class="flex flex-col items-center leading-none">
        <Glyph text={character} class="text-lg" />
        <span class="text-[0.625rem] font-medium opacity-70">
          {n(app.wordCounts[character] ?? 0)}
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
      <span class="block font-normal tabular-nums opacity-80">{n(taken)}/{n(kanji.length)}</span>
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
    hint="{n(taken)}/{n(kanji.length)}"
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
