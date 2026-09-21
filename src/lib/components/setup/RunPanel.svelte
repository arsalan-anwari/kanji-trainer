<script lang="ts">
  import { Card, Chip, Icon, OptionCard } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import QuestionCountPicker from "./QuestionCountPicker.svelte";
  import {
    ANSWER_STYLES,
    answerSurface,
    CATEGORIES,
    categoryOf,
    DIFFICULTIES,
    DIRECTIONS_BY_CATEGORY
  } from "../../quiz/settings";
  import { t } from "../../i18n.svelte";

  const category = $derived(categoryOf(app.settings.format));
  const typingHintKey = $derived(
    { written: "typingKanji", reading: "typing", meaning: "typingMeaning", image: "typing" }[
      answerSurface(app.settings.format)
    ]
  );
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
    {#each ANSWER_STYLES as style (style)}
      <OptionCard
        active={app.settings.answerStyle === style}
        label={t(`common.answerStyle.${style}`)}
        hint={style === "typing" ? t(`setup.answerStyle.${typingHintKey}`) : t(`setup.answerStyle.${style}`)}
        onclick={() => app.updateSettings({ answerStyle: style })}
      />
    {/each}
  </div>
</Card>

<Card title={t("setup.difficulty.title")} description={t("setup.difficulty.description")}>
  {#snippet icon()}<Icon name="flame" class="size-5" />{/snippet}
  <div role="group" aria-label={t("setup.difficulty.title")} class="flex flex-wrap gap-2">
    {#each DIFFICULTIES as difficulty (difficulty)}
      <Chip
        size="sm"
        active={app.settings.difficulty === difficulty}
        title={t(`setup.difficulty.${difficulty}`)}
        onclick={() => app.updateSettings({ difficulty })}
      >
        {t(`common.difficulty.${difficulty}`)}
      </Chip>
    {/each}
  </div>
</Card>

<Card title={t("setup.run.title")} description={t("setup.run.description")}>
  {#snippet icon()}<Icon name="sliders" class="size-5" />{/snippet}
  <QuestionCountPicker />
</Card>
