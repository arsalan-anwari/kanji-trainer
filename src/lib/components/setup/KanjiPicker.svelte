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
      {t("setup.kanji.selectAll")}
    </Button>
    <Button size="sm" variant="outline" onclick={() => app.clearSets()}>
      <Icon name="select-none" />
      {t("setup.kanji.clear")}
    </Button>
  </div>

  <div class="flex flex-col gap-2 sm:gap-3">
    {#each app.availableSets as id (id)}
      <SetRow {id} kanji={app.kanjiInSet[id]} />
    {:else}
      <EmptyState icon="target" title={t("setup.kanji.empty")} />
    {/each}
  </div>
</div>
