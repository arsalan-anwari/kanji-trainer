<script lang="ts">
  import { Button, Card, Chip, EmptyState, Glyph, Icon, roving } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { WORD_SHAPES } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
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

  <Card title={t("setup.level.title")} description={t("setup.level.description")}>
    {#snippet icon()}<Icon name="trophy" class="size-5" />{/snippet}
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
  </Card>

  <Card title={t("setup.wordShapes.title")} description={t("setup.wordShapes.description")}>
    {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
    <div class="flex flex-col gap-3">
      <div role="group" aria-label={t("setup.wordShapes.title")} class="flex flex-wrap gap-2">
        {#each WORD_SHAPES as shape (shape)}
          <Chip
            size="sm"
            active={app.settings.wordShapes.includes(shape)}
            title={t(`setup.wordShapes.${shape}`)}
            onclick={() => {
              const current = new Set(app.settings.wordShapes);
              if (current.has(shape)) {
                current.delete(shape);
              } else {
                current.add(shape);
              }
              app.updateSettings({ wordShapes: [...current] });
            }}
          >
            {t(`common.wordShapes.${shape}`)}
          </Chip>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">
        {t("setup.wordShapes.hint")}
      </p>
    </div>
  </Card>

  {#each app.wordGroups as group (group.character)}
    {@const ids = group.words.map((word) => word.id)}
    {@const taken = ids.filter((id) => !app.excludedWords.has(id)).length}
    <Card
      title={group.character}
      description={t("setup.words.taken", { taken: n(taken), total: n(ids.length) })}
    >
      {#snippet action()}
        <Button size="sm" variant="outline" onclick={() => app.selectWords(ids)}>
          <Icon name="select-all" />
          {t("setup.words.selectAll")}
        </Button>
        <Button size="sm" variant="outline" onclick={() => app.clearWords(ids)}>
          <Icon name="select-none" />
          {t("setup.words.clear")}
        </Button>
      {/snippet}
      <div
        use:roving
        role="group"
        aria-label={t("setup.words.group", { character: group.character })}
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
    </Card>
  {:else}
    <EmptyState icon="target" title={t("setup.words.empty")} />
  {/each}
</div>
