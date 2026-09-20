<script lang="ts">
  import { ChoiceTile, roving, type ChoiceState } from "kaizen-ui";
  import { answerSurface, isJapanese } from "../../quiz/settings";
  import type { Question } from "../../quiz/questions";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  const japanese = $derived(isJapanese(answerSurface(app.settings.format)));

  function state(choice: string): ChoiceState {
    if (app.phase === "answering") return "idle";
    if (choice === question.answer) return "correct";
    return choice === app.picked ? "wrong" : "dimmed";
  }
</script>

<div
  use:roving
  role="group"
  aria-label={t("quiz.choices")}
  class="grid w-full max-w-md grid-cols-2 gap-2.5 sm:gap-3"
>
  {#each question.choices as choice, index (choice)}
    <ChoiceTile
      jp={japanese}
      slot={index + 1}
      label={choice}
      state={state(choice)}
      disabled={app.phase !== "answering"}
      onpick={() => app.answerChoice(choice)}
    />
  {/each}
</div>
