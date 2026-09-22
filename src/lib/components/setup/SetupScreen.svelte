<script lang="ts">
  import { Card, Icon } from "kaizen-ui";
  import SetPicker from "./SetPicker.svelte";
  import RunPanel from "./RunPanel.svelte";
  import StartPanel from "./StartPanel.svelte";
  import { t } from "../../i18n.svelte";
</script>

<div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_500px]">
  <div class="flex flex-col gap-5">
    <RunPanel />
  </div>

  <div class="flex flex-col gap-4">
    <Card title={t("setup.sets.title")} description={t("setup.sets.description")}>
      {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
      <SetPicker />
    </Card>
    <StartPanel />
  </div>
</div>
