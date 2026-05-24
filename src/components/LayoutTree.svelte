<script lang="ts">
  import type { LayoutNode, ComponentChoice } from "../demo/types.ts";
  import ComponentRenderer from "./ComponentRenderer.svelte";
  import LayoutTree from "./LayoutTree.svelte";

  let { node, components }: { node: LayoutNode; components: ComponentChoice[] } = $props();

  const find = (name: string) => components.find((c) => c.name === name);
</script>

{#if node.kind === "component"}
  {@const choice = find(node.name)}
  {#if choice}
    <div class="leaf">
      <ComponentRenderer {choice} />
    </div>
  {:else}
    <p class="missing">[missing component: {node.name}]</p>
  {/if}
{:else}
  <div class="container" class:row={node.direction === "row"} class:column={node.direction === "column"}>
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>
{/if}

<style>
  .container {
    display: flex;
    gap: 2rem;
  }
  .container.row {
    flex-wrap: wrap;
  }
  .container.column {
    flex-direction: column;
  }
  .container.row > :global(*) {
    flex: 1 1 16rem;
    min-width: 0;
  }
  .leaf {
    min-width: 0;
  }
  .missing {
    color: var(--jm-color-muted);
    font-style: italic;
  }
</style>
