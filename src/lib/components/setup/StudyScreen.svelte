<script lang="ts">
  import { Button, Card, EmptyState, Glyph, Icon } from "kaizen-ui";
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
    <Card
      title={t(`common.set.${group.id}`)}
      description={t("common.words", { count: n(group.words.length) })}
    >
      {#snippet icon()}<Icon name="sprout" class="size-5" />{/snippet}
      <div class="flex flex-col gap-4">
        {#each group.byKanji as kanji (kanji.character)}
          <section class="flex flex-col gap-2">
            <h4 class="flex items-baseline gap-2 border-b border-wire pb-1">
              <Glyph text={kanji.character} class="text-h4 font-bold" />
              <span class="text-xs text-muted-foreground">
                {t("common.words", { count: n(kanji.words.length) })}
              </span>
            </h4>
            <ul class="grid gap-2 sm:grid-cols-2">
              {#each kanji.words as word (word.id)}
                <li class="flex flex-col gap-0.5 rounded-lg border border-wire bg-surface px-3 py-2">
                  <span class="flex flex-wrap items-baseline gap-x-2">
                    <Glyph text={word.written} class="text-lg font-bold" />
                    <Glyph text={word.reading} class="text-sm text-muted-foreground" />
                  </span>
                  <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </Card>
  {:else}
    <EmptyState icon="target" title={t("setup.study.empty")} />
  {/each}
</div>
