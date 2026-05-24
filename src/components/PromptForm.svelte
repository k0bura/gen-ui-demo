<script lang="ts">
  import { STARTERS } from "../demo/starters.ts";

  let {
    onsubmit,
    disabled = false,
  }: { onsubmit: (prompt: string) => void; disabled?: boolean } = $props();

  let value = $state("");

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onsubmit(trimmed);
  }

  function clickStarter(prompt: string) {
    value = prompt;
    onsubmit(prompt);
  }
</script>

<form onsubmit={handleSubmit}>
  <label for="gen-ui-prompt" class="sr">Your prompt</label>
  <textarea
    id="gen-ui-prompt"
    bind:value
    rows="3"
    {disabled}
    placeholder="Ask anything, the LLM will pick UI components and arrange them for you."
  ></textarea>
  <div class="actions">
    <button type="submit" {disabled} class="primary">
      Generate
    </button>
  </div>
</form>

<div class="starters">
  <span class="label">Or try:</span>
  <ul>
    {#each STARTERS as starter}
      <li>
        <button type="button" {disabled} onclick={() => clickStarter(starter.prompt)}>
          {starter.label}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--jm-space-3);
  }
  textarea {
    width: 100%;
    padding: var(--jm-space-3);
    border: 1px solid var(--jm-color-border);
    border-radius: var(--jm-radius);
    background: var(--jm-color-bg);
    color: var(--jm-color-fg);
    font-family: var(--jm-font-sans);
    font-size: 0.9375rem;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
  }
  textarea:focus {
    outline: 2px solid var(--jm-color-accent);
    outline-offset: 2px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .primary {
    padding: var(--jm-space-2) var(--jm-space-6);
    border: 1px solid var(--jm-color-fg);
    border-radius: var(--jm-radius);
    background: var(--jm-color-fg);
    color: var(--jm-color-bg);
    font-family: var(--jm-font-sans);
    font-size: 0.9375rem;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .starters {
    margin-top: var(--jm-space-4);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--jm-space-3);
  }
  .starters .label {
    color: var(--jm-color-muted);
    font-size: 0.875rem;
  }
  .starters ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--jm-space-2);
  }
  .starters button {
    padding: var(--jm-space-1) var(--jm-space-3);
    border: 1px solid var(--jm-color-border);
    border-radius: 999px;
    background: transparent;
    color: var(--jm-color-fg);
    font-family: var(--jm-font-sans);
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .starters button:hover:not(:disabled) {
    border-color: var(--jm-color-fg);
  }
  .starters button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
