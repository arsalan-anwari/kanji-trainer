<script lang="ts">
  import { Button, Progress } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { n, t } from "../../i18n.svelte";
</script>

<div data-section class="flex items-center gap-2 sm:gap-3">
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
</div>
