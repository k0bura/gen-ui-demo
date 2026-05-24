import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AccordionPayload } from "./types.ts";

@customElement("jm-accordion")
export class JmAccordion extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jm-font-sans);
      color: var(--jm-color-fg);
    }
    details {
      border-bottom: 1px solid var(--jm-color-border);
    }
    details:first-of-type {
      border-top: 1px solid var(--jm-color-border);
    }
    summary {
      list-style: none;
      cursor: pointer;
      padding: var(--jm-space-4) 0;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: var(--jm-space-3);
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary::before {
      content: "+";
      font-variant-numeric: tabular-nums;
      width: 1rem;
      flex-shrink: 0;
      color: var(--jm-color-muted);
      transition: transform 150ms ease;
    }
    details[open] > summary::before {
      content: "−";
    }
    .content {
      padding: 0 0 var(--jm-space-4) calc(1rem + var(--jm-space-3));
      line-height: 1.7;
      color: var(--jm-color-muted);
    }
  `;

  @property({ type: Object }) payload?: AccordionPayload;

  render() {
    const items = this.payload?.items ?? [];
    return html`
      ${items.map(
        (item) => html`
          <details>
            <summary>${item.title}</summary>
            <div class="content">${item.content}</div>
          </details>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-accordion": JmAccordion;
  }
}
