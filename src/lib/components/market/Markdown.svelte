<script lang="ts">
  import { parseMarkdown, type Inline } from "../../packs/markdown";

  let { source }: { source: string } = $props();

  const blocks = $derived(parseMarkdown(source));
</script>

{#snippet line(parts: Inline[])}
  {#each parts as part, index (index)}
    {#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}
  {/each}
{/snippet}

<div class="flex flex-col gap-3 text-sm leading-relaxed">
  {#each blocks as block, index (index)}
    {#if block.kind === "heading" && block.level === 1}
      <h3 class="text-h4 leading-tight font-bold">{@render line(block.parts)}</h3>
    {:else if block.kind === "heading"}
      <h4 class="text-base leading-tight font-bold">{@render line(block.parts)}</h4>
    {:else if block.kind === "list" && block.ordered}
      <ol class="flex list-decimal flex-col gap-1 pl-5">
        {#each block.items as item, at (at)}<li>{@render line(item)}</li>{/each}
      </ol>
    {:else if block.kind === "list"}
      <ul class="flex list-disc flex-col gap-1 pl-5">
        {#each block.items as item, at (at)}<li>{@render line(item)}</li>{/each}
      </ul>
    {:else if block.kind === "paragraph"}
      <p>{@render line(block.parts)}</p>
    {/if}
  {/each}
</div>
