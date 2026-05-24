import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ListPayload } from "./types.ts";

@customElement("jm-list")
export class JmList extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jm-font-sans);
      color: var(--jm-color-fg);
    }
    ol,
    ul {
      margin: 0;
      padding-left: 1.5rem;
      line-height: 1.7;
    }
    li {
      margin-bottom: var(--jm-space-2);
    }
    li:last-child {
      margin-bottom: 0;
    }
  `;

  @property({ type: Object }) payload?: ListPayload;

  render() {
    const items = this.payload?.items ?? [];
    return this.payload?.variant === "ordered"
      ? html`<ol>
          ${items.map((i) => html`<li>${i}</li>`)}
        </ol>`
      : html`<ul>
          ${items.map((i) => html`<li>${i}</li>`)}
        </ul>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-list": JmList;
  }
}
