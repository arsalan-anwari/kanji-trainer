<script lang="ts">
  import { Glyph } from "kaizen-ui";
  import { listed, type CardFace } from "../../browse/cards";
  import cnFlag from "../../assets/flags/cn.svg";
  import jpFlag from "../../assets/flags/jp.svg";

  const FLIP_MS = 140;

  let { face, image }: { face: CardFace; image: string } = $props();

  let flipped = $state(false);
  let squashed = $state(false);
  let pictureMissing = $state(false);

  const label = $derived([face.written, face.kana, face.romaji, face.meaning].join(", "));

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
</script>

{#snippet readings(items: string[])}
  <span class="jp" lang="ja">
    {#each listed(items) as item, index (index)}<span class="whitespace-nowrap">{item}</span>{/each}
  </span>
{/snippet}

<button
  type="button"
  aria-pressed={flipped}
  aria-label={label}
  onclick={flip}
  class="grid w-full grid-cols-1 cursor-pointer rounded-xl border-2 border-border bg-surface p-3 text-left transition-transform ease-in-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  style="transform: scaleX({squashed ? 0 : 1}); transition-duration: {FLIP_MS}ms"
>
  <span
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
  </span>
  <span data-face="back" class="flex min-w-0 flex-col gap-1.5 [grid-area:1/1] {flipped ? '' : 'invisible'}">
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
  </span>
</button>
