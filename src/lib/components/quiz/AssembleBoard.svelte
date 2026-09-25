<script lang="ts">
  import { tick } from "svelte";
  import { Announcer, Glyph, roving, Strokes, WoodBlock, WoodTray, type TrayCell } from "kaizen-ui";
  import { app } from "../../state.svelte";
  import { loose, positionOf, trayDone, viewBoxOf, type Block, type Puzzle } from "../../quiz/assemble";
  import { n, t } from "../../i18n.svelte";

  let { puzzle }: { puzzle: Puzzle } = $props();

  let pileElement = $state<HTMLDivElement | null>(null);

  const answering = $derived(app.phase === "answering");
  const pile = $derived(loose(puzzle, app.board));

  function nameOf(element: string): string {
    const key = `components.${element}`;
    const name = t(key);
    return name === key ? element : `${element}, ${name}`;
  }

  function trayName(index: number): string {
    const tray = puzzle.trays[index];
    return t("quiz.assemble.tray", {
      kind: t(tray.kana ? "quiz.assemble.kana" : "quiz.assemble.kanji"),
      index: n(index + 1)
    });
  }

  function blockAt(slot: number): Block | null {
    const held = app.board[slot];
    return held === null || held === undefined ? null : (puzzle.blocks[held] ?? null);
  }

  function slotName(slot: number): string {
    const { tray, rect } = puzzle.slots[slot];
    return `${trayName(tray)}, ${t(`quiz.assemble.position.${positionOf(rect)}`)}`;
  }

  function cellsOf(slots: readonly number[]): TrayCell[] {
    return slots.map((slot) => {
      const block = blockAt(slot);
      return {
        rect: puzzle.slots[slot].rect,
        label: t("quiz.assemble.slot", {
          tray: trayName(puzzle.slots[slot].tray),
          position: t(`quiz.assemble.position.${positionOf(puzzle.slots[slot].rect)}`),
          content: block === null ? t("quiz.assemble.empty") : nameOf(block.element)
        }),
        filled: block !== null,
        ghost: app.ghosted && puzzle.hints.includes(slot),
        selected: answering && app.slot === slot
      };
    });
  }

  function answerFor(slot: number): Block | undefined {
    return puzzle.blocks.find((block) => block.element === puzzle.slots[slot].element);
  }

  const said = $derived.by(() => {
    const move = app.move;
    if (move === null) return "";
    const block = puzzle.blocks[move.block];
    if (block === undefined) return "";
    if (move.kind === "done") {
      return t("quiz.assemble.done", { character: puzzle.trays[puzzle.slots[move.slot].tray].character });
    }
    return t(`quiz.assemble.${move.kind}`, { block: nameOf(block.element), slot: slotName(move.slot) });
  });

  async function placed(block: number, at: number): Promise<void> {
    app.placeBlock(block);
    await tick();
    const buttons = pileElement?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    buttons[Math.min(at, buttons.length - 1)]?.focus();
  }
</script>

{#snippet face(block: Block)}
  {#if block.strokes.length > 0}
    <Strokes strokes={block.strokes} viewBox={viewBoxOf(block.strokes, block.rect)} class="size-full" />
  {:else}
    <Glyph text={block.face} class="text-[min(3rem,70cqmin)] leading-none font-medium" />
  {/if}
{/snippet}

<div class="flex w-full flex-col items-center gap-6">
  <Announcer message={said} />

  <div
    data-section
    role="group"
    aria-label={t("quiz.assemble.slots")}
    class="flex flex-wrap items-start justify-center gap-3"
    use:roving={{ selector: "[data-slot]:not([disabled])" }}
  >
    {#each puzzle.trays as tray, index (index)}
      <WoodTray
        label={trayName(index)}
        cells={cellsOf(tray.slots)}
        done={trayDone(puzzle, app.board, index)}
        class={tray.kana ? "w-24 sm:w-28" : "w-32 sm:w-40"}
        onslot={(cell) => app.selectSlot(tray.slots[cell])}
      >
        {#snippet cell(at)}
          {@const slot = tray.slots[at]}
          {@const shown = blockAt(slot) ?? answerFor(slot)}
          {#if shown !== undefined}
            <span class="flex size-full items-center justify-center [container-type:size]">
              {@render face(shown)}
            </span>
          {/if}
        {/snippet}
        {#snippet glyph()}
          <Glyph
            text={tray.character}
            class="{tray.kana ? 'text-[4rem]' : 'text-[6rem]'} leading-none font-medium"
          />
        {/snippet}
      </WoodTray>
    {/each}
  </div>

  <div
    bind:this={pileElement}
    data-section
    role="group"
    aria-label={t("quiz.assemble.pile")}
    class="flex min-h-[5rem] flex-wrap items-end justify-center gap-3"
    use:roving
  >
    {#each pile as block, at (block.id)}
      <WoodBlock
        label={nameOf(block.element)}
        cols={block.rect[2]}
        rows={block.rect[3]}
        disabled={!answering}
        class="[container-type:size]"
        onclick={() => placed(block.id, at)}
      >
        {@render face(block)}
      </WoodBlock>
    {/each}
  </div>
</div>
