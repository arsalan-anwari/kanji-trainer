<script lang="ts">
  import { Chip, NumberField, NumberRoller, viewport } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import {
    clampCustomCount,
    isCustomCount,
    CUSTOM_COUNT_MAX,
    CUSTOM_COUNT_MIN,
    CUSTOM_COUNT_VALUES,
    ONE_PASS,
    QUESTION_COUNT_ROWS
  } from "../../quiz/settings";
  import { n, t } from "../../i18n.svelte";

  let custom = $state(isCustomCount(app.settings.questionCount));
  let rolling = $state(false);

  // A roller beats a keyboard on a touch screen, but not on a short one.
  const roller = $derived(viewport.touch && !viewport.short);

  function choose(count: number): void {
    custom = false;
    app.updateSettings({ questionCount: count });
  }

  function openCustom(): void {
    custom = true;
    const start = clampCustomCount(app.settings.questionCount || CUSTOM_COUNT_MIN);
    if (roller) {
      rolling = true;
      return;
    }
    app.updateSettings({ questionCount: start });
  }
</script>

<div role="group" aria-label={t("setup.run.count")} class="flex flex-col gap-2">
  {#each QUESTION_COUNT_ROWS as row, index (index)}
    <div class="grid grid-cols-5 gap-2">
      {#each row as count (count)}
        <Chip
          size="sm"
          class="w-full"
          active={!custom && app.settings.questionCount === count}
          onclick={() => choose(count)}
        >
          {n(count)}
        </Chip>
      {/each}
    </div>
  {/each}

  <div class="grid grid-cols-2 gap-2">
    {#if custom && !roller}
      <NumberField
        value={app.settings.questionCount}
        min={CUSTOM_COUNT_MIN}
        max={CUSTOM_COUNT_MAX}
        label={t("setup.run.count")}
        focusOnMount
        class="w-full"
        oncommit={(count) => app.updateSettings({ questionCount: count })}
      />
    {:else}
      <Chip size="sm" class="w-full" active={custom} onclick={openCustom}>
        {custom ? n(app.settings.questionCount) : t("common.custom")}
      </Chip>
    {/if}

    <Chip
      size="sm"
      class="w-full"
      active={app.settings.questionCount === ONE_PASS}
      onclick={() => choose(ONE_PASS)}
    >
      {t("setup.run.onePass")}
    </Chip>
  </div>
</div>

{#if rolling}
  <NumberRoller
    values={[...CUSTOM_COUNT_VALUES]}
    value={clampCustomCount(app.settings.questionCount || CUSTOM_COUNT_MIN)}
    title={t("setup.run.count")}
    doneLabel={t("common.apply")}
    cancelLabel={t("common.cancel")}
    onpick={(value) => {
      rolling = false;
      app.updateSettings({ questionCount: value });
    }}
    onclose={() => (rolling = false)}
  />
{/if}
