export interface TextPayload {
  body: string;
}

export interface ListPayload {
  variant: "ordered" | "unordered";
  items: string[];
}

export interface TablePayload {
  headers: string[];
  rows: string[][];
}

export interface AccordionPayload {
  items: { title: string; content: string }[];
}

export type ChartKind = "bar" | "line" | "doughnut" | "pie";

export interface ChartPayload {
  kind: ChartKind;
  label: string;
  data: { label: string; value: number }[];
}

export interface SpinnerPayload {
  label?: string;
}

export type ComponentPayload =
  | { component: "text"; payload: TextPayload }
  | { component: "list"; payload: ListPayload }
  | { component: "table"; payload: TablePayload }
  | { component: "accordion"; payload: AccordionPayload }
  | { component: "chart"; payload: ChartPayload };
