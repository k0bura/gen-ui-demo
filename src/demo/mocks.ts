import type { ComponentChoice, LayoutNode } from "./types.ts";

export const MOCK_COMPONENTS: ComponentChoice[] = [
  {
    name: "allocation_chart",
    component: "chart",
    payload: {
      kind: "doughnut",
      label: "Asset allocation",
      data: [
        { label: "US Stocks", value: 60 },
        { label: "Intl Stocks", value: 20 },
        { label: "Bonds", value: 15 },
        { label: "Cash", value: 5 },
      ],
    },
  },
  {
    name: "allocation_table",
    component: "table",
    payload: {
      headers: ["Asset Class", "Target", "Rationale"],
      rows: [
        ["US Stocks", "60%", "Long-horizon growth engine"],
        ["Intl Stocks", "20%", "Geographic diversification"],
        ["Bonds", "15%", "Volatility dampening"],
        ["Cash", "5%", "Near-term liquidity"],
      ],
    },
  },
  {
    name: "summary_text",
    component: "text",
    payload: {
      body: "A 60/20/15/5 mix balances long-horizon growth with enough fixed income to soften drawdowns. Rebalance once a year and stay diversified across sectors and geographies.",
    },
  },
  {
    name: "tradeoffs_list",
    component: "list",
    payload: {
      variant: "unordered",
      items: [
        "Higher equity weighting means deeper drawdowns in bear markets.",
        "International exposure adds currency risk on top of equity risk.",
        "A 15% bond allocation is light by traditional rules of thumb.",
        "Keep cash high enough to avoid selling stocks in a downturn.",
      ],
    },
  },
];

export const MOCK_LAYOUT: LayoutNode = {
  kind: "container",
  direction: "column",
  children: [
    {
      kind: "container",
      direction: "row",
      children: [
        { kind: "component", name: "allocation_chart" },
        { kind: "component", name: "allocation_table" },
      ],
    },
    { kind: "component", name: "summary_text" },
    { kind: "component", name: "tradeoffs_list" },
  ],
};
