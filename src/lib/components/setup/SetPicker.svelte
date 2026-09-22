<script lang="ts">
  import { Button, EmptyState, Icon } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import SetRow from "./SetRow.svelte";
  import { t } from "../../i18n.svelte";
</script>

<div class="flex flex-col gap-4">
  <PresetPicker />

  <div class="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" onclick={() => app.selectAllSets()}>
      <Icon name="select-all" />
      {t("setup.sets.selectAll")}
    </Button>
    <Button size="sm" variant="outline" onclick={() => app.clearSets()}>
      <Icon name="select-none" />
      {t("setup.sets.clear")}
    </Button>
    <Button
      size="sm"
      variant="outline"
      disabled={app.selectableWords.length === 0}
      onclick={() => app.go("words")}
    >
      <Icon name="filter" />
      {t("setup.words.button")}
    </Button>
  </div>

  <div class="flex flex-col gap-2 sm:gap-3">
    {#each app.availableSets as id (id)}
      <SetRow {id} subcategories={app.subcategoriesInSet[id]} />
    {:else}
      <EmptyState icon="target" title={t("setup.sets.empty")} />
    {/each}
  </div>
</div>
