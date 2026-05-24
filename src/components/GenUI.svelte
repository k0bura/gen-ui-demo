<script lang="ts">
  import "../lib/ds/index.ts";
  import { runPipeline, USE_MOCKS } from "../demo/api-client.ts";
  import type { ComponentChoice, LayoutNode } from "../demo/types.ts";
  import LayoutTree from "./LayoutTree.svelte";
  import PromptForm from "./PromptForm.svelte";

  type Stage = "idle" | "stage1" | "stage2" | "done" | "error";

  let stage = $state<Stage>("idle");
  let components = $state<ComponentChoice[]>([]);
  let layout = $state<LayoutNode | null>(null);
  let errorMsg = $state<string | null>(null);

  const busy = $derived(stage === "stage1" || stage === "stage2");

  async function submit(prompt: string) {
    stage = "stage1";
    components = [];
    layout = null;
    errorMsg = null;

    for await (const evt of runPipeline(prompt)) {
      if (evt.type === "stage1_complete") {
        components = evt.components;
      } else if (evt.type === "stage2_start") {
        stage = "stage2";
      } else if (evt.type === "stage2_complete") {
        layout = evt.layout;
        stage = "done";
      } else if (evt.type === "error") {
        stage = "error";
        errorMsg = evt.message;
      }
    }
  }

  function reset() {
    stage = "idle";
    components = [];
    layout = null;
    errorMsg = null;
  }
</script>

{#if USE_MOCKS}
  <div class="banner" role="status">
    Mock mode, every prompt returns the same demo response. Real Anthropic
    backend is wired up in a later step.
  </div>
{/if}

<PromptForm onsubmit={submit} disabled={busy} />

{#if stage === "stage1"}
  <div class="status">
    <jm-spinner label="Selecting components..."></jm-spinner>
  </div>
{:else if stage === "stage2"}
  <div class="status">
    <jm-spinner label="Arranging layout..."></jm-spinner>
    {#if components.length}
      <p class="selected">
        Selected: <span>{components.map((c) => c.component).join(", ")}</span>
      </p>
    {/if}
  </div>
{:else if stage === "error"}
  <div class="error" role="alert">
    Something went wrong: {errorMsg}
    <button type="button" onclick={reset}>Try again</button>
  </div>
{:else if stage === "done" && layout}
  <section class="result" aria-label="Generated UI">
    <LayoutTree node={layout} {components} />
  </section>

  <details class="json-viewer">
    <summary>Show the pipeline JSON</summary>
    <h3>Stage 1, selected components</h3>
    <pre>{JSON.stringify(components, null, 2)}</pre>
    <h3>Stage 2, layout</h3>
    <pre>{JSON.stringify(layout, null, 2)}</pre>
  </details>

  <button type="button" class="reset" onclick={reset}>New prompt</button>
{/if}

<style>
  .banner {
    margin-bottom: var(--jm-space-6);
    padding: var(--jm-space-3) var(--jm-space-4);
    border: 1px dashed var(--jm-color-border);
    border-radius: var(--jm-radius);
    font-size: 0.8125rem;
    color: var(--jm-color-muted);
  }
  .status {
    margin-top: var(--jm-space-8);
    display: flex;
    flex-direction: column;
    gap: var(--jm-space-3);
  }
  .selected {
    margin: 0;
    color: var(--jm-color-muted);
    font-size: 0.8125rem;
  }
  .selected span {
    color: var(--jm-color-fg);
    font-family: var(--jm-font-mono);
  }
  .error {
    margin-top: var(--jm-space-6);
    padding: var(--jm-space-4);
    border: 1px solid var(--jm-color-border);
    border-radius: var(--jm-radius);
    color: var(--jm-color-fg);
  }
  .error button {
    display: inline-block;
    margin-left: var(--jm-space-3);
    padding: var(--jm-space-1) var(--jm-space-3);
    border: 1px solid var(--jm-color-border);
    border-radius: var(--jm-radius);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .result {
    margin-top: var(--jm-space-8);
  }
  .json-viewer {
    margin-top: var(--jm-space-12);
    border-top: 1px solid var(--jm-color-border);
    padding-top: var(--jm-space-6);
  }
  .json-viewer summary {
    cursor: pointer;
    color: var(--jm-color-muted);
    font-size: 0.875rem;
  }
  .json-viewer h3 {
    margin-top: var(--jm-space-6);
    margin-bottom: var(--jm-space-2);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--jm-color-muted);
  }
  .json-viewer pre {
    margin: 0;
    padding: var(--jm-space-3);
    background: var(--jm-color-border);
    border-radius: var(--jm-radius);
    font-family: var(--jm-font-mono);
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-x: auto;
  }
  .reset {
    margin-top: var(--jm-space-6);
    padding: var(--jm-space-2) var(--jm-space-4);
    border: 1px solid var(--jm-color-border);
    border-radius: var(--jm-radius);
    background: transparent;
    color: var(--jm-color-fg);
    font-family: var(--jm-font-sans);
    font-size: 0.875rem;
    cursor: pointer;
  }
</style>
