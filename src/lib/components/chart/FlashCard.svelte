<script lang="ts">
  import { Glyph, PlayIcon } from "kaizen-ui";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { listed, type CardFace } from "../../browse/cards";
  import { clips } from "../../audio/clips.svelte";
  import { t } from "../../i18n.svelte";
  import cnFlag from "../../assets/flags/cn.svg";
  import jpFlag from "../../assets/flags/jp.svg";

  const FLIP_MS = 140;

  let { face, image, audio }: { face: CardFace; image: string; audio: string | null } = $props();

  let flipped = $state(false);
  let squashed = $state(false);
  let pictureMissing = $state(false);

  const label = $derived([face.written, face.kana, face.romaji, face.meaning].join(", "));
  const playing = $derived(audio !== null && clips.playing === audio);

  function flip(): void {
    if (squashed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      flipped = !flipped;
      return;
    }
    squashed = true;
    setTimeout(() => {
      flipped = !flipped;
      squashed = false;
    }, FLIP_MS);
  }

  const round =
    "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
</script>

{#snippet readings(items: string[])}
  <span class="jp" lang="ja">
    {#each listed(items) as item, index (index)}<span class="whitespace-nowrap">{item}</span>{/each}
  </span>
{/snippet}

<div
  role="group"
  aria-label={label}
  class="flex w-full flex-col gap-2 rounded-xl border-2 border-border bg-surface p-3 transition-transform ease-in-out"
  style="transform: scaleX({squashed ? 0 : 1}); transition-duration: {FLIP_MS}ms"
>
  <div class="grid grid-cols-1">
    <div
      data-face="front"
      class="flex flex-col items-center justify-center gap-2 [grid-area:1/1] {flipped
        ? 'invisible'
        : ''}"
    >
      {#if !pictureMissing}
        <img
          src={image}
          alt=""
          loading="lazy"
          onerror={() => (pictureMissing = true)}
          class="aspect-square w-3/4 object-contain"
        />
      {/if}
      <Glyph text={face.written} class="text-center text-3xl font-bold break-all" />
    </div>
    <div
      data-face="back"
      class="flex min-w-0 flex-col gap-1.5 [grid-area:1/1] {flipped ? '' : 'invisible'}"
    >
      <Glyph text={face.kana} class="text-lg font-bold" />
      <span class="text-sm text-muted-foreground">{face.romaji}</span>
      <span class="text-sm">{face.meaning}</span>
      {#each face.kanji as entry (entry.character)}
        <span
          class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1.5 border-t border-wire pt-1.5 text-xs"
        >
          <Glyph text={entry.character} class="col-span-2 text-base font-bold" />
          <img src={cnFlag} alt="" class="mt-0.5 h-3 w-auto rounded-[2px]" />
          {@render readings(entry.on)}
          <img src={jpFlag} alt="" class="mt-0.5 h-3 w-auto rounded-[2px]" />
          {@render readings(entry.kun)}
        </span>
      {/each}
    </div>
  </div>

  <div class="flex items-center justify-center gap-3">
    {#if audio !== null}
      <button
        type="button"
        data-play
        aria-label={t("chart.play", { word: face.written })}
        onclick={() => clips.toggle(audio)}
        class="{round} {flipped || squashed ? 'invisible' : ''} {playing
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-surface text-foreground hover:bg-accent'}"
      >
        <PlayIcon {playing} class="size-5 translate-x-px" />
      </button>
    {/if}
    <button
      type="button"
      data-flip
      aria-pressed={flipped}
      aria-label={t("chart.flip", { word: face.written })}
      onclick={flip}
      class="{round} border-border bg-surface text-foreground hover:bg-accent"
    >
      <RotateCcw class="size-5" aria-hidden="true" />
    </button>
  </div>
</div>
