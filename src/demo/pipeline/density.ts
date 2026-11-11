// What the layout stage is told about each component.
//
// The layout model never sees markup. It gets one line per component: tag,
// group, a few facts about how dense the content is, and a min-width that
// code has already worked out. That keeps the layout call small enough for
// a cheap model and makes the width rule something it reads, not something
// it has to judge.

import { SLOT_ORDER, type LayoutSpec, type SlotWidth } from "../layout-spec";
import { CHART_TAG, TABLE_TAG, type ComponentInstance } from "../types";
import { findRoleElements, stripTags } from "./markup";

export interface Density {
  minWidth: SlotWidth;
  /** Short facts, for the summary line. */
  facts: string[];
}

function atLeast(a: SlotWidth, b: SlotWidth): SlotWidth {
  return SLOT_ORDER.indexOf(a) >= SLOT_ORDER.indexOf(b) ? a : b;
}

function allMarkup(c: ComponentInstance): string {
  return [c.content ?? "", ...Object.values(c.slots ?? {})].join(" ");
}

export function describeDensity(c: ComponentInstance, spec: LayoutSpec): Density {
  const d = spec.minWidths.density;
  let min: SlotWidth = spec.minWidths.byTag[c.tagName] ?? spec.minWidths.fallback;
  const facts: string[] = [];

  if (c.tagName === TABLE_TAG && c.data?.kind === "table") {
    const cols = c.data.columns.length;
    if (cols >= d.veryWideTableColumns) min = "full";
    else if (cols >= d.wideTableColumns) min = atLeast(min, "two-thirds");
    if (c.data.title) facts.push(`title "${c.data.title.slice(0, 60)}"`);
    facts.push(`table ${cols} cols x ${c.data.rows.length} rows`);
    return { minWidth: min, facts };
  }

  if (c.tagName === CHART_TAG && c.data?.kind === "chart") {
    const labels = c.data.labels.length;
    const round = c.data.chartType === "pie" || c.data.chartType === "doughnut";
    if (round) min = "third";
    else if (labels > d.manyChartLabels) min = atLeast(min, "two-thirds");
    if (c.data.title) facts.push(`title "${c.data.title.slice(0, 60)}"`);
    facts.push(`${c.data.chartType} chart, ${labels} labels, ${c.data.datasets.length} series`);
    return { minWidth: min, facts };
  }

  const markup = allMarkup(c);
  const text = stripTags(markup);
  const roles = findRoleElements(markup);
  const title = roles.find((r) => r.role === "card-title")?.text;
  const stats = roles.filter((r) => r.role === "stat-value");
  const listItems = (markup.match(/<li\b/gi) ?? []).length;

  if (text.length >= d.veryLongTextChars) min = atLeast(min, "half");
  else if (text.length >= d.longTextChars) min = atLeast(min, "third");
  if (listItems >= 6) min = atLeast(min, "third");
  if (/<img\b/i.test(markup)) min = atLeast(min, "third");

  if (title) facts.push(`title "${title.slice(0, 60)}"`);
  if (stats.length) facts.push(`stat ${stats.map((s) => `"${s.text.slice(0, 16)}"`).join(", ")}`);
  if (listItems) facts.push(`${listItems} list items`);
  if (c.tagName === "sl-alert" && c.attributes.variant) facts.push(`variant ${c.attributes.variant}`);
  facts.push(`${text.length} chars`);
  if (!title && !stats.length && text) facts.push(`starts "${text.slice(0, 50)}"`);
  return { minWidth: min, facts };
}

/** One line per component, as the layout stage reads it. */
export function summaryLine(c: ComponentInstance, spec: LayoutSpec): string {
  const { minWidth, facts } = describeDensity(c, spec);
  return `${c.id}. <${c.tagName}> group=${c.group ?? "-"} min-width=${minWidth} | ${facts.join(" | ")}`;
}

export function summaryLines(components: ComponentInstance[], spec: LayoutSpec): string {
  return components.map((c) => summaryLine(c, spec)).join("\n");
}

/** The "what I showed" note that stands in for the assistant turn in history. */
export function conversationSummary(components: ComponentInstance[], spec: LayoutSpec): string {
  const items = components.slice(0, 12).map((c) => {
    const { facts } = describeDensity(c, spec);
    const lead = facts.find((f) => f.startsWith("title ") || f.startsWith("stat ")) ?? facts[0];
    return `${c.tagName} (${lead})`;
  });
  return [
    `I displayed ${components.length} components: ${items.join("; ")}.`,
    "Any figures came from live data tools at the time. For a follow-up, call the data tools again for fresh data.",
  ].join(" ");
}
