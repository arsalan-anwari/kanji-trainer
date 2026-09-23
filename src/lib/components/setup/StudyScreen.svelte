<script lang="ts">
  import { Button, EmptyState, Glyph, Icon } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { groupWordsByKanji, SET_IDS, type SetId } from "../../content/sets";
  import { n, t } from "../../i18n.svelte";

  // Grouped the way the picker groups them, so a study pass reads like the set
  // it was built from, and by kanji under that, so a long set stays scannable.
  const grouped = $derived(
    SET_IDS.map((id: SetId) => {
      const words = app.pool.filter((word) => word.set === id);
      return { id, words, byKanji: groupWordsByKanji(words, app.pickerOrder) };
    }).filter((group) => group.words.length > 0)
  );

  // Nothing to collapse when there's only one card to look at.
  const openByDefault = $derived(grouped.length === 1);
</script>

<div class="flex flex-col gap-4">
  <div
    data-section
    class="sheet ruled flex flex-col gap-3 rounded-2xl border-2 border-border bg-sidebar p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
  >
    <div class="flex min-w-0 flex-col gap-1">
      <span class="text-h2 leading-tight font-bold">{t("setup.study.title")}</span>
      <span class="text-sm text-muted-foreground">{t("setup.study.description")}</span>
    </div>
    <div class="flex shrink-0 flex-wrap gap-2">
      <Button variant="outline" onclick={() => app.go("setup")}>
        <Icon name="chevron-left" />
        {t("setup.study.back")}
      </Button>
      <Button variant="brand" disabled={!app.canStart} onclick={() => app.start()}>
        {t("setup.study.start")}
      </Button>
    </div>
  </div>

  {#each grouped as group (group.id)}
    <details data-section open={openByDefault} class="rounded-2xl border-2 border-border bg-surface">
      <summary
        class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden"
      >
        <Icon name="sprout" class="size-4" />
        <span>{t(`common.set.${group.id}`)}</span>
        <span class="text-sm font-normal tabular-nums text-muted-foreground">
          {t("common.words", { count: n(group.words.length) })}
        </span>
        <Icon name="chevron-down" class="ml-auto size-4 text-muted-foreground" />
      </summary>
      <div class="columns-1 gap-3 border-t-2 border-border px-4 py-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {#each group.byKanji as kanji (kanji.character)}
          <div class="mb-3 break-inside-avoid rounded-xl border-2 border-border bg-surface">
            <div class="flex items-center gap-2 px-3 py-2 font-bold">
              <Glyph text={kanji.character} class="text-base" />
              <span class="text-xs font-normal tabular-nums text-muted-foreground">
                {t("common.words", { count: n(kanji.words.length) })}
              </span>
            </div>
            <ul class="grid grid-cols-2 gap-2 border-t border-wire p-3">
              {#each kanji.words as word (word.id)}
                <li class="flex flex-col gap-0.5 rounded-lg border border-wire bg-surface px-3 py-2">
                  <span class="flex flex-col">
                    <Glyph text={word.written} class="text-lg font-bold" />
                    <Glyph text={word.reading} class="text-sm text-muted-foreground" />
                  </span>
                  <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </details>
  {:else}
    <EmptyState icon="target" title={t("setup.study.empty")} />
  {/each}
</div>
