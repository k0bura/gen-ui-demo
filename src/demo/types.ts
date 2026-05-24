import type {
  TextPayload,
  ListPayload,
  TablePayload,
  AccordionPayload,
  ChartPayload,
} from "../lib/ds/types.ts";

export type ComponentKind = "text" | "list" | "table" | "accordion" | "chart";

export type ComponentChoice =
  | { name: string; component: "text"; payload: TextPayload }
  | { name: string; component: "list"; payload: ListPayload }
  | { name: string; component: "table"; payload: TablePayload }
  | { name: string; component: "accordion"; payload: AccordionPayload }
  | { name: string; component: "chart"; payload: ChartPayload };

export type LayoutNode =
  | { kind: "container"; direction: "row" | "column"; children: LayoutNode[] }
  | { kind: "component"; name: string };

export type PipelineEvent =
  | { type: "stage1_start" }
  | { type: "stage1_complete"; components: ComponentChoice[] }
  | { type: "stage2_start" }
  | { type: "stage2_complete"; layout: LayoutNode }
  | { type: "error"; message: string };

export interface Starter {
  label: string;
  prompt: string;
}
