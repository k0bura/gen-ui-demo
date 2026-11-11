import { LAYOUT_SPEC } from "../src/demo/layout-spec";
import { normalizeContext } from "../src/demo/pipeline/run";
import type { ComponentInstance } from "../src/demo/types";

export const spec = LAYOUT_SPEC;
export const ctx = normalizeContext(spec);

const stat = (value: string, label: string) =>
  `<span data-role="stat-value">${value}</span><span data-role="stat-label">${label}</span>`;

export const card = (id: number, group?: string, text = "Short text."): ComponentInstance => ({
  id,
  tagName: "sl-card",
  attributes: {},
  content: `<p data-role="body">${text}</p>`,
  ...(group ? { group } : {}),
});

export const statCard = (id: number, group = "figures", value = "18 °C"): ComponentInstance => ({
  id,
  tagName: "sl-card",
  attributes: {},
  content: stat(value, "High"),
  group,
});

export const table = (id: number, columns: number, group?: string): ComponentInstance => ({
  id,
  tagName: "render-table",
  attributes: {},
  data: {
    kind: "table",
    title: "T",
    columns: Array.from({ length: columns }, (_, i) => `c${i}`),
    rows: [Array.from({ length: columns }, (_, i) => i)],
  },
  ...(group ? { group } : {}),
});

export const chart = (id: number, group?: string): ComponentInstance => ({
  id,
  tagName: "render-chart",
  attributes: {},
  data: { kind: "chart", chartType: "line", title: "C", labels: ["a", "b"], datasets: [{ label: "s", data: [1, 2] }] },
  ...(group ? { group } : {}),
});

export const ref = (id: number) => ({ kind: "ref", ref: id });
