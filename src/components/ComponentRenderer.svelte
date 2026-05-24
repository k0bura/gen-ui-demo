<script lang="ts">
  import type { ComponentInstance } from "../demo/types";

  interface Props {
    instance: ComponentInstance;
  }

  let { instance }: Props = $props();

  // Materialize any Shoelace (or other custom-element) tag with the supplied
  // attributes + slot content. We use one host element and set attributes /
  // innerHTML imperatively so we can support arbitrary tag names without a
  // big switch statement.
  let host: HTMLElement | undefined = $state();

  $effect(() => {
    if (!host) return;

    // Reset
    host.innerHTML = "";
    for (const attr of [...host.attributes]) {
      if (attr.name === "class" || attr.name === "style") continue;
      host.removeAttribute(attr.name);
    }

    // Attributes
    for (const [name, value] of Object.entries(instance.attributes ?? {})) {
      if (value === false || value === undefined || value === null) continue;
      if (value === true) host.setAttribute(name, "");
      else host.setAttribute(name, String(value));
    }

    // Default slot content
    if (instance.content) {
      host.appendChild(document.createTextNode(instance.content));
    }

    // Named slots
    for (const [slotName, value] of Object.entries(instance.slots ?? {})) {
      if (!value) continue;
      const span = document.createElement("span");
      span.setAttribute("slot", slotName);
      span.textContent = value;
      host.appendChild(span);
    }
  });
</script>

<svelte:element this={instance.tagName} bind:this={host} class="rendered-component"></svelte:element>

<style>
  .rendered-component {
    display: inline-block;
    max-width: 100%;
  }
</style>
