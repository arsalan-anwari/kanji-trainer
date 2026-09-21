<script lang="ts">
  import { Chip, Icon, Select } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import {
    activeFilters,
    ANSWER_STYLE_TAGS,
    ANY_QUERY,
    isDateRange,
    rangeLabel,
    toggle,
    WINDOWS,
    type ReportQuery
  } from "../../quiz/query";
  import { answerSurface, FORMATS, promptSurface, type Surface } from "../../quiz/settings";
  import DateRangePicker from "./DateRangePicker.svelte";
  import { t } from "../../i18n.svelte";

  let { query = $bindable<ReportQuery>({ ...ANY_QUERY }) }: { query?: ReportQuery } = $props();

  // Every JLPT level, so the ones no run can carry yet read as switched off.
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

  const active = $derived(activeFilters(query));

  const range = $derived(isDateRange(query.window) ? query.window : null);
  let picking = $state(false);
  let rangeAnchor = $state<HTMLElement | null>(null);

  const ANY = "any";
  type SurfaceChoice = Surface | typeof ANY;

  const FROM_SURFACES: readonly Surface[] = [...new Set(FORMATS.map(promptSurface))];

  function surfaceOption(surface: Surface): { value: string; label: string } {
    return { value: surface, label: t(`common.surface.${surface}`) };
  }

  const fromOptions = $derived([
    { value: ANY, label: t("common.any") },
    ...FROM_SURFACES.map(surfaceOption)
  ]);

  // A partial pick (from set, to left at "any") keeps every format sharing that
  // prompt surface, so `from` and `to` both read back out of query.formats alone.
  const from = $derived<SurfaceChoice>(
    query.formats.length === 0 ? ANY : promptSurface(query.formats[0]!)
  );
  const to = $derived<SurfaceChoice>(query.formats.length === 1 ? answerSurface(query.formats[0]!) : ANY);

  const toOptions = $derived(
    from === ANY
      ? []
      : [
          { value: ANY, label: t("common.any") },
          ...FORMATS.filter((format) => promptSurface(format) === from).map((format) =>
            surfaceOption(answerSurface(format))
          )
        ]
  );

  function setFrom(next: string): void {
    if (next === ANY) {
      query = { ...query, formats: [] };
      return;
    }
    const surface = next as Surface;
    query = { ...query, formats: FORMATS.filter((format) => promptSurface(format) === surface) };
  }

  function setTo(next: string): void {
    if (from === ANY) return;
    if (next === ANY) {
      query = { ...query, formats: FORMATS.filter((format) => promptSurface(format) === from) };
      return;
    }
    const surface = next as Surface;
    const format = FORMATS.find(
      (candidate) => promptSurface(candidate) === from && answerSurface(candidate) === surface
    );
    query = { ...query, formats: format === undefined ? [] : [format] };
  }
</script>

<div data-section class="flex flex-col gap-3">
  <div role="group" aria-label={t("reports.window.all")} class="flex flex-wrap items-center gap-1.5">
    {#each WINDOWS as option (option)}
      <Chip
        size="sm"
        active={query.window === option}
        onclick={() => (query = { ...query, window: option })}
      >
        {t(`reports.window.${option}`)}
      </Chip>
    {/each}

    <span bind:this={rangeAnchor} class="inline-flex">
      <Chip
        size="sm"
        active={range !== null}
        title={range === null ? t("reports.range.pick") : rangeLabel(range)}
        onclick={() => (picking = true)}
      >
        <span class="flex items-center gap-1.5">
          <Icon name="calendar" class="size-4" />
          {#if range !== null}
            <span class="tabular-nums">{rangeLabel(range)}</span>
          {/if}
        </span>
      </Chip>
    </span>

    {#if picking}
      <DateRangePicker
        anchor={rangeAnchor}
        current={range}
        onpick={(next) => {
          query = { ...query, window: next };
          picking = false;
        }}
        onclose={() => (picking = false)}
      />
    {/if}
  </div>

  <details class="rounded-xl border-2 border-border bg-surface">
    <summary
      class="flex h-13 cursor-pointer list-none items-center gap-2 px-3.5 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden"
    >
      <Icon name="filter" class="size-4" />
      <span>{t("reports.filters.title")}</span>
      {#if active > 0}
        <span
          class="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.625rem] tabular-nums text-brand-foreground"
        >
          {active}
        </span>
      {/if}
      <Icon name="chevron-down" class="ml-auto size-4" />
    </summary>

    <div class="flex flex-col gap-3 border-t border-border px-3 py-3">
      <div class="flex flex-col gap-1.5">
        <span class="text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase">
          {t("reports.filters.format")}
        </span>
        <div class="flex items-center gap-2">
          <Select
            size="sm"
            value={from}
            options={fromOptions}
            label={t("reports.filters.format")}
            closeLabel={t("common.close")}
            onchange={setFrom}
          />
          <Icon name="chevron-right" class="size-4 shrink-0 text-muted-foreground" />
          <Select
            size="sm"
            value={to}
            options={toOptions}
            label={t("reports.filters.format")}
            closeLabel={t("common.close")}
            disabled={from === ANY}
            onchange={setTo}
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase">
          {t("reports.filters.answering")}
        </span>
        <div class="flex flex-wrap gap-1.5">
          {#each ANSWER_STYLE_TAGS as tag (tag)}
            <Chip
              size="sm"
              active={query.answerStyles.includes(tag)}
              onclick={() => (query = { ...query, answerStyles: toggle(query.answerStyles, tag) })}
            >
              {t(`common.answerStyle.${tag}`)}
            </Chip>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase">
          {t("reports.filters.level")}
        </span>
        <div class="flex flex-wrap gap-1.5">
          {#each LEVELS as level (level)}
            <Chip
              size="sm"
              disabled={!app.levels.includes(level)}
              active={query.levels.includes(level)}
              onclick={() => (query = { ...query, levels: toggle(query.levels, level) })}
            >
              {level}
            </Chip>
          {/each}
        </div>
      </div>

      {#if active > 0}
        <button
          type="button"
          class="cursor-pointer self-start text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onclick={() => (query = { ...ANY_QUERY, window: query.window })}
        >
          {t("reports.filters.clear")}
        </button>
      {/if}
    </div>
  </details>
</div>
