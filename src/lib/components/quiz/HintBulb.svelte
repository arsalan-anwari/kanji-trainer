<script lang="ts">
  import { IconButton, lockScroll } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { t } from "../../i18n.svelte";

  let broken = $state(false);
  let safe = $state<HTMLDivElement | null>(null);

  const shown = $derived(
    app.hint !== null && app.hint.kind === "image" && broken ? app.hintFallback : app.hint
  );

  $effect(() => {
    if (app.hintOpen) safe?.querySelector("button")?.focus();
  });

  $effect(() => {
    app.index;
    broken = false;
  });

  function keydown(event: KeyboardEvent): void {
    if (app.hintOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      app.hideHint();
    }
  }
</script>

<svelte:window onkeydown={keydown} />

{#if app.hint !== null && !app.ghosted}
  <div
    data-section
    class="fixed end-[calc(max(env(safe-area-inset-left,0px),env(safe-area-inset-right,0px))+var(--edge-x))] bottom-[calc(var(--nav-bar)+var(--edge-y))] z-30"
  >
    <IconButton
      icon="lightbulb"
      label={t("quiz.hint.open")}
      class="animate-none hover:animate-pulse focus-visible:animate-pulse motion-reduce:animate-none"
      onclick={() => app.showHint()}
    />
  </div>
{/if}

{#if app.hintOpen && shown !== null}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    use:lockScroll={() => app.hideHint()}
  >
    <button
      type="button"
      class="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      aria-label={t("common.close")}
      onclick={() => app.hideHint()}
    ></button>

    <div
      class="anim-pop sheet ruled relative flex w-full max-w-md flex-col gap-4 rounded-2xl border-2 border-border bg-surface p-5 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hint-title"
      aria-describedby="hint-body"
    >
      <h2 id="hint-title" class="text-h3 leading-tight font-bold">
        {t(`quiz.hint.kind.${shown.kind}`)}
      </h2>

      <div id="hint-body" class="flex flex-col gap-2">
        {#if shown.kind === "image"}
          <img
            src={shown.text}
            alt={t("quiz.hint.picture")}
            class="mx-auto aspect-square w-full max-w-64 rounded-xl object-contain picture-plate"
            onerror={() => (broken = true)}
          />
        {:else}
          <p
            lang={shown.lang}
            dir="auto"
            class="text-base leading-snug {shown.kind === 'romaji' ? 'font-semibold' : ''}"
          >
            {shown.text}
          </p>
        {/if}
      </div>

      <div bind:this={safe} class="w-full">
        <IconButton
          icon="close"
          label={t("quiz.hint.close")}
          class="mx-auto"
          onclick={() => app.hideHint()}
        />
      </div>
    </div>
  </div>
{/if}
