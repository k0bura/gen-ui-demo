// Shared types for the manifest-driven Gen UI pipeline.

// ---------------------------------------------------------------------------
// JSON Schema (subset we emit into Anthropic tool input_schemas)
// ---------------------------------------------------------------------------

export interface PropertySchema {
  type?: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
  properties?: Record<string, PropertySchema>;
  additionalProperties?: boolean;
  items?: PropertySchema;
  required?: string[];
  default?: unknown;
}

export interface AnthropicToolInputSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: AnthropicToolInputSchema;
}

// ---------------------------------------------------------------------------
// Component spec (derived from the manifest, used by the renderer)
// ---------------------------------------------------------------------------

export interface SlotSpec {
  name: string;
  description: string;
}

export interface ComponentSpec {
  tagName: string;
  toolName: string;
  description: string;
  attributes: Record<string, PropertySchema>;
  slots: SlotSpec[];
}

// ---------------------------------------------------------------------------
// Stage 1 output — one ComponentInstance per tool_use the LLM emits.
// ---------------------------------------------------------------------------

export interface ComponentInstance {
  id: number;
  tagName: string;
  attributes: Record<string, string | number | boolean>;
  content?: string;
  slots?: Record<string, string>;
  /** Set by the structure stage: components that belong together. */
  group?: string;
  /** Payload for the two hand-written tools (render-chart, render-table). */
  data?: ChartData | TableData;
}

export interface ChartData {
  kind: "chart";
  chartType: "line" | "bar" | "pie" | "doughnut";
  title?: string;
  unit?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

export interface TableData {
  kind: "table";
  title?: string;
  caption?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

// The two hand-written component tools. Everything else comes from the
// design system manifest.
export const CHART_TAG = "render-chart";
export const TABLE_TAG = "render-table";

// ---------------------------------------------------------------------------
// Layout output — the layout tree.
// ---------------------------------------------------------------------------

export type LayoutNode =
  | LayoutRef
  | LayoutPattern
  | LayoutGrid
  | LayoutStack
  | LayoutRow
  | LayoutSection
  | LayoutTabs
  | LayoutSidebar
  | LayoutDivider;

export interface LayoutRef {
  kind: "ref";
  ref: number;
  span?: number;
}

// A row pattern from the layout spec. The closed set of ids lives in
// layout-spec.ts; the model can only pick from it. Children fill the
// pattern's tracks left to right and wrap into further rows.
export interface LayoutPattern {
  kind: "pattern";
  pattern: string;
  children: LayoutNode[];
}

// grid / row / sidebar are legacy free-form nodes. The model is no longer
// offered them and layout repair rewrites any it meets into patterns.
export interface LayoutGrid {
  kind: "grid";
  columns: number;
  gap?: GapSize;
  children: LayoutNode[];
}

export interface LayoutStack {
  kind: "stack";
  gap?: GapSize;
  align?: "start" | "center" | "end" | "stretch";
  children: LayoutNode[];
}

export interface LayoutRow {
  kind: "row";
  gap?: GapSize;
  wrap?: boolean;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  children: LayoutNode[];
}

export interface LayoutSection {
  kind: "section";
  heading?: string;
  description?: string;
  children: LayoutNode[];
}

export interface LayoutTabs {
  kind: "tabs";
  tabs: Array<{ label: string; children: LayoutNode[] }>;
}

export interface LayoutSidebar {
  kind: "sidebar";
  side: "left" | "right";
  sideWidth?: "narrow" | "medium" | "wide";
  main: LayoutNode[];
  aside: LayoutNode[];
}

export interface LayoutDivider {
  kind: "divider";
}

export type GapSize = "xs" | "sm" | "md" | "lg" | "xl";

// ---------------------------------------------------------------------------
// Pipeline events
// ---------------------------------------------------------------------------

export interface TraceEntry {
  stage: "data" | "components" | "structure" | "layout" | "repair" | "follow-ups";
  label: string;
  ok: boolean;
  ms?: number;
  note?: string;
}

/** One earlier turn, as the client remembers it. The server is stateless. */
export interface HistoryTurn {
  prompt: string;
  summary: string;
}

export interface GenerateResponse {
  components: ComponentInstance[];
  layout: LayoutNode;
  followUps: string[];
  /** Short "what I showed" note the client sends back on the next turn. */
  summary: string;
  trace: TraceEntry[];
}

export type PipelineEvent =
  | { type: "start" }
  | { type: "result"; response: GenerateResponse }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Starter prompts shown in the UI
// ---------------------------------------------------------------------------

export interface Starter {
  label: string;
  prompt: string;
}
