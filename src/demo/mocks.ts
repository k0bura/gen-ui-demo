// Offline mode. The component list and layout below are written the way a
// model might return them, including a few mistakes on purpose: an inline
// style, an invented class, a row that is too narrow for its table, a
// component left out of the layout. The mock response is produced by
// running them through the real code passes (normalize, layout repair,
// typeset), so mock mode shows those passes working without an API key.

import { LAYOUT_SPEC } from "./layout-spec";
import { conversationSummary } from "./pipeline/density";
import { repairLayout } from "./pipeline/layout-repair";
import { normalizeComponents } from "./pipeline/normalize";
import { normalizeContext } from "./pipeline/run";
import { typeset } from "./pipeline/typeset";
import type { ComponentInstance, GenerateResponse, TraceEntry } from "./types";

const DAYS = [
  ["Wed", "Mostly clear", 18, 7, 0],
  ["Thu", "Partly cloudy", 20, 10, 0],
  ["Fri", "Mostly clear", 21, 11, 8],
  ["Sat", "Rain", 17, 12, 78],
  ["Sun", "Rain showers", 16, 10, 55],
  ["Mon", "Partly cloudy", 17, 8, 12],
  ["Tue", "Clear", 18, 7, 0],
] as const;

const stat = (eyebrow: string, value: string, label: string): string =>
  `<span data-role="eyebrow">${eyebrow}</span><span data-role="stat-value">${value}</span><span data-role="stat-label">${label}</span>`;

export const MOCK_RAW_COMPONENTS: ComponentInstance[] = [
  { id: 0, tagName: "sl-card", attributes: {}, group: "key-figures", content: stat("Warmest", "21 °C", "Friday's high") },
  { id: 1, tagName: "sl-card", attributes: {}, group: "key-figures", content: stat("Coolest", "7 °C", "Overnight low, Wed and Tue") },
  {
    id: 2,
    tagName: "sl-card",
    attributes: {},
    group: "key-figures",
    // An inline style and an invented class. Normalize removes both.
    content: `<span data-role="eyebrow">Wettest</span><span data-role="stat-value" style="font-size:64px" class="huge-number">78%</span><span data-role="stat-label">Chance of rain, Saturday</span>`,
  },
  { id: 3, tagName: "sl-card", attributes: {}, group: "key-figures", content: stat("Dry days", "4 of 7", "Under 10% chance of rain") },
  {
    id: 4,
    tagName: "render-chart",
    attributes: {},
    group: "trend",
    data: {
      kind: "chart",
      chartType: "line",
      title: "Daily high and low",
      unit: "°C",
      labels: DAYS.map((d) => d[0]),
      datasets: [
        { label: "High", data: DAYS.map((d) => d[2]) },
        { label: "Low", data: DAYS.map((d) => d[3]) },
      ],
    },
  },
  {
    id: 5,
    tagName: "sl-alert",
    // No `open`, and closable. Normalize opens it and makes it stay.
    attributes: { variant: "warning", closable: true },
    group: "advice",
    content: "<p><strong>Plan indoor time for the weekend.</strong> Saturday and Sunday carry most of the week's rain.</p>",
  },
  {
    id: 6,
    tagName: "render-table",
    attributes: {},
    group: "by-day",
    data: {
      kind: "table",
      title: "Kyoto, day by day",
      caption: "Sample data for mock mode. The live demo fetches this from Open-Meteo.",
      columns: ["Day", "Conditions", "High °C", "Low °C", "Rain %"],
      rows: DAYS.map((d) => [...d]),
    },
  },
  {
    id: 7,
    tagName: "sl-details",
    attributes: { summary: "About this forecast" },
    group: "notes",
    content: "<p>Highs and lows are rounded to whole degrees. Chance of rain is the highest hourly probability for the day.</p>",
  },
];

// What a layout model might send back. The table is squeezed into a third
// of a row, the key figures are split across two rows, there is a
// free-form grid, and component 7 is missing.
export const MOCK_RAW_LAYOUT = {
  kind: "section",
  heading: "Kyoto, next 7 days",
  children: [
    { kind: "grid", columns: 2, children: [{ kind: "ref", ref: 0 }, { kind: "ref", ref: 1 }] },
    { kind: "pattern", pattern: "2-up", children: [{ kind: "ref", ref: 2 }, { kind: "ref", ref: 3 }] },
    { kind: "pattern", pattern: "2-up-wide-left", children: [{ kind: "ref", ref: 4 }, { kind: "ref", ref: 5 }] },
    { kind: "pattern", pattern: "3-up", children: [{ kind: "ref", ref: 6 }] },
  ],
};

export const MOCK_FOLLOW_UPS = [
  "Compare Kyoto with Osaka this week",
  "What is the USD to JPY rate today?",
  "Tell me about Kyoto's history",
];

export function mockResponse(): GenerateResponse {
  const spec = LAYOUT_SPEC;
  const trace: TraceEntry[] = [
    { stage: "components", label: "mock: canned component list", ok: true },
  ];
  const normalized = normalizeComponents(MOCK_RAW_COMPONENTS, normalizeContext(spec));
  if (normalized.fixes.length) {
    trace.push({ stage: "repair", label: "normalize", ok: true, note: normalized.fixes.join("; ") });
  }
  const repaired = repairLayout(MOCK_RAW_LAYOUT, normalized.components, spec);
  trace.push({ stage: "layout", label: "mock: canned layout, with mistakes", ok: true });
  if (repaired.fixes.length) {
    trace.push({ stage: "repair", label: "layout repair", ok: true, note: repaired.fixes.join("; ") });
  }
  return {
    components: typeset(normalized.components, repaired.layout, spec),
    layout: repaired.layout,
    followUps: MOCK_FOLLOW_UPS,
    summary: conversationSummary(normalized.components, spec),
    trace,
  };
}
