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
}

// ---------------------------------------------------------------------------
// Stage 2 output — the layout tree.
// ---------------------------------------------------------------------------

export type LayoutNode =
  | LayoutRef
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

export type PipelineEvent =
  | { type: "stage1-start" }
  | { type: "stage1-result"; components: ComponentInstance[] }
  | { type: "stage2-start" }
  | { type: "stage2-result"; layout: LayoutNode }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Starter prompts shown in the UI
// ---------------------------------------------------------------------------

export interface Starter {
  label: string;
  prompt: string;
}
