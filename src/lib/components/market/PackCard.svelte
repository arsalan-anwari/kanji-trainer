<script lang="ts">
  import { Badge, Button, IconButton, Progress, ShelfCard, Switch } from "kaizen-ui";
  import { isBase, isSupported, type Offer } from "../../packs/catalog";
  import { lookOf, megabytes, share } from "../../packs/shelf";
  import type { Progress as Download } from "../../packs/store";
  import { n, t } from "../../i18n.svelte";

  let {
    offer,
    enabled,
    progress,
    failed,
    online,
    installable,
    ondownload,
    ontoggle,
    ondetails,
    onremove
  }: {
    offer: Offer;
    enabled: boolean;
    progress: Download | null;
    failed: boolean;
    online: boolean;
    installable: boolean;
    ondownload: () => void;
    ontoggle: (on: boolean) => void;
    ondetails: () => void;
    onremove: () => void;
  } = $props();

  const meta = $derived(offer.meta);
  const base = $derived(isBase(meta));
  const look = $derived(lookOf(offer));
  const size = $derived(offer.entry?.bytes ?? null);
  const facts = $derived([
    t("market.meta.words", { count: n(meta.words) }),
    t("market.meta.kanji", { count: n(meta.kanji) }),
    ...(size === null ? [] : [t("market.meta.size", { size: megabytes(size) })]),
    t("market.meta.version", { version: meta.version })
  ]);
  const supported = $derived(isSupported(meta));
  const canFetch = $derived(installable && online && offer.entry !== null && supported);
</script>

<ShelfCard
  title={meta.title}
  subtitle={t(`market.theme.${meta.theme}`)}
  meta={facts}
  glyph={look.glyph}
  tone={look.tone}
  muted={offer.state !== "available" && !enabled}
>
  {#snippet corner()}
    <Badge tone="brand">{meta.level}</Badge>
    {#if base}<Badge tone="gold">{t("market.badge.required")}</Badge>{/if}
  {/snippet}
  {#snippet badge()}
    {#if offer.state === "update"}
      <Badge tone="gold">{t("market.badge.update")}</Badge>
    {:else if offer.state === "installed" && enabled}
      <Badge tone="success">{t("market.badge.installed")}</Badge>
    {:else if offer.state === "installed"}
      <Badge tone="default">{t("market.badge.off")}</Badge>
    {:else}
      <Badge tone="seal">{t("market.badge.new")}</Badge>
    {/if}
  {/snippet}

  {#if progress !== null}
    <div class="flex flex-col gap-1.5" aria-live="polite">
      <Progress
        value={share(progress.done, progress.total)}
        label={t("market.progressLabel", { title: meta.title })}
      />
      <span class="text-xs text-muted-foreground">
        {t("market.progress", { done: megabytes(progress.done), total: megabytes(progress.total) })}
      </span>
    </div>
  {:else if !supported}
    <p class="text-sm text-muted-foreground">{t("market.newerApp")}</p>
  {:else if failed}
    <p class="text-sm text-danger" role="alert">{t("market.failed")}</p>
  {:else if offer.state !== "installed" && !installable}
    <p class="text-sm text-muted-foreground">{t("market.browserOnly")}</p>
  {:else if offer.state !== "installed" && !canFetch}
    <p class="text-sm text-muted-foreground">{t("market.needsNetwork")}</p>
  {/if}

  {#if offer.state !== "available" && supported}
    {#if base}
      <p class="text-sm text-muted-foreground">{t("market.action.alwaysOn")}</p>
    {:else}
      <Switch
        label={t("market.action.use")}
        hint={t("market.action.useHint")}
        checked={enabled}
        onchange={ontoggle}
      />
    {/if}
  {/if}

  {#snippet actions()}
    {#if offer.state !== "installed"}
      <Button variant="brand" disabled={!canFetch || progress !== null} onclick={ondownload}>
        {failed
          ? t("market.action.retry")
          : offer.state === "update"
            ? t("market.action.update")
            : t("market.action.download")}
      </Button>
    {/if}
    <Button
      variant="outline"
      onclick={ondetails}
      aria-label={t("market.action.detailsOf", { title: meta.title })}
    >
      {t("market.action.details")}
    </Button>
    {#if offer.state !== "available" && !base && installable}
      <IconButton
        icon="trash"
        variant="ghost"
        class="ml-auto"
        label={t("market.action.delete", { title: meta.title })}
        disabled={progress !== null}
        onclick={onremove}
      />
    {/if}
  {/snippet}
</ShelfCard>
