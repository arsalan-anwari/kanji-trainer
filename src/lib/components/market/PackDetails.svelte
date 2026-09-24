<script lang="ts">
  import { Dialog } from "kaizen-ui";
  import type { Offer } from "../../packs/catalog";
  import { loadDescription } from "../../packs/store";
  import Markdown from "./Markdown.svelte";
  import { t } from "../../i18n.svelte";

  let { offer, onclose }: { offer: Offer; onclose: () => void } = $props();

  const description = $derived(loadDescription(offer.meta));
</script>

<Dialog
  title={offer.meta.title}
  description={t(`market.theme.${offer.meta.theme}`)}
  closeLabel={t("common.close")}
  size="lg"
  {onclose}
>
  {#await description}
    <p class="text-sm text-muted-foreground" aria-live="polite">{t("market.description.loading")}</p>
  {:then source}
    {#if source === null}
      <p class="text-sm text-muted-foreground" role="alert">{t("market.description.missing")}</p>
    {:else}
      <Markdown {source} />
    {/if}
  {/await}
</Dialog>
