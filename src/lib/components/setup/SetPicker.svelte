<script lang="ts">
  import { Button, EmptyState, Icon } from "kaizen-ui";
  import { groupSetsByFamily } from "../../content/sets";
  import { app } from "../../state.svelte";
  import PresetPicker from "./PresetPicker.svelte";
  import SetRow from "./SetRow.svelte";
  import { t } from "../../i18n.svelte";

  const families = $derived(groupSetsByFamily(app.availableSets));
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

  <div class="flex flex-col gap-4">
    {#each families as { family, sets } (family)}
      <section class="flex flex-col gap-2 sm:gap-3" aria-labelledby="family-{family}">
        <h3
          id="family-{family}"
          class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t(`common.family.${family}`)}
        </h3>
        {#each sets as id (id)}
          <SetRow {id} subcategories={app.subcategoriesInSet[id]} />
        {/each}
      </section>
    {:else}
      <EmptyState icon="target" title={t("setup.sets.empty")} />
    {/each}
  </div>
</div>
