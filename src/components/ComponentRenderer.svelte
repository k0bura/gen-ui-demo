<script lang="ts">
  import type { ComponentInstance } from "../demo/types";
  import ChartRenderer from "./ChartRenderer.svelte";
  import TableRenderer from "./TableRenderer.svelte";

  interface Props {
    instance: ComponentInstance;
  }

  let { instance }: Props = $props();

  // Materialise any library tag with the supplied attributes and slot
  // markup. One host element, attributes and children set imperatively, so
  // arbitrary tag names work without a switch statement.
  //
  // The markup was cleaned on the server (see pipeline/normalize.ts) before
  // it got here: no scripts, styles, event handlers or unknown elements.
  let host: HTMLElement | undefined = $state();

  $effect(() => {
    if (!host) return;

    host.innerHTML = "";
    for (const attr of [...host.attributes]) {
      if (attr.name === "class" || attr.name === "style") continue;
      host.removeAttribute(attr.name);
    }

    for (const [name, value] of Object.entries(instance.attributes ?? {})) {
      if (value === false || value === undefined || value === null) continue;
      if (value === true) host.setAttribute(name, "");
      else host.setAttribute(name, String(value));
    }

    if (instance.content) {
      const wrap = document.createElement("div");
      wrap.innerHTML = instance.content;
      while (wrap.firstChild) host.appendChild(wrap.firstChild);
    }

    for (const [slotName, value] of Object.entries(instance.slots ?? {})) {
      if (!value) continue;
      const wrap = document.createElement("div");
      wrap.setAttribute("slot", slotName);
      wrap.innerHTML = value;
      host.appendChild(wrap);
    }
  });
</script>

{#if instance.data?.kind === "chart"}
  <ChartRenderer data={instance.data} />
{:else if instance.data?.kind === "table"}
  <TableRenderer data={instance.data} />
{:else}
  <svelte:element this={instance.tagName} bind:this={host} class="rendered-component"></svelte:element>
{/if}

<style>
  /* No display override: each library component manages its own display.
     The wrapping .gen-ref in LayoutTree provides the layout context. */
  .rendered-component {
    max-width: 100%;
  }
</style>
