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

  const sideWidthMap = {
    narrow: "16rem",
    medium: "20rem",
    wide: "24rem",
  } as const;

  function gapAttr(size: GapSize | undefined): GapSize {
    return size ?? "md";
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

<!--
  All layout classes are global (`gen-*`) and defined in src/styles/global.css.
  Svelte scoped CSS hashes the universal selector inside `> * + *` rules,
  which silently drops the spacing whenever a child element (like sl-divider
  or anything rendered from another component) doesn't carry the scope hash.
  Plain global CSS sidesteps the issue.
-->

{#if node.kind === "ref"}
  {@const cmp = findComponent(node.ref)}
  {#if cmp}
    <div class="gen-ref" style={node.span ? `grid-column: span ${node.span}` : ""}>
      <ComponentRenderer instance={cmp} />
    </div>
  {:else}
    <div class="gen-missing">[missing component {node.ref}]</div>
  {/if}

{:else if node.kind === "grid"}
  <div
    class="gen-grid"
    data-gap={gapAttr(node.gap)}
    style={`grid-template-columns: repeat(${node.columns}, 1fr)`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "stack"}
  <div
    class="gen-stack"
    data-gap={gapAttr(node.gap)}
    style={`align-items: ${node.align ?? "stretch"}`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "row"}
  <div
    class="gen-row"
    data-gap={gapAttr(node.gap)}
    style={`flex-wrap: ${node.wrap === false ? "nowrap" : "wrap"}; align-items: ${node.align ?? "stretch"}; justify-content: ${justifyValue(node.justify)};`}
  >
    {#each node.children as child, i (i)}
      <LayoutTree node={child} {components} />
    {/each}
  </div>

{:else if node.kind === "section"}
  <section class="gen-section">
    {#if node.heading || node.description}
      <header class="gen-section-head">
        {#if node.heading}<h2 class="gen-section-heading">{node.heading}</h2>{/if}
        {#if node.description}<p class="gen-section-desc">{node.description}</p>{/if}
      </header>
    {/if}
    <div class="gen-section-body" data-gap="md">
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
        <div class="gen-tab-body" data-gap="md">
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
    class="gen-sidebar"
    style={node.side === "left"
      ? `grid-template-columns: ${w} 1fr`
      : `grid-template-columns: 1fr ${w}`}
  >
    {#if node.side === "left"}
      <aside class="gen-aside" data-gap="md">
        {#each node.aside as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </aside>
      <main class="gen-main" data-gap="md">
        {#each node.main as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </main>
    {:else}
      <main class="gen-main" data-gap="md">
        {#each node.main as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </main>
      <aside class="gen-aside" data-gap="md">
        {#each node.aside as child, i (i)}
          <LayoutTree node={child} {components} />
        {/each}
      </aside>
    {/if}
  </div>

{:else if node.kind === "divider"}
  <sl-divider></sl-divider>
{/if}
