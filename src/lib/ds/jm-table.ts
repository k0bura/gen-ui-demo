import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { TablePayload } from "./types.ts";

@customElement("jm-table")
export class JmTable extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jm-font-sans);
      color: var(--jm-color-fg);
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9375rem;
    }
    th,
    td {
      padding: var(--jm-space-3) var(--jm-space-2);
      text-align: left;
      vertical-align: top;
    }
    thead th {
      font-weight: 600;
      border-bottom: 2px solid var(--jm-color-border);
    }
    tbody tr {
      border-bottom: 1px solid var(--jm-color-border);
    }
    tbody tr:last-child {
      border-bottom: none;
    }
  `;

  @property({ type: Object }) payload?: TablePayload;

  render() {
    const { headers = [], rows = [] } = this.payload ?? {};
    return html`
      <table>
        <thead>
          <tr>
            ${headers.map((h) => html`<th scope="col">${h}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (row) => html`
              <tr>
                ${row.map((c) => html`<td>${c}</td>`)}
              </tr>
            `
          )}
        </tbody>
      </table>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-table": JmTable;
  }
}
