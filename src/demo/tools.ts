// Stage 1: component-selection tools (manifest-driven, one per Shoelace tag)
// Stage 2: a single layout-composition tool with a recursive layout schema
//
// The Stage 1 tools come from the manifest parser. The Stage 2 tool is
// hand-defined here because the layout grammar is our own DSL, not
// something the design system manifest expresses.

import { componentTools as manifestTools } from "./manifest";
import type { AnthropicTool } from "./types";

export const componentTools = manifestTools;

// ---------------------------------------------------------------------------
// Stage 2 — layout composition
// ---------------------------------------------------------------------------

const GAP_VALUES = ["xs", "sm", "md", "lg", "xl"] as const;

// JSON Schema for a recursive layout-node union. Anthropic doesn't reliably
// resolve $ref, so we describe one level deep and document recursion in the
// tool description; the model is good at this once it sees an example.
const nodeSchema = {
  type: "object",
  description:
    "A layout node. One of: ref, grid, stack, row, section, tabs, sidebar, divider. See the tool description for the full grammar.",
  properties: {
    kind: {
      type: "string",
      enum: [
        "ref",
        "grid",
        "stack",
        "row",
        "section",
        "tabs",
        "sidebar",
        "divider",
      ],
    },
    // ref-specific
    ref: {
      type: "number",
      description: "(ref) The id of a component from Stage 1.",
    },
    span: {
      type: "number",
      description: "(ref) Optional column-span when nested inside a grid.",
    },
    // grid / stack / row / section / sidebar shared
    columns: {
      type: "number",
      description: "(grid) Number of columns.",
    },
    gap: {
      type: "string",
      enum: [...GAP_VALUES],
      description: "(grid / stack / row) Named gap between children.",
    },
    wrap: {
      type: "boolean",
      description: "(row) Whether children should wrap on overflow.",
    },
    align: {
      type: "string",
      enum: ["start", "center", "end", "stretch"],
      description: "(stack / row) Cross-axis alignment.",
    },
    justify: {
      type: "string",
      enum: ["start", "center", "end", "between", "around"],
      description: "(row) Main-axis justification.",
    },
    heading: {
      type: "string",
      description: "(section) Optional section heading.",
    },
    description: {
      type: "string",
      description: "(section) Optional section sub-heading.",
    },
    tabs: {
      type: "array",
      description:
        "(tabs) Array of { label, children } where children is a list of nodes for that tab's content.",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          children: { type: "array" },
        },
        required: ["label", "children"],
      },
    },
    side: {
      type: "string",
      enum: ["left", "right"],
      description: "(sidebar) Which side the aside is on.",
    },
    sideWidth: {
      type: "string",
      enum: ["narrow", "medium", "wide"],
      description: "(sidebar) Aside column width.",
    },
    main: {
      type: "array",
      description: "(sidebar) Main column children.",
    },
    aside: {
      type: "array",
      description: "(sidebar) Side column children.",
    },
    children: {
      type: "array",
      description:
        "(grid / stack / row / section) Child nodes. Use refs for component leaves; nest other layout nodes here for sub-layouts.",
    },
  },
  required: ["kind"],
};

export const layoutTool: AnthropicTool = {
  name: "compose_layout",
  description: `Arrange the components from Stage 1 into a layout.

The layout is a tree of nodes. Available node kinds:

  - ref       Leaf node pointing at a Stage 1 component by id.
              { kind: "ref", ref: 0, span?: 2 }
  - grid      Fixed-column grid. { kind: "grid", columns: 3, gap: "md", children: [...] }
  - stack     Vertical stack. { kind: "stack", gap: "md", children: [...] }
  - row       Horizontal row, wraps by default. { kind: "row", gap: "md", children: [...] }
  - section   Semantic group with optional heading + description.
              { kind: "section", heading: "Performance", children: [...] }
  - tabs      Tabbed group. { kind: "tabs", tabs: [{ label: "Equity", children: [...] }, ...] }
  - sidebar   Two-column main + aside. { kind: "sidebar", side: "right", main: [...], aside: [...] }
  - divider   Visual horizontal divider. { kind: "divider" }

Rules:
  - Every Stage 1 component must appear in the layout exactly once (as a ref leaf).
  - The root node is usually a section, stack, or grid.
  - Use 'tabs' to break dense content into discrete views.
  - Use 'sidebar' for primary-content + supporting-content layouts.
  - Use named gaps (xs/sm/md/lg/xl), not pixel values.`,
  input_schema: {
    type: "object",
    properties: {
      layout: nodeSchema as never,
    },
    required: ["layout"],
  },
};
