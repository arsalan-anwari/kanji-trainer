<script lang="ts">
  import { Card, Chip, CustomNumberChip, Icon, OptionCard } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import QuestionCountPicker from "./QuestionCountPicker.svelte";
  import {
    answerStylesFor,
    CATEGORIES,
    categoryOf,
    CUSTOM_PER_QUESTION_MAX,
    CUSTOM_TOTAL_MINUTES_MAX,
    DIFFICULTIES,
    DIRECTIONS_BY_CATEGORY,
    isCustomTime,
    PER_QUESTION_SECONDS,
    TOTAL_SECONDS
  } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  const category = $derived(categoryOf(app.settings.format));

  let perQuestionCustom = $state(isCustomTime(app.settings.perQuestionSeconds, PER_QUESTION_SECONDS));
  let totalCustom = $state(isCustomTime(app.settings.totalSeconds, TOTAL_SECONDS));

  function timeLabel(seconds: number): string {
    if (seconds === 0) return t("common.off");
    if (seconds < 60) return t("setup.time.secondsShort", { count: n(seconds) });
    return t("setup.time.minutesShort", { count: n(seconds / 60) });
  }

  function setPerQuestion(seconds: number, custom: boolean): void {
    perQuestionCustom = custom;
    app.updateSettings({ perQuestionSeconds: seconds });
  }

  function setTotal(seconds: number, custom: boolean): void {
    totalCustom = custom;
    app.updateSettings({ totalSeconds: seconds });
  }
</script>

<Card title={t("setup.format.title")} description={t("setup.format.description")}>
  {#snippet icon()}<Icon name="target" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.format.title")} class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {#each CATEGORIES as option (option)}
      <OptionCard
        active={category === option}
        label={t(`common.category.${option}`)}
        hint={t(`setup.format.${option}`)}
        onclick={() => {
          if (category !== option) {
            app.updateSettings({ format: DIRECTIONS_BY_CATEGORY[option][0] });
          }
        }}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.direction.title")} description={t("setup.direction.description")}>
  {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.direction.title")} class="grid gap-3 sm:grid-cols-2">
    {#each DIRECTIONS_BY_CATEGORY[category] as direction (direction)}
      <OptionCard
        active={app.settings.format === direction}
        label={t(`common.format.${direction}`)}
        hint={t(`setup.format.${direction}`)}
        onclick={() => app.updateSettings({ format: direction })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.answerStyle.title")} description={t("setup.answerStyle.description")}>
  {#snippet icon()}<Icon name="keyboard" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.answerStyle.title")} class="grid gap-3 sm:grid-cols-2">
    {#each answerStylesFor(app.settings.format) as style (style)}
      <OptionCard
        active={app.settings.answerStyle === style}
        label={t(`common.answerStyle.${style}`)}
        hint={t(`setup.answerStyle.${style}`)}
        onclick={() => app.updateSettings({ answerStyle: style })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.difficulty.title")} description={t("setup.difficulty.description")}>
  {#snippet icon()}<Icon name="flame" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.difficulty.title")} class="grid gap-3 sm:grid-cols-3">
    {#each DIFFICULTIES as difficulty (difficulty)}
      <OptionCard
        active={app.settings.difficulty === difficulty}
        label={t(`common.difficulty.${difficulty}`)}
        hint={t(`setup.difficulty.${difficulty}`)}
        onclick={() => app.updateSettings({ difficulty })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.run.title")} description={t("setup.run.description")}>
  {#snippet icon()}<Icon name="sliders" class="size-5" />{/snippet}
  <div class="flex flex-col gap-4">
    <QuestionCountPicker />

    <div role="group" aria-label={t("setup.time.perQuestion")} class="flex flex-col gap-2">
      <span class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t("setup.time.perQuestion")}
      </span>
      <div class="flex flex-wrap gap-2">
        {#each PER_QUESTION_SECONDS as seconds (seconds)}
          <Chip
            size="sm"
            active={!perQuestionCustom && app.settings.perQuestionSeconds === seconds}
            onclick={() => setPerQuestion(seconds, false)}
          >
            {timeLabel(seconds)}
          </Chip>
        {/each}
        <CustomNumberChip
          value={app.settings.perQuestionSeconds}
          min={1}
          max={CUSTOM_PER_QUESTION_MAX}
          unit="s"
          title={t("setup.time.seconds")}
          doneLabel={t("common.apply")}
          cancelLabel={t("common.cancel")}
          active={perQuestionCustom}
          onpick={(seconds) => setPerQuestion(seconds, true)}
        />
      </div>
    </div>

    <div role="group" aria-label={t("setup.time.wholeRun")} class="flex flex-col gap-2">
      <span class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t("setup.time.wholeRun")}
      </span>
      <div class="flex flex-wrap gap-2">
        {#each TOTAL_SECONDS as seconds (seconds)}
          <Chip
            size="sm"
            active={!totalCustom && app.settings.totalSeconds === seconds}
            onclick={() => setTotal(seconds, false)}
          >
            {timeLabel(seconds)}
          </Chip>
        {/each}
        <CustomNumberChip
          value={Math.round(app.settings.totalSeconds / 60)}
          min={1}
          max={CUSTOM_TOTAL_MINUTES_MAX}
          unit="m"
          title={t("setup.time.minutes")}
          doneLabel={t("common.apply")}
          cancelLabel={t("common.cancel")}
          active={totalCustom}
          onpick={(minutes) => setTotal(minutes * 60, true)}
        />
      </div>
    </div>
  </div>
</Card>
