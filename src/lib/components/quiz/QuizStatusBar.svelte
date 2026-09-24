<script lang="ts">
  import { Button, Progress } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { n, t } from "../../i18n.svelte";

  const runLeft = $derived.by(() => {
    if (app.totalRemaining === null) return null;
    const seconds = Math.ceil(app.totalRemaining / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });
</script>

<div data-section class="flex flex-col gap-2">
  <div class="flex items-center gap-2 sm:gap-3">
    <Button size="sm" variant="ghost" onclick={() => app.askQuit()}>{t("quiz.quit")}</Button>
    <Progress
      value={app.progress}
      tone="success"
      size="lg"
      class="flex-1"
      label={t("quiz.runProgress")}
    />
    <span class="shrink-0 text-sm font-semibold tabular-nums">
      {n(app.index + 1)} / {n(app.questions.length)}
    </span>
    {#if runLeft !== null}
      <span
        role="timer"
        aria-label={t("quiz.time.runLeft")}
        class="shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums {(app.totalRemaining ??
          0) <= 15000
          ? 'bg-danger-soft text-danger'
          : 'bg-secondary'}"
      >
        {runLeft}
      </span>
    {/if}
  </div>
  {#if app.questionRemaining !== null}
    <Progress
      value={app.questionRemaining / (app.settings.perQuestionSeconds * 1000)}
      tone={app.questionRemaining <= 3000 ? "danger" : "primary"}
      size="sm"
      label={t("quiz.time.questionLeft")}
    />
  {/if}
</div>
