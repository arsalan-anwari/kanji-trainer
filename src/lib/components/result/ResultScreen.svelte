<script lang="ts">
  import { Badge, Button, Card, EmptyState, Glyph, Icon, ResultSplash, Stat } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { tierBlurb, tierEmoji, tierHeadline } from "../../quiz/score";
  import { n, t } from "../../i18n.svelte";

  const summary = $derived(app.lastSummary);
  const percent = $derived(summary === null ? 0 : Math.round(summary.accuracy * 100));
  const timed = $derived((app.lastReport?.settings.perQuestionSeconds ?? 0) > 0);
</script>

{#if app.splash !== null}
  <ResultSplash
    grade={app.splash}
    headline={tierHeadline(app.splash)}
    blurb={tierBlurb(app.splash)}
    emoji={tierEmoji(app.splash)}
    hint={t("result.skip")}
    ondismiss={() => app.dismissSplash()}
  >
    {#if summary !== null}
      {n(summary.score)} / {n(summary.total)}
      <span class="text-muted-foreground">· {percent}%</span>
    {/if}
  </ResultSplash>
{/if}

{#if summary !== null}
  <div
    data-section
    class="sheet ruled flex flex-col gap-4 rounded-2xl border-2 border-border bg-sidebar p-4 sm:p-5"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span class="text-h2 leading-tight font-bold">{t("result.title")}</span>
      <div class="flex flex-wrap gap-2">
        <Button variant="brand" onclick={() => app.quit()}>{t("result.again")}</Button>
        <Button variant="outline" onclick={() => app.go("reports")}>{t("result.report")}</Button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <Stat tone="success" value={n(summary.score)} label={t("result.score")} />
      <Stat tone="brand" value={`${n(percent)}%`} label={t("result.accuracy")} />
      <Stat value={n(summary.total)} label={t("result.asked")} />
    </div>

    <div class="grid gap-2 {timed ? 'grid-cols-2' : 'grid-cols-1'}">
      <Stat
        value={t("result.secondsShort", { count: n(Math.round(summary.averageMs / 100) / 10) })}
        label={t("result.average")}
      />
      {#if timed}
        <Stat value={n(summary.timedOut)} label={t("result.timedOut")} />
      {/if}
    </div>
  </div>

  <Card
    title={t("result.missed.title")}
    description={t("result.missed.count", { count: n(app.missedWords.length) })}
  >
    {#snippet icon()}<Icon name="target" class="size-5" />{/snippet}
    {#if app.missedWords.length === 0}
      <EmptyState icon="trophy" title={t("result.missed.none")} />
    {:else}
      <ul class="grid gap-2 sm:grid-cols-2">
        {#each app.missedWords as word (word.id)}
          <li class="flex flex-col gap-0.5 rounded-lg border border-wire bg-surface px-3 py-2">
            <span class="flex flex-wrap items-baseline gap-x-2">
              <Glyph text={word.written} class="text-lg font-bold" />
              <Glyph text={word.reading} class="text-sm text-muted-foreground" />
              {#if summary.timedOutWordIds.includes(word.id)}
                <Badge tone="danger">{t("result.missed.timedOut")}</Badge>
              {/if}
            </span>
            <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}
