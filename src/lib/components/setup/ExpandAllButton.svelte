<script lang="ts">
  import { Button } from "kaizen-ui";
  import ChevronsDownUp from "@lucide/svelte/icons/chevrons-down-up";
  import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
  import { t } from "../../i18n.svelte";

  let found = $state(false);
  let allOpen = $state(false);

  function sections(): HTMLDetailsElement[] {
    return [...document.querySelectorAll<HTMLDetailsElement>("main details")];
  }

  function sync(): void {
    const all = sections();
    found = all.length > 0;
    allOpen = found && all.every((section) => section.open);
  }

  function toggleAll(): void {
    const open = !allOpen;
    for (const section of sections()) section.open = open;
    sync();
  }

  $effect(() => {
    sync();
    const observer = new MutationObserver(sync);
    const main = document.querySelector("main");
    if (main !== null) observer.observe(main, { childList: true, subtree: true });
    document.addEventListener("toggle", sync, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("toggle", sync, true);
    };
  });
</script>

<Button variant="outline" disabled={!found} onclick={toggleAll}>
  {#if allOpen}
    <ChevronsDownUp class="size-4" strokeWidth={1.8} aria-hidden="true" />
    {t("common.collapseAll")}
  {:else}
    <ChevronsUpDown class="size-4" strokeWidth={1.8} aria-hidden="true" />
    {t("common.expandAll")}
  {/if}
</Button>
