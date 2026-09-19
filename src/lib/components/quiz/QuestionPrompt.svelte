<script lang="ts">
  import { Board, FitText, viewport } from "kaizen-ui";
  import type { Question } from "../../quiz/questions";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  // A phone in portrait has height to spare and no width; everything else is
  // the other way round.
  const compact = $derived(!viewport.wide && viewport.short);
</script>

<div class="flex w-full flex-col items-center gap-2 sm:gap-3">
  <span class="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
    {t(`quiz.prompt.${app.settings.format}`)}
  </span>

  <Board size="lg" {compact}>
    <!-- The board is square, so a word laid out on one line has to shrink far
         below what its height would allow. Past four glyphs it takes two lines
         instead, which is how Japanese wraps anyway. The padding clears the
         dashed guide, and the cap is on the short side so a tall glyph on a
         board that is not square never spills either. -->
    <FitText
      text={question.prompt}
      cap={46}
      unit="cqmin"
      pad={8}
      perLine={4}
      lang="ja"
      class="jp font-medium"
    />
  </Board>
</div>
