import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("jm-spinner")
export class JmSpinner extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--jm-space-2);
      font-family: var(--jm-font-sans);
      color: var(--jm-color-muted);
      font-size: 0.875rem;
    }
    .ring {
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      border: 2px solid var(--jm-color-border);
      border-top-color: var(--jm-color-accent);
      animation: spin 700ms linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation-duration: 3s;
      }
    }
  `;

  @property({ type: String }) label = "Loading";

  render() {
    return html`
      <span class="ring" aria-hidden="true"></span>
      <span role="status" aria-live="polite">${this.label}</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-spinner": JmSpinner;
  }
}
