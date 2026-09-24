<script lang="ts">
  import { Chip, ConfirmDialog, EmptyState, IconButton, Stat } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import type { Offer, Theme } from "../../packs/catalog";
  import { filterOffers, levelsOffered, shelve, themesOffered } from "../../packs/shelf";
  import { canInstall } from "../../packs/store";
  import PackCard from "./PackCard.svelte";
  import PackDetails from "./PackDetails.svelte";
  import { n, t } from "../../i18n.svelte";

  let theme = $state<Theme | null>(null);
  let level = $state<string | null>(null);
  let details = $state<Offer | null>(null);
  let removing = $state<Offer | null>(null);
  let checking = $state(false);

  const installable = canInstall();
  const themes = $derived(themesOffered(app.offers));
  const levels = $derived(levelsOffered(app.offers));
  const sections = $derived(shelve(filterOffers(app.offers, { theme, level })));
  const counts = $derived({
    installed: app.offers.filter((offer) => offer.state !== "available").length,
    updates: app.updateCount,
    available: app.offers.filter((offer) => offer.state === "available").length
  });
  const status = $derived(
    app.catalogFresh
      ? "market.catalog.fresh"
      : app.catalog.length > 0
        ? "market.catalog.stale"
        : "market.catalog.none"
  );

  async function refresh(): Promise<void> {
    checking = true;
    await app.refreshCatalog();
    checking = false;
  }

  async function confirmRemove(): Promise<void> {
    const offer = removing;
    removing = null;
    if (offer !== null) await app.removePack(offer.meta.id);
  }
</script>

<div class="flex flex-col gap-4">
  <section
    data-section
    aria-labelledby="market-title"
    class="sheet ruled relative flex flex-col gap-5 overflow-hidden rounded-2xl border-2 border-border bg-brand-soft p-5 sm:p-7"
  >
    <span
      aria-hidden="true"
      class="jp pointer-events-none absolute -top-6 -right-4 text-[11rem] leading-none font-bold text-brand opacity-10 select-none"
    >
      店
    </span>
    <div class="relative flex flex-col gap-2">
      <h2 id="market-title" class="text-h2 leading-tight font-bold">{t("market.title")}</h2>
      <p class="max-w-2xl text-sm leading-snug text-muted-foreground sm:text-base">{t("market.tagline")}</p>
    </div>
    <div class="relative grid grid-cols-3 gap-2 sm:max-w-xl">
      <Stat label={t("market.stats.installed")} value={n(counts.installed)} tone="success" />
      <Stat label={t("market.stats.updates")} value={n(counts.updates)} tone="gold" />
      <Stat label={t("market.stats.available")} value={n(counts.available)} tone="brand" />
    </div>
    <div class="relative flex items-center justify-between gap-3">
      <span class="text-sm text-muted-foreground" aria-live="polite">{t(status)}</span>
      {#if installable}
        <IconButton
          icon="restore"
          variant="outline"
          size="sm"
          label={t("market.catalog.refresh")}
          disabled={checking}
          onclick={refresh}
        />
      {/if}
    </div>
  </section>

  {#if themes.length > 1 || levels.length > 1}
    <div data-section class="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-4">
      {#if themes.length > 1}
        <div role="group" aria-label={t("market.filter.theme")} class="flex flex-wrap gap-2">
          <Chip size="sm" active={theme === null} onclick={() => (theme = null)}>
            {t("market.filter.all")}
          </Chip>
          {#each themes as entry (entry.theme)}
            <Chip size="sm" active={theme === entry.theme} onclick={() => (theme = entry.theme)}>
              {t(`market.theme.${entry.theme}`)} · {n(entry.count)}
            </Chip>
          {/each}
        </div>
      {/if}
      {#if levels.length > 1}
        <div role="group" aria-label={t("market.filter.level")} class="flex flex-wrap gap-2">
          <Chip size="sm" active={level === null} onclick={() => (level = null)}>
            {t("market.filter.all")}
          </Chip>
          {#each levels as entry (entry)}
            <Chip size="sm" active={level === entry} onclick={() => (level = entry)}>{entry}</Chip>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#each sections as section (section.id)}
    <section data-section aria-labelledby="market-{section.id}" class="flex flex-col gap-3">
      <h3 id="market-{section.id}" class="text-h3 leading-tight font-bold">
        {t(`market.section.${section.id}`)}
      </h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each section.offers as offer (offer.meta.id)}
          <PackCard
            {offer}
            enabled={app.enabledPackIds.includes(offer.meta.id)}
            progress={app.installing[offer.meta.id] ?? null}
            failed={app.installFailed.includes(offer.meta.id)}
            online={app.catalogFresh}
            {installable}
            ondownload={() => void app.installPack(offer.meta.id)}
            ontoggle={(on) => app.setPackEnabled(offer.meta.id, on)}
            ondetails={() => (details = offer)}
            onremove={() => (removing = offer)}
          />
        {/each}
      </div>
    </section>
  {:else}
    <EmptyState title={t("market.empty")} />
  {/each}

  <p class="text-xs text-muted-foreground">{t("market.source")}</p>
</div>

{#if details !== null}
  <PackDetails offer={details} onclose={() => (details = null)} />
{/if}

{#if removing !== null}
  <ConfirmDialog
    title={t("market.remove.title", { title: removing.meta.title })}
    confirmLabel={t("market.remove.confirm")}
    cancelLabel={t("market.remove.cancel")}
    closeLabel={t("common.close")}
    onconfirm={confirmRemove}
    oncancel={() => (removing = null)}
  >
    {t("market.remove.body")}
  </ConfirmDialog>
{/if}
