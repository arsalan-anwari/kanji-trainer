<script lang="ts">
  import { Button, TextField } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";
</script>

<div class="flex w-full max-w-md flex-col gap-3">
  {#key app.index}
    <TextField
      bind:value={app.typed}
      big
      focusOnMount
      label={t("quiz.typed.label")}
      placeholder={t("quiz.typed.placeholder")}
      tone={app.phase === "answering" ? "idle" : app.lastCorrect ? "correct" : "wrong"}
      disabled={app.phase !== "answering"}
      onenter={() => app.submitTyped()}
    />
  {/key}
  <Button
    full
    size="lg"
    variant="brand"
    disabled={app.phase !== "answering" || app.typed.trim() === ""}
    onclick={() => app.submitTyped()}
  >
    {t("quiz.typed.submit")}
  </Button>
</div>
