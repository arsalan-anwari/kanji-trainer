<script lang="ts">
  import { Board, Projector, RecordPlayer, viewport } from "kaizen-ui";
  import { clips } from "../../audio/clips.svelte";
  import { isAssembly, isJapanese, promptSurface } from "../../quiz/settings";
  import type { Question } from "../../quiz/questions";
  import { app } from "../../state.svelte";
  import { CONTENT_LANG, langOf } from "../../content/locale";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  const surface = $derived(promptSurface(app.settings.format));
  const japanese = $derived(isJapanese(surface));

  // A phone in portrait has height to spare and no width; everything else is
  // the other way round.
  const compact = $derived(!viewport.wide && viewport.short);

  const playing = $derived(clips.playing === question.prompt);
  const lang = $derived(app.currentWord === null ? CONTENT_LANG : langOf(app.currentWord));
  const meaning = $derived(isAssembly(app.settings.format) ? (app.currentWord?.meaning ?? "") : "");
</script>

<div class="flex w-full flex-col items-center gap-2 sm:gap-3">
  <span class="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
    {t(`quiz.prompt.${app.settings.format}`)}
  </span>

  {#if surface === "audio"}
    <div class="w-full {compact ? 'h-[min(6.5rem,14dvh)] max-w-sm' : 'max-w-[13rem] sm:max-w-[15rem]'}">
      <RecordPlayer
        {compact}
        {playing}
        peaks={clips.peaks(question.prompt)}
        progress={clips.current === question.prompt ? clips.progress : 0}
        label={t("quiz.prompt.replay")}
        onplay={() => app.replayPrompt()}
      />
    </div>
  {:else if surface === "image"}
    <Projector size="lg" {compact}>
      <img
        src={question.prompt}
        alt={t("quiz.prompt.imageAlt")}
        class="aspect-square w-full max-w-full rounded-xl object-contain p-2"
      />
    </Projector>
  {:else}
    <Board
      size="lg"
      {compact}
      text={question.prompt}
      jp={japanese}
      lang={surface === "meaning" ? lang : undefined}
    />
    {#if meaning !== ""}
      <p {lang} dir="auto" class="text-h4 font-semibold">{meaning}</p>
    {/if}
  {/if}
</div>
