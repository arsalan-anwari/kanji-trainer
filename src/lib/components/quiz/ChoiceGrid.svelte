<script lang="ts">
  import { ChoiceTile, roving, type ChoiceState } from "kaizen-ui";
  import { answerSurface, isJapanese } from "../../quiz/settings";
  import type { Question } from "../../quiz/questions";
  import { app } from "../../state.svelte";
  import { CONTENT_LANG, langOf } from "../../content/locale";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  const japanese = $derived(isJapanese(answerSurface(app.settings.format)));
  const lang = $derived(app.currentWord === null ? CONTENT_LANG : langOf(app.currentWord));

  function state(choice: string): ChoiceState {
    if (app.phase === "answering") return "idle";
    if (choice === question.answer) return "correct";
    return choice === app.picked ? "wrong" : "dimmed";
  }
</script>

<div class="@container w-full max-w-md">
  <div
    use:roving
    role="group"
    aria-label={t("quiz.choices")}
    class="grid grid-cols-1 gap-2.5 @min-[18rem]:grid-cols-2 sm:gap-3"
  >
    {#each question.choices as choice, index (choice)}
      <ChoiceTile
        jp={japanese}
        lang={answerSurface(app.settings.format) === "meaning" ? lang : undefined}
        slot={index + 1}
        label={choice}
        state={state(choice)}
        disabled={app.phase !== "answering"}
        onpick={() => app.answerChoice(choice)}
      />
    {/each}
  </div>
</div>
