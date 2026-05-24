import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import type { ChartPayload } from "./types.ts";

const PALETTE = [
  "#0f766e",
  "#1e293b",
  "#b45309",
  "#1d4ed8",
  "#7c3aed",
  "#be123c",
  "#15803d",
  "#a16207",
  "#374151",
  "#6d28d9",
];

@customElement("jm-chart")
export class JmChart extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--jm-font-sans);
      color: var(--jm-color-fg);
    }
    figure {
      margin: 0;
      max-width: 32rem;
    }
    figcaption {
      font-size: 0.875rem;
      color: var(--jm-color-muted);
      margin-top: var(--jm-space-2);
    }
    canvas {
      max-width: 100%;
      height: auto;
    }
  `;

  @property({ type: Object }) payload?: ChartPayload;

  private canvasRef = createRef<HTMLCanvasElement>();
  private chart: unknown;

  async firstUpdated() {
    await this.renderChart();
  }

  async updated() {
    await this.renderChart();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart && typeof (this.chart as { destroy: () => void }).destroy === "function") {
      (this.chart as { destroy: () => void }).destroy();
    }
  }

  private async renderChart() {
    if (!this.payload || !this.canvasRef.value) return;
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    Chart.defaults.backgroundColor = PALETTE;
    Chart.defaults.borderColor = PALETTE;
    if (this.chart && typeof (this.chart as { destroy: () => void }).destroy === "function") {
      (this.chart as { destroy: () => void }).destroy();
    }
    this.chart = new Chart(this.canvasRef.value, {
      type: this.payload.kind,
      data: {
        labels: this.payload.data.map((d) => d.label),
        datasets: [{ label: this.payload.label, data: this.payload.data.map((d) => d.value) }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "right" },
          title: { display: false },
        },
      },
    });
  }

  render() {
    const ariaLabel = this.payload
      ? `${this.payload.kind} chart titled "${this.payload.label}" with ${this.payload.data.length} data points`
      : "chart";
    return html`
      <figure>
        <canvas ${ref(this.canvasRef)} role="img" aria-label=${ariaLabel}></canvas>
        ${this.payload?.label
          ? html`<figcaption>${this.payload.label}</figcaption>`
          : null}
      </figure>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "jm-chart": JmChart;
  }
}
