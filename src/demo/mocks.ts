import type { ComponentInstance, LayoutNode } from "./types";

// One Shoelace component per ComponentInstance. The renderer turns each
// into <sl-tag attribute="..."> with optional content + slot children.

export const MOCK_COMPONENTS: ComponentInstance[] = [
  {
    id: 0,
    tagName: "sl-card",
    attributes: {},
    slots: {
      header: "Asset allocation",
    },
    content:
      "A 60/20/15/5 mix balances long-horizon growth with enough fixed income to soften drawdowns.",
  },
  {
    id: 1,
    tagName: "sl-progress-ring",
    attributes: { value: 60, "track-width": 8 },
    content: "60%",
  },
  {
    id: 2,
    tagName: "sl-progress-ring",
    attributes: { value: 20, "track-width": 8 },
    content: "20%",
  },
  {
    id: 3,
    tagName: "sl-progress-ring",
    attributes: { value: 15, "track-width": 8 },
    content: "15%",
  },
  {
    id: 4,
    tagName: "sl-progress-ring",
    attributes: { value: 5, "track-width": 8 },
    content: "5%",
  },
  {
    id: 5,
    tagName: "sl-badge",
    attributes: { variant: "primary", pill: true },
    content: "US Stocks",
  },
  {
    id: 6,
    tagName: "sl-badge",
    attributes: { variant: "neutral", pill: true },
    content: "Intl Stocks",
  },
  {
    id: 7,
    tagName: "sl-badge",
    attributes: { variant: "warning", pill: true },
    content: "Bonds",
  },
  {
    id: 8,
    tagName: "sl-badge",
    attributes: { variant: "success", pill: true },
    content: "Cash",
  },
  {
    id: 9,
    tagName: "sl-alert",
    attributes: { variant: "primary", open: true },
    content:
      "Rebalance once a year and stay diversified across sectors and geographies. Keep cash high enough to avoid selling stocks in a downturn.",
  },
  {
    id: 10,
    tagName: "sl-details",
    attributes: { summary: "Why this mix?" },
    content:
      "Higher equity weighting means deeper drawdowns in bear markets but stronger compounding over a 20+ year horizon. International exposure adds currency risk on top of equity risk. A 15% bond allocation is light by traditional rules of thumb and reflects a long-horizon investor's tolerance for volatility.",
  },
];

export const MOCK_LAYOUT: LayoutNode = {
  kind: "section",
  heading: "Q3 portfolio snapshot",
  description: "A balanced 60/20/15/5 allocation, presented for review.",
  children: [
    { kind: "ref", ref: 0 },
    {
      kind: "stack",
      gap: "lg",
      children: [
        {
          kind: "row",
          gap: "lg",
          justify: "around",
          align: "center",
          children: [
            {
              kind: "stack",
              align: "center",
              gap: "sm",
              children: [
                { kind: "ref", ref: 1 },
                { kind: "ref", ref: 5 },
              ],
            },
            {
              kind: "stack",
              align: "center",
              gap: "sm",
              children: [
                { kind: "ref", ref: 2 },
                { kind: "ref", ref: 6 },
              ],
            },
            {
              kind: "stack",
              align: "center",
              gap: "sm",
              children: [
                { kind: "ref", ref: 3 },
                { kind: "ref", ref: 7 },
              ],
            },
            {
              kind: "stack",
              align: "center",
              gap: "sm",
              children: [
                { kind: "ref", ref: 4 },
                { kind: "ref", ref: 8 },
              ],
            },
          ],
        },
        { kind: "divider" },
        { kind: "ref", ref: 9 },
        { kind: "ref", ref: 10 },
      ],
    },
  ],
};
