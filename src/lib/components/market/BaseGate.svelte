<script lang="ts">
  import { Button, Dialog, Progress } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { megabytes, share } from "../../packs/shelf";
  import { canInstall } from "../../packs/store";
  import { t } from "../../i18n.svelte";

  let checking = $state(false);

  const installable = canInstall();
  const missing = $derived(app.missingBases);
  const total = $derived(missing.reduce((sum, entry) => sum + entry.bytes, 0));
  const busy = $derived(missing.find((entry) => entry.id in app.installing) ?? null);
  const progress = $derived(busy === null ? null : app.installing[busy.id]);
  const failed = $derived(missing.some((entry) => app.installFailed.includes(entry.id)));

  async function retryCatalog(): Promise<void> {
    checking = true;
    await app.refreshCatalog();
    checking = false;
  }
</script>

<Dialog title={t("market.gate.title")} description={t("market.gate.description")}>
  {#if !installable}
    <p class="text-sm" role="alert">{t("market.browserOnly")}</p>
  {:else if missing.length === 0}
    <p class="text-sm" role="alert">{t("market.gate.offline")}</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each missing as entry (entry.id)}
        <li class="flex items-center justify-between gap-3 rounded-xl border-2 border-border px-4 py-3">
          <span class="font-bold">{entry.title}</span>
          <span class="text-sm text-muted-foreground">
            {t("market.meta.size", { size: megabytes(entry.bytes) })}
          </span>
        </li>
      {/each}
    </ul>
    <p class="text-sm text-muted-foreground">{t("market.gate.total", { size: megabytes(total) })}</p>
    {#if busy !== null && progress !== null}
      <div class="flex flex-col gap-1.5" aria-live="polite">
        <span class="text-sm font-bold">{t("market.gate.busy", { title: busy.title })}</span>
        <Progress
          value={share(progress.done, progress.total)}
          label={t("market.progressLabel", { title: busy.title })}
        />
        <span class="text-xs text-muted-foreground">
          {t("market.progress", { done: megabytes(progress.done), total: megabytes(progress.total) })}
        </span>
      </div>
    {:else if failed}
      <p class="text-sm text-danger" role="alert">{t("market.failed")}</p>
    {/if}
  {/if}

  {#snippet footer()}
    {#if installable && missing.length === 0}
      <Button variant="brand" disabled={checking} onclick={retryCatalog}>{t("market.gate.retry")}</Button>
    {:else if installable}
      <Button variant="brand" disabled={busy !== null} onclick={() => void app.installMissingBases()}>
        {failed ? t("market.gate.retry") : t("market.gate.start")}
      </Button>
    {/if}
  {/snippet}
</Dialog>
