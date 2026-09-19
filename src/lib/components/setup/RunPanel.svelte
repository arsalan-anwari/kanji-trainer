<script lang="ts">
  import { Card, Chip, Icon, OptionCard } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import QuestionCountPicker from "./QuestionCountPicker.svelte";
  import { ANSWER_STYLES, FORMATS, WORD_SHAPES, typingAllowed } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  // Every JLPT level, so the ones this build has no content for are visible and
  // plainly switched off rather than missing.
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
</script>

<Card title={t("setup.level.title")} description={t("setup.level.description")}>
  {#snippet icon()}<Icon name="trophy" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.level.title")} class="flex flex-wrap gap-2">
    {#each LEVELS as level (level)}
      {@const known = app.levels.includes(level)}
      <Chip
        size="sm"
        disabled={!known}
        active={app.settings.level === level}
        title={known ? level : t("setup.level.unavailable", { level })}
        onclick={() => app.updateSettings({ level })}
      >
        {level}
      </Chip>
    {/each}
  </div>
</Card>

<Card title={t("setup.format.title")} description={t("setup.format.description")}>
  {#snippet icon()}<Icon name="target" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.format.title")} class="grid gap-3 sm:grid-cols-2">
    {#each FORMATS as format (format)}
      <OptionCard
        active={app.settings.format === format}
        label={t(`common.format.${format}`)}
        hint={t(`setup.format.${format}`)}
        onclick={() => app.updateSettings({ format })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.answerStyle.title")} description={t("setup.answerStyle.description")}>
  {#snippet icon()}<Icon name="keyboard" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.answerStyle.title")} class="grid gap-3 sm:grid-cols-2">
    {#each ANSWER_STYLES as style (style)}
      <OptionCard
        active={app.settings.answerStyle === style}
        disabled={style === "typing" && !typingAllowed(app.settings.format)}
        label={t(`common.answerStyle.${style}`)}
        hint={style === "typing" && !typingAllowed(app.settings.format)
          ? t("setup.answerStyle.typingUnavailable")
          : t(`setup.answerStyle.${style}`)}
        onclick={() => app.updateSettings({ answerStyle: style })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.wordShapes.title")} description={t("setup.wordShapes.description")}>
  {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
  <div class="flex flex-col gap-3">
    <div role="group" aria-label={t("setup.wordShapes.title")} class="flex flex-wrap gap-2">
      {#each WORD_SHAPES as shape (shape)}
        <Chip
          size="sm"
          active={app.settings.wordShapes.includes(shape)}
          title={t(`setup.wordShapes.${shape}`)}
          onclick={() => {
            const current = new Set(app.settings.wordShapes);
            if (current.has(shape)) {
              current.delete(shape);
            } else {
              current.add(shape);
            }
            app.updateSettings({ wordShapes: [...current] });
          }}
        >
          {t(`common.wordShapes.${shape}`)}
        </Chip>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">
      {t("setup.wordShapes.hint")}
    </p>
  </div>
</Card>

<Card title={t("setup.run.title")} description={t("setup.run.description")}>
  {#snippet icon()}<Icon name="sliders" class="size-5" />{/snippet}
  <div class="flex flex-col gap-3">
    <QuestionCountPicker />
    <p class="text-sm text-muted-foreground">
      {t("setup.run.pool", { count: n(app.eligibleCount) })}
    </p>
  </div>
</Card>
