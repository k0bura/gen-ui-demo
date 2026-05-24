import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { TextPayload } from "./types.ts";

@customElement("jm-text")
export class JmText extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jm-font-sans);
      color: var(--jm-color-fg);
    }
    p {
      margin: 0;
      line-height: 1.7;
    }
  `;

  @property({ type: Object }) payload?: TextPayload;

  render() {
    return html`<p>${this.payload?.body ?? ""}</p>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-text": JmText;
  }
}
