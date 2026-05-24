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

  // Wall-clock based timer. `now` ticks every 250ms via the interval;
  // `startedAt` is set when we transition into a busy stage. elapsed is
  // derived from the two so the effect only manages interval lifecycle,
  // never the reactive read path.
  let startedAt = $state<number | null>(null);
  let now = $state(Date.now());

  const busy = $derived(stage === "stage1" || stage === "stage2");

  const elapsedSeconds = $derived(
    startedAt ? Math.floor((now - startedAt) / 1000) : 0,
  );

  // Rotating status messages for Stage 1 (the long wait). One every ~6s,
  // ordered roughly to track what Opus is doing under the hood. None
  // promise progress they can't deliver - just convey "still working".
  const stage1Messages = [
    "Reading the design system manifest...",
    "Picking the right Shoelace components for your prompt...",
    "Drafting card headers and content...",
    "Filling in attributes and slots...",
    "Choosing icons and variants...",
    "Reviewing the component set as a whole...",
    "Almost there, finalizing the selection...",
  ];

  const messageIndex = $derived(
    Math.min(Math.floor(elapsedSeconds / 6), stage1Messages.length - 1),
  );

  const currentMessage = $derived(
    stage === "stage2"
      ? "Arranging components into a layout..."
      : stage1Messages[messageIndex],
  );

  // Interval lifecycle only - no reactive writes here besides `now`.
  $effect(() => {
    if (!busy) return;
    startedAt = Date.now();
    now = Date.now();
    const id = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => {
      clearInterval(id);
      startedAt = null;
    };
  });

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}:${r.toString().padStart(2, "0")}` : `${r}s`;
  }

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

{#if busy}
  <div class="thinking" role="status" aria-live="polite">
    <div class="thinking-head">
      <sl-spinner class="thinking-spinner"></sl-spinner>
      <div class="thinking-text">
        {#key currentMessage}
          <div class="thinking-headline">{currentMessage}</div>
        {/key}
        <div class="thinking-meta">
          <span class="elapsed">{formatElapsed(elapsedSeconds)} elapsed</span>
          {#if stage === "stage2" && components.length}
            <span class="dot">·</span>
            <span>{components.length} components ready</span>
          {/if}
        </div>
      </div>
    </div>
    {#if stage === "stage2" && components.length}
      <p class="thinking-selected">
        Picked: <code>{components.map((c) => c.tagName).join(", ")}</code>
      </p>
    {/if}
    <div class="thinking-hint">
      Stage 1 (component selection) typically takes 30 - 120 seconds.
      Stage 2 (layout) is fast.
    </div>
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
  .thinking {
    margin-top: var(--space-8);
    padding: var(--space-5) var(--space-6);
    background: var(--color-surface);
    border: 1px solid var(--color-surface-2);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .thinking-head {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .thinking-spinner {
    font-size: 1.5rem;
    --indicator-color: var(--color-accent);
    --track-color: var(--color-surface-2);
    flex-shrink: 0;
  }
  .thinking-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .thinking-headline {
    color: var(--color-fg);
    font-size: 0.95rem;
    font-weight: 500;
    /* Smooth fade between rotating messages */
    animation: thinking-fade 0.3s ease-out;
  }
  .thinking-meta {
    color: var(--color-fg-muted);
    font-size: 0.8125rem;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
  }
  .elapsed {
    font-variant-numeric: tabular-nums;
  }
  .dot {
    opacity: 0.5;
  }
  .thinking-selected {
    margin: 0;
    color: var(--color-fg-muted);
    font-size: 0.8125rem;
    line-height: 1.6;
  }
  .thinking-selected code {
    font-family: var(--font-mono);
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--color-fg);
  }
  .thinking-hint {
    color: var(--color-fg-dim);
    font-size: 0.75rem;
    border-top: 1px solid var(--color-surface-2);
    padding-top: var(--space-3);
  }
  @keyframes thinking-fade {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
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
