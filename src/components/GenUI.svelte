<script lang="ts">
  import { runPipeline, useMocks } from "../demo/api-client";
  import { getTurnstileToken } from "../demo/turnstile-client";
  import type { GenerateResponse, HistoryTurn } from "../demo/types";
  import LayoutTree from "./LayoutTree.svelte";
  import PromptForm from "./PromptForm.svelte";

  type Stage = "idle" | "busy" | "done" | "error";

  let stage = $state<Stage>("idle");
  let response = $state<GenerateResponse | null>(null);
  let errorMsg = $state<string | null>(null);
  let lastPrompt = $state("");
  let mocks = $state(false);

  // The conversation, as the client remembers it: each earlier prompt and
  // the short "what I showed" note the server returned for it. The server
  // keeps nothing, so this is sent with every request.
  let history = $state<HistoryTurn[]>([]);

  $effect(() => {
    mocks = useMocks();
  });

  // Wall-clock timer. `now` ticks while busy; elapsed is derived.
  let startedAt = $state<number | null>(null);
  let now = $state(Date.now());

  const busy = $derived(stage === "busy");
  const elapsedSeconds = $derived(startedAt ? Math.floor((now - startedAt) / 1000) : 0);

  // The server answers once, when every stage is done, so these are timed
  // labels and not progress events. They follow the order the stages run in.
  const messages = [
    "Fetching live data...",
    "Choosing components and filling them in...",
    "Deciding the order, the groups and what each piece of text is...",
    "Laying out the page from the row patterns...",
    "Checking the layout against the spec and setting the type...",
    "Still working. Long answers take a little longer...",
  ];
  const currentMessage = $derived(messages[Math.min(Math.floor(elapsedSeconds / 7), messages.length - 1)]);

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

  // Where Cloudflare Turnstile mounts. It stays empty unless a visitor
  // needs an interactive challenge.
  let turnstileEl: HTMLDivElement | null = $state(null);

  async function submit(prompt: string) {
    stage = "busy";
    errorMsg = null;
    lastPrompt = prompt;
    const sent = $state.snapshot(history) as HistoryTurn[];

    for await (const evt of runPipeline(prompt, sent, () => getTurnstileToken(turnstileEl))) {
      if (evt.type === "result") {
        response = evt.response;
        history = [...history, { prompt, summary: evt.response.summary }].slice(-6);
        stage = "done";
      } else if (evt.type === "error") {
        stage = "error";
        errorMsg = evt.message;
      }
    }
  }

  function reset() {
    stage = "idle";
    response = null;
    errorMsg = null;
    history = [];
    lastPrompt = "";
  }

  const stageNames: Record<string, string> = {
    data: "data tool",
    components: "components",
    structure: "structure",
    layout: "layout",
    repair: "code pass",
    "follow-ups": "follow-ups",
  };
</script>

{#if mocks}
  <sl-alert variant="primary" open class="banner">
    <sl-icon slot="icon" name="info-circle"></sl-icon>
    <strong>Mock mode.</strong> Every prompt returns the same canned answer, written with
    mistakes on purpose and then run through the real code passes. Remove
    <code>?mock</code> from the URL for the live pipeline.
  </sl-alert>
{/if}

<PromptForm onsubmit={submit} disabled={busy} />
<div class="turnstile-slot" bind:this={turnstileEl}></div>

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
          {#if history.length}
            <span class="dot">·</span>
            <span>follow-up {history.length + 1} in this conversation</span>
          {/if}
        </div>
      </div>
    </div>
    <div class="thinking-hint">
      One prompt is four to seven model calls plus the data fetches, run one
      after another. Expect 30 to 120 seconds.
    </div>
  </div>
{:else if stage === "error"}
  <sl-alert variant="danger" open class="error-alert">
    <sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
    <strong>Something went wrong.</strong> {errorMsg}
    <sl-button slot="action" variant="default" size="small" onclick={reset}>
      Start over
    </sl-button>
  </sl-alert>
{:else if stage === "done" && response}
  <section class="result" aria-label="Generated UI">
    <p class="result-prompt"><span>You asked</span> {lastPrompt}</p>
    <LayoutTree node={response.layout} components={response.components} />
  </section>

  {#if response.followUps.length}
    <div class="followups">
      <span class="followups-label">Ask next</span>
      {#each response.followUps as f (f)}
        <button type="button" class="followup" onclick={() => submit(f)}>{f}</button>
      {/each}
    </div>
  {/if}

  <details class="json-viewer">
    <summary>Show what the pipeline did</summary>
    <h3>Trace</h3>
    <ol class="trace">
      {#each response.trace as t, i (i)}
        <li class:failed={!t.ok}>
          <span class="trace-stage">{stageNames[t.stage] ?? t.stage}</span>
          <span class="trace-label">{t.label}</span>
          {#if t.ms !== undefined}<span class="trace-ms">{t.ms} ms</span>{/if}
          {#if t.note}<span class="trace-note">{t.note}</span>{/if}
        </li>
      {/each}
    </ol>
    <h3>Components</h3>
    <pre>{JSON.stringify(response.components, null, 2)}</pre>
    <h3>Layout</h3>
    <pre>{JSON.stringify(response.layout, null, 2)}</pre>
    <h3>Conversation memory sent with the next prompt</h3>
    <pre>{JSON.stringify(history, null, 2)}</pre>
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
  .result-prompt {
    margin: 0 0 var(--space-6);
    color: var(--color-fg-muted);
    font-size: 0.875rem;
  }
  .result-prompt span {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
    font-weight: 600;
    margin-right: var(--space-2);
    color: var(--color-fg-dim);
  }
  .followups {
    margin-top: var(--space-8);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .followups-label {
    color: var(--color-fg-muted);
    font-size: 0.875rem;
    margin-right: var(--space-2);
  }
  .followup {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-surface-2);
    border-radius: 999px;
    background: var(--color-accent-soft);
    color: var(--color-fg);
    font-family: var(--font-sans);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .followup:hover {
    border-color: var(--color-accent);
  }
  .trace {
    list-style: none;
    margin: 0;
    padding: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
  }
  .trace li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-surface-2);
  }
  .trace-stage {
    color: var(--color-accent);
    min-width: 6.5rem;
  }
  .trace-label {
    color: var(--color-fg);
    overflow-wrap: anywhere;
  }
  .trace-ms {
    color: var(--color-fg-dim);
  }
  .trace-note {
    color: var(--color-fg-muted);
    flex-basis: 100%;
    padding-left: 7rem;
  }
  .trace li.failed .trace-stage {
    color: var(--color-warning);
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
  .turnstile-slot:not(:empty) {
    margin-top: 0.75rem;
  }
</style>
