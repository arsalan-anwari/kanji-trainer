<script lang="ts">
  import { Icon } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  const message = $derived(
    t("setup.words.unsuited", { packs: app.unsuitedPacks.map((id) => app.packTitle(id)).join(", ") })
  );
</script>

{#if app.unsuitedPacks.length > 0}
  <span
    role="status"
    class="inline-flex items-center gap-1.5 rounded-full border border-danger bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger"
  >
    <Icon name="warning" class="size-4 shrink-0" />
    {message}
  </span>
{/if}
