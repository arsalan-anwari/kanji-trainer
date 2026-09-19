<script lang="ts">
  import { Card, Chip, Icon, OptionCard } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import QuestionCountPicker from "./QuestionCountPicker.svelte";
  import {
    ANSWER_STYLES,
    CHOICE_COUNTS,
    FORMATS,
    typingAllowed
  } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  const typing = $derived(app.settings.answerStyle === "typing");
</script>

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
  <div class="flex flex-col gap-4">
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

    {#if !typing}
      <div class="flex flex-col gap-1.5">
        <span class="text-[0.625rem] font-bold tracking-wide text-muted-foreground uppercase">
          {t("setup.choices.title")}
        </span>
        <div role="group" aria-label={t("setup.choices.title")} class="flex flex-wrap gap-2">
          {#each CHOICE_COUNTS as count (count)}
            <Chip
              size="sm"
              active={app.settings.choiceCount === count}
              title={t(`setup.choices.${count}`)}
              onclick={() => app.updateSettings({ choiceCount: count })}
            >
              {t(`common.choices.${count}`)}
            </Chip>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</Card>

<Card title={t("setup.wordShapes.title")} description={t("setup.wordShapes.description")}>
  {#snippet icon()}<Icon name="filter" class="size-5" />{/snippet}
  <div class="flex flex-col gap-3">
    <div role="group" aria-label={t("setup.wordShapes.title")} class="flex flex-wrap gap-2">
      {#each ["1-kanji", "2-kanji", "okurigana"] as shape (shape)}
        <Chip
          size="sm"
          active={app.settings.wordShapes.includes(shape as "1-kanji" | "2-kanji" | "okurigana")}
          title={t(`setup.wordShapes.${shape}`)}
          onclick={() => {
            const current = new Set(app.settings.wordShapes);
            const shapeTyped = shape as "1-kanji" | "2-kanji" | "okurigana";
            if (current.has(shapeTyped)) {
              current.delete(shapeTyped);
            } else {
              current.add(shapeTyped);
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
