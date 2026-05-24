<script lang="ts">
  import type {
    LayoutNode,
    ComponentInstance,
    GapSize,
  } from "../demo/types";
  import ComponentRenderer from "./ComponentRenderer.svelte";
  import LayoutTree from "./LayoutTree.svelte";

  interface Props {
    node: LayoutNode;
    components: ComponentInstance[];
  }

  let { node, components }: Props = $props();

  const gapMap: Record<GapSize, string> = {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2.5rem",
  };

  const sideWidthMap = {
    narrow: "16rem",
    medium: "20rem",
    wide: "24rem",
  } as const;

  function gap(size: GapSize | undefined): string {
    return gapMap[size ?? "md"];
  }

  function justifyValue(j: string | undefined): string {
    switch (j) {
      case "start": return "flex-start";
      case "center": return "center";
      case "end": return "flex-end";
      case "between": return "space-between";
      case "around": return "space-around";
      default: return "flex-start";
    }
  }

  function findComponent(ref: number): ComponentInstance | undefined {
    return components.find((c) => c.id === ref);
  }
</script>

{#if node.kind === "ref"}
  {@const cmp = findComponent(node.ref)}
  {#if cmp}
    <div class="ref" style={node.span ? `grid-column: span ${node.span}` : ""}>
      <ComponentRenderer instance={cmp} />
    </div>
  {:else}
    <div class="missing">[missing component {node.ref}]</div>
  {/if}

{:else if node.kind === "grid"}
  <div
    class="grid"
    style={`grid-template-columns: repeat(${node.columns}, 1fr); gap: ${gap(node.gap)}`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "stack"}
  <div
    class="stack"
    style={`gap: ${gap(node.gap)}; align-items: ${node.align ?? "stretch"}`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "row"}
  <div
    class="row"
    style={`gap: ${gap(node.gap)}; flex-wrap: ${node.wrap === false ? "nowrap" : "wrap"}; align-items: ${node.align ?? "stretch"}; justify-content: ${justifyValue(node.justify)};`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "section"}
  <section class="section">
    {#if node.heading || node.description}
      <header class="section-head">
        {#if node.heading}<h2 class="section-heading">{node.heading}</h2>{/if}
        {#if node.description}<p class="section-desc">{node.description}</p>{/if}
      </header>
    {/if}
    <div class="section-body">
      {#each node.children as child, i (i)}
        <LayoutTree node={child} {components} />
      {/each}
    </div>
  </section>

{:else if node.kind === "tabs"}
  <sl-tab-group>
    {#each node.tabs as tab, i (i)}
      <sl-tab slot="nav" panel={`tab-${i}`}>{tab.label}</sl-tab>
    {/each}
    {#each node.tabs as tab, i (i)}
      <sl-tab-panel name={`tab-${i}`}>
        <div class="tab-body">
          {#each tab.children as child, j (j)}
            <LayoutTree node={child} {components} />
          {/each}
        </div>
      </sl-tab-panel>
    {/each}
  </sl-tab-group>

{:else if node.kind === "sidebar"}
  {@const w = sideWidthMap[node.sideWidth ?? "medium"]}
  <div
    class="sidebar"
    style={node.side === "left"
      ? `grid-template-columns: ${w} 1fr`
      : `grid-template-columns: 1fr ${w}`}
  >
    {#if node.side === "left"}
      <aside class="aside">
        {#each node.aside as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </aside>
      <main class="main">
        {#each node.main as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </main>
    {:else}
      <main class="main">
        {#each node.main as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </main>
      <aside class="aside">
        {#each node.aside as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </aside>
    {/if}
  </div>

{:else if node.kind === "divider"}
  <sl-divider></sl-divider>
{/if}

<style>
  .ref { min-width: 0; }
  .grid { display: grid; width: 100%; }
  .stack { display: flex; flex-direction: column; }
  .row { display: flex; flex-direction: row; }
  .section { width: 100%; }
  .section-head { margin-bottom: var(--space-4); }
  .section-heading {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 var(--space-1);
  }
  .section-desc {
    margin: 0;
    color: var(--color-fg-muted);
    font-size: 0.95em;
  }
  .section-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .sidebar { display: grid; gap: var(--space-6); width: 100%; }
  .aside,
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }
  .missing {
    color: var(--color-error);
    font-family: var(--font-mono);
    font-size: 0.85em;
  }
</style>
