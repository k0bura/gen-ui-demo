<script lang="ts">
  import { runPipeline, USE_MOCKS } from "../demo/api-client";
  import type { ComponentInstance, LayoutNode } from "../demo/types";
  import LayoutTree from "./LayoutTree.svelte";
  import PromptForm from "./PromptForm.svelte";

  type Stage = "idle" | "stage1" | "stage2" | "done" | "error";

  let stage = $state<Stage>("idle");
  let components = $state<ComponentInstance[]>([]);
  let layout = $state<LayoutNode | null>(null);
  let errorMsg = $state<string | null>(null);

  const busy = $derived(stage === "stage1" || stage === "stage2");

  async function submit(prompt: string) {
    stage = "stage1";
    components = [];
    layout = null;
    errorMsg = null;

    for await (const evt of runPipeline(prompt)) {
      if (evt.type === "stage1-result") {
        components = evt.components;
      } else if (evt.type === "stage2-start") {
        stage = "stage2";
      } else if (evt.type === "stage2-result") {
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
  <sl-alert variant="primary" open class="banner">
    <sl-icon slot="icon" name="info-circle"></sl-icon>
    <strong>Mock mode.</strong> Every prompt returns the same demo response. Live Anthropic backend lands in a follow-up commit.
  </sl-alert>
{/if}

<PromptForm onsubmit={submit} disabled={busy} />

{#if stage === "stage1"}
  <div class="status">
    <sl-spinner></sl-spinner>
    <span>Selecting components...</span>
  </div>
{:else if stage === "stage2"}
  <div class="status">
    <sl-spinner></sl-spinner>
    <span>Arranging layout...</span>
    {#if components.length}
      <p class="selected">
        Picked
        <code>{components.length}</code>
        components:
        <code>{components.map((c) => c.tagName).join(", ")}</code>
      </p>
    {/if}
  </div>
{:else if stage === "error"}
  <sl-alert variant="danger" open class="error-alert">
    <sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
    <strong>Something went wrong.</strong> {errorMsg}
    <sl-button slot="action" variant="default" size="small" onclick={reset}>
      Try again
    </sl-button>
  </sl-alert>
{:else if stage === "done" && layout}
  <section class="result" aria-label="Generated UI">
    <LayoutTree node={layout} {components} />
  </section>

  <details class="json-viewer">
    <summary>Show the pipeline JSON</summary>
    <h3>Stage 1 — selected components</h3>
    <pre>{JSON.stringify(components, null, 2)}</pre>
    <h3>Stage 2 — layout</h3>
    <pre>{JSON.stringify(layout, null, 2)}</pre>
  </details>

  <div class="reset-row">
    <sl-button variant="default" size="medium" onclick={reset}>
      Start over
    </sl-button>
  </div>
{/if}

<style>
  .banner {
    margin-bottom: var(--space-6);
  }
  .status {
    margin-top: var(--space-8);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    color: var(--color-fg-muted);
  }
  .selected {
    width: 100%;
    margin: var(--space-2) 0 0;
    color: var(--color-fg-muted);
    font-size: 0.875rem;
  }
  .selected code {
    font-family: var(--font-mono);
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--color-fg);
  }
  .error-alert {
    margin-top: var(--space-6);
  }
  .result {
    margin-top: var(--space-8);
  }
  .json-viewer {
    margin-top: var(--space-12);
    border-top: 1px solid var(--color-surface-2);
    padding-top: var(--space-6);
  }
  .json-viewer summary {
    cursor: pointer;
    color: var(--color-fg-muted);
    font-size: 0.875rem;
  }
  .json-viewer h3 {
    margin-top: var(--space-6);
    margin-bottom: var(--space-2);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .json-viewer pre {
    margin: 0;
    padding: var(--space-3);
    background: var(--color-bg);
    border: 1px solid var(--color-surface-2);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-x: auto;
  }
  .reset-row {
    margin-top: var(--space-6);
  }
</style>
