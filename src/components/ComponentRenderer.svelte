<script lang="ts">
  import "../lib/ds/index.ts";
  import type { ComponentChoice } from "../demo/types.ts";

  const TAGS: Record<ComponentChoice["component"], string> = {
    text: "jm-text",
    list: "jm-list",
    table: "jm-table",
    accordion: "jm-accordion",
    chart: "jm-chart",
  };

  let { choice }: { choice: ComponentChoice } = $props();
  let host = $state<HTMLElement | undefined>();

  $effect(() => {
    if (host) {
      (host as HTMLElement & { payload?: unknown }).payload = choice.payload;
    }
  });
</script>

<svelte:element this={TAGS[choice.component]} bind:this={host}></svelte:element>
