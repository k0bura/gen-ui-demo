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

    // Default slot — content is usually prose, but allow markup (the
    // model sometimes inlines small elements like <strong> or <sl-icon>).
    if (instance.content) {
      const wrap = document.createElement("span");
      wrap.innerHTML = normalizeContent(instance.content);
      while (wrap.firstChild) host.appendChild(wrap.firstChild);
    }

    // Named slots — these very commonly hold Shoelace elements
    // (icons in `icon` slots, buttons in `action` slots, etc.) so we
    // parse the value as HTML rather than text.
    for (const [slotName, value] of Object.entries(instance.slots ?? {})) {
      if (!value) continue;
      const wrap = document.createElement("span");
      wrap.setAttribute("slot", slotName);
      wrap.innerHTML = value;
      host.appendChild(wrap);
    }
  });

  // The LLM sometimes falls back to <br><br> for paragraph breaks even
  // when the prompt asks for semantic HTML. Convert double-<br> to real
  // <p> boundaries so the renderer's typography CSS can space them.
  function normalizeContent(raw: string): string {
    const trimmed = raw.trim();
    // Already structured — leave alone.
    if (/<\s*(p|h[1-6]|ul|ol|div|section|article)\b/i.test(trimmed)) {
      return trimmed;
    }
    // Has any <br><br> → split into paragraphs.
    if (/<\s*br\s*\/?>\s*<\s*br\s*\/?>/i.test(trimmed)) {
      const paragraphs = trimmed
        .split(/(?:<\s*br\s*\/?>\s*){2,}/i)
        .map((p) => p.replace(/<\s*br\s*\/?>/gi, " ").trim())
        .filter(Boolean)
        .map((p) => `<p>${p}</p>`)
        .join("");
      return paragraphs;
    }
    return trimmed;
  }
</script>

<svelte:element this={instance.tagName} bind:this={host} class="rendered-component"></svelte:element>

<style>
  /* No display override — each Shoelace component manages its own
     intrinsic display (sl-alert / sl-card are block; sl-badge / sl-icon
     are inline-block; etc.). The wrapping .ref div in LayoutTree
     provides the layout context. */
  .rendered-component {
    max-width: 100%;
  }
</style>
