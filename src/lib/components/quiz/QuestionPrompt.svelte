<script lang="ts">
  import { Board, FitText, Projector, viewport } from "kaizen-ui";
  import { isJapanese, promptSurface } from "../../quiz/settings";
  import type { Question } from "../../quiz/questions";
  import { darkImageUrl } from "../../quiz/hints";
  import { isDarkTheme } from "../../theme.svelte";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let { question }: { question: Question } = $props();

  const surface = $derived(promptSurface(app.settings.format));
  const japanese = $derived(isJapanese(surface));
  const dark = $derived(isDarkTheme());

  // A phone in portrait has height to spare and no width; everything else is
  // the other way round.
  const compact = $derived(!viewport.wide && viewport.short);

  const imgSrc = $derived(dark ? darkImageUrl(question.prompt) : question.prompt);
</script>

<div class="flex w-full flex-col items-center gap-2 sm:gap-3">
  <span class="text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">
    {t(`quiz.prompt.${app.settings.format}`)}
  </span>

  {#if surface === "image"}
    <Projector size="lg" {compact}>
      <img
        src={imgSrc}
        alt={t("quiz.prompt.imageAlt")}
        class="aspect-square w-full max-w-full rounded-xl object-contain p-2"
      />
    </Projector>
  {:else}
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
        perLine={japanese ? 4 : 12}
        em={japanese ? 1 : 0.55}
        lang={japanese ? "ja" : undefined}
        class="font-medium {japanese ? 'jp' : ''}"
      />
    </Board>
  {/if}
</div>
