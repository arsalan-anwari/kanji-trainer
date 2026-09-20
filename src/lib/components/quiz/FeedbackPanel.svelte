<script lang="ts">
  import { Button, Glyph } from "kaizen-ui";
  import type { Word } from "../../content/types";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let { word, last }: { word: Word; last: boolean } = $props();

  const alternates = $derived(word.readings.filter((reading) => reading !== word.reading));
</script>

<div
  class="anim-pop fade-edge fixed inset-x-0 bottom-0 z-30 pt-8 pr-[calc(env(safe-area-inset-right,0px)+1rem)] pb-[calc(var(--nav-bar)+1rem)] pl-[calc(env(safe-area-inset-left,0px)+1rem)]"
  style="--tint: color-mix(in srgb, {app.lastCorrect
    ? 'var(--success)'
    : 'var(--danger)'} 26%, transparent)"
>
  <div class="mx-auto flex w-full max-w-xl items-center justify-between gap-4">
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="text-h4 font-bold {app.lastCorrect ? 'text-success' : 'text-danger'}">
        {t(app.lastCorrect ? "quiz.correct" : "quiz.wrong")}
      </span>
      <span class="text-sm text-foreground">
        <Glyph text={word.written} class="font-bold" />
        =
        <Glyph text={word.reading} />
        {#if alternates.length > 0}
          <span class="text-muted-foreground">
            ({t("quiz.alsoReads", { list: alternates.join(", ") })})
          </span>
        {/if}
      </span>
      <span class="truncate text-xs text-muted-foreground">{word.meaning}</span>
    </div>
    <span class="shrink-0">
      <Button size="lg" variant="primary" onclick={() => app.next()}>
        {t(last ? "quiz.finish" : "quiz.continue")}
      </Button>
    </span>
  </div>
</div>
