<script lang="ts">
  import { Announcer, keynav, viewport } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import ChoiceGrid from "./ChoiceGrid.svelte";
  import FeedbackPanel from "./FeedbackPanel.svelte";
  import HintBulb from "./HintBulb.svelte";
  import QuestionPrompt from "./QuestionPrompt.svelte";
  import QuitConfirm from "./QuitConfirm.svelte";
  import QuizStatusBar from "./QuizStatusBar.svelte";
  import SoundChoices from "./SoundChoices.svelte";
  import { answerSurface, isNearlyOut, promptSurface } from "../../quiz/settings";
  import TypingAnswer from "./TypingAnswer.svelte";
  import { n, t } from "../../i18n.svelte";
  import { clips } from "../../audio/clips.svelte";

  const question = $derived(app.current);
  const word = $derived(app.currentWord);
  const last = $derived(app.questions.length - 1 === app.index);
  const heard = $derived(promptSurface(app.settings.format) === "audio");
  const picksSound = $derived(answerSurface(app.settings.format) === "audio");

  // Two columns only when the window is wide *and* actually wider than it is
  // tall. A tall desktop window clears the wide breakpoint but splitting it
  // leaves both halves narrower than a phone.
  const columns = $derived(viewport.wide && viewport.landscape);

  const asked = $derived(
    question === null || app.phase !== "answering"
      ? ""
      : t("quiz.announce", {
          index: n(app.index + 1),
          total: n(app.questions.length),
          // The reading is the answer on this format, so only the prompt is read
          // out.
          prompt: heard ? t(`quiz.prompt.${app.settings.format}`) : question.prompt
        })
  );

  const said = $derived(
    question === null || app.phase !== "feedback"
      ? ""
      : `${t(app.lastTimedOut ? "quiz.time.out" : app.lastCorrect ? "quiz.correct" : "quiz.wrong")}. ${t("quiz.answerWas", {
          answer: picksSound ? (word?.reading ?? "") : question.answer
        })}`
  );

  const warned = $derived(
    app.phase === "answering" &&
      (isNearlyOut(app.questionRemaining, app.settings.perQuestionSeconds) ||
        isNearlyOut(app.totalRemaining, app.settings.totalSeconds))
      ? t("quiz.time.warning")
      : ""
  );

  function visibility(): void {
    if (document.hidden) app.pause();
    else app.resume();
  }

  function keydown(event: KeyboardEvent): void {
    if (question === null || app.confirmQuit || app.hintOpen) return;

    if (event.key === "Escape") {
      app.askQuit();
      return;
    }

    if (event.target instanceof HTMLInputElement) return;

    if (keynav.active && heard && event.key === "r") {
      app.replayPrompt();
      return;
    }

    const slot = Number(event.key);
    const inRange = keynav.active && slot >= 1 && slot <= question.choices.length;

    if (app.phase === "feedback") {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        app.next();
      } else if (inRange && picksSound) {
        void clips.play(question.choices[slot - 1]);
      }
      return;
    }

    if (app.settings.answerStyle !== "choice") return;

    if (picksSound) {
      if (inRange) app.stageChoice(question.choices[slot - 1]);
      else if (event.key === "Enter" && app.staged !== null) {
        event.preventDefault();
        app.submitStaged();
      }
      return;
    }

    if (inRange) app.answerChoice(question.choices[slot - 1]);
  }
</script>

<svelte:window onkeydown={keydown} />
<svelte:document onvisibilitychange={visibility} />

{#if app.confirmQuit}
  <QuitConfirm />
{/if}

{#if question !== null}
  <div class="flex min-h-0 flex-1 flex-col gap-3 sm:gap-6">
    <Announcer message={asked} />
    <Announcer assertive message={said} />
    <Announcer message={warned} />

    <QuizStatusBar />

    {#key app.index}
      <div
        data-section
        class="anim-pop flex min-h-0 flex-1 items-center justify-center gap-4 pb-24 {columns
          ? 'flex-row gap-8'
          : 'flex-col'}"
      >
        <div class="flex w-full flex-1 justify-center">
          <QuestionPrompt {question} />
        </div>
        <div class="flex w-full flex-1 justify-center">
          {#if app.settings.answerStyle === "typing"}
            <TypingAnswer />
          {:else if picksSound}
            <SoundChoices {question} />
          {:else}
            <ChoiceGrid {question} />
          {/if}
        </div>
      </div>
    {/key}

    {#if app.phase === "answering"}
      <HintBulb />
    {/if}

    {#if app.phase === "feedback" && word !== null}
      <FeedbackPanel {word} {last} />
    {/if}
  </div>
{/if}
