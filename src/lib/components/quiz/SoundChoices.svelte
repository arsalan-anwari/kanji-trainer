<script lang="ts">
  import { Button, PlayIcon, roving, viewport, Waveform, type ChoiceState } from "kaizen-ui";
  import type { Question } from "../../quiz/questions";
  import { clips } from "../../audio/clips.svelte";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  const tones: Record<ChoiceState, string> = {
    idle: "border-border bg-surface hover:border-selected hover:bg-accent",
    staged: "border-selected bg-selected-soft",
    correct: "border-success/50 bg-success-soft text-success",
    wrong: "border-danger/50 bg-danger-soft text-danger anim-shake",
    dimmed: "border-border bg-surface opacity-60"
  };

  const waves: Record<ChoiceState, "muted" | "success" | "danger"> = {
    idle: "muted",
    staged: "muted",
    correct: "success",
    wrong: "danger",
    dimmed: "muted"
  };

  function state(choice: string): ChoiceState {
    if (app.phase === "answering") return app.staged === choice ? "staged" : "idle";
    if (choice === question.answer) return "correct";
    return choice === app.picked ? "wrong" : "dimmed";
  }

  function pick(choice: string): void {
    if (app.phase === "answering") app.stageChoice(choice);
    else void clips.play(choice);
  }
</script>

<div class="flex w-full max-w-md flex-col gap-3">
  <div use:roving role="group" aria-label={t("quiz.choices")} class="grid grid-cols-1 gap-2.5 sm:gap-3">
    {#each question.choices as choice, index (choice)}
      {@const playing = clips.playing === choice}
      <button
        type="button"
        aria-pressed={app.staged === choice}
        aria-label={t("quiz.soundTile", { slot: index + 1 })}
        onclick={() => pick(choice)}
        class="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:gap-5 sm:px-5 {tones[
          state(choice)
        ]}"
      >
        <span class="w-4 shrink-0 text-left text-xs font-bold opacity-60" aria-hidden="true">
          {index + 1}
        </span>
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
          aria-hidden="true"
        >
          <PlayIcon {playing} class="size-5 translate-x-px" />
        </span>
        <span class="h-10 min-w-0 flex-1">
          <Waveform
            peaks={clips.peaks(choice)}
            progress={clips.current === choice ? clips.progress : 0}
            tone={waves[state(choice)]}
          />
        </span>
      </button>
    {/each}
  </div>

  <Button
    size="lg"
    variant="brand"
    full
    disabled={app.phase !== "answering" || app.staged === null}
    onclick={() => app.submitStaged()}
  >
    {t("quiz.check")}
  </Button>
  {#if !viewport.short}
    <p class="text-center text-xs text-muted-foreground">
      {t(app.phase === "answering" ? "quiz.soundHint" : "quiz.soundCompare")}
    </p>
  {/if}
</div>
