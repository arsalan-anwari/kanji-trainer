<script lang="ts">
  import { Button, Chip, EmptyState, Icon } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import SetRow from "./SetRow.svelte";
  import { n, t } from "../../i18n.svelte";

  // Every JLPT level, so the ones this build has no content for are visible and
  // plainly switched off rather than missing.
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

  const chosen = $derived(app.settings.sets.length === 0 ? 0 : app.selectedKanji.size);
  const total = $derived(app.kanjiOfChosenSets.length);
</script>

<div class="flex flex-col gap-4">
  <PresetPicker />

  <div class="flex flex-col gap-1.5">
    <span class="text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase">
      {t("setup.level.title")}
    </span>
    <div role="group" aria-label={t("setup.level.title")} class="flex flex-wrap gap-1.5">
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
    <Button size="sm" variant="outline" onclick={() => app.selectAllSets()}>
      <Icon name="select-all" />
      {t("setup.kanji.selectAll")}
    </Button>
    <Button size="sm" variant="outline" onclick={() => app.clearSets()}>
      <Icon name="select-none" />
      {t("setup.kanji.clear")}
    </Button>
    <span class="ml-auto text-xs tabular-nums text-muted-foreground">
      {t("setup.kanji.chosen", { count: n(chosen), total: n(total) })}
    </span>
  </div>

  <div class="flex flex-col gap-2 sm:gap-3">
    {#each app.availableSets as id (id)}
      <SetRow {id} kanji={app.kanjiInSet[id]} />
    {:else}
      <EmptyState icon="target" title={t("setup.kanji.empty")} />
    {/each}
  </div>

  <p class="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
    <Icon name="info" class="mt-0.5 size-3.5 shrink-0" />
    {t("setup.kanji.wholeWord")}
  </p>
</div>
