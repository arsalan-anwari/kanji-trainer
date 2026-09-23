<script lang="ts">
  import { Button, Glyph, Icon, roving } from "kaizen-ui";
  import SetIcon from "./SetIcon.svelte";
  import type { SetGroup } from "../../content/sets";
  import type { Word } from "../../content/types";
  import { n, t } from "../../i18n.svelte";

  let {
    tree,
    openByDefault,
    isOn,
    ontoggle,
    onset
  }: {
    tree: SetGroup<Word>[];
    openByDefault: boolean;
    isOn: (id: string) => boolean;
    ontoggle: (id: string) => void;
    onset: (ids: string[], on: boolean) => void;
  } = $props();
</script>

{#each tree as branch (branch.set)}
  {@const ids = branch.groups.flatMap((group) => group.words.map((word) => word.id))}
  {@const taken = ids.filter(isOn).length}
  {@const label = t(`common.set.${branch.set}`)}
  <details data-section open={openByDefault} class="rounded-2xl border-2 border-border bg-surface">
    <summary
      class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-bold [&::-webkit-details-marker]:hidden"
    >
      <SetIcon set={branch.set} />
      <span>{label}</span>
      <span class="text-sm font-normal tabular-nums text-muted-foreground">
        {t("setup.words.taken", { taken: n(taken), total: n(ids.length) })}
      </span>
      <Icon name="chevron-down" class="ml-auto size-4 text-muted-foreground" />
    </summary>

    <div class="flex flex-col gap-4 border-t-2 border-border px-4 py-4">
      {#each branch.groups as group (group.subcategory)}
        {@const groupIds = group.words.map((word) => word.id)}
        {@const groupLabel = t(`common.subcategory.${group.subcategory}`)}
        <details open={openByDefault} class="rounded-xl border-2 border-border bg-surface">
          <summary
            class="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 font-bold [&::-webkit-details-marker]:hidden"
          >
            <SetIcon set={branch.set} subcategory={group.subcategory} />
            <span>{groupLabel}</span>
            <span class="text-xs font-normal tabular-nums text-muted-foreground">
              {t("setup.words.taken", {
                taken: n(groupIds.filter(isOn).length),
                total: n(groupIds.length)
              })}
            </span>
            <span
              role="presentation"
              class="ml-auto flex gap-2"
              onclick={(event) => event.stopPropagation()}
            >
              <Button size="sm" variant="outline" onclick={() => onset(groupIds, true)}>
                <Icon name="select-all" />
                {t("setup.words.all")}
              </Button>
              <Button size="sm" variant="outline" onclick={() => onset(groupIds, false)}>
                <Icon name="select-none" />
                {t("setup.words.clear")}
              </Button>
            </span>
            <Icon name="chevron-down" class="size-4 text-muted-foreground" />
          </summary>
          <div
            use:roving
            role="group"
            aria-label={t("setup.words.group", { label: groupLabel })}
            class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 border-t border-wire p-3"
          >
            {#each group.words as word (word.id)}
              {@const on = isOn(word.id)}
              <button
                type="button"
                aria-pressed={on}
                class="flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {on
                  ? 'border-selected bg-selected-soft'
                  : 'border-wire bg-surface opacity-50 hover:bg-accent'}"
                onclick={() => ontoggle(word.id)}
              >
                <span class="flex flex-col">
                  <Glyph text={word.written} class="text-lg font-bold" />
                  <Glyph text={word.reading} class="text-sm text-muted-foreground" />
                </span>
                <span class="text-xs leading-snug text-muted-foreground">{word.meaning}</span>
              </button>
            {/each}
          </div>
        </details>
      {/each}
    </div>
  </details>
{/each}
