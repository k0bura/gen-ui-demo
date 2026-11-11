// Turns the layout spec into prompt text and tool schema fragments.
//
// The prompts in prompts.ts never state a layout rule themselves. They
// splice in what these functions return, so a rule the model is told and a
// rule the code enforces are always the same rule.

import {
  SLOT_ORDER,
  trackFractions,
  type LayoutSpec,
  type SlotWidth,
} from "../layout-spec";

const SLOT_WORDS: Record<SlotWidth, string> = {
  quarter: "a quarter of the row",
  third: "a third of the row",
  half: "half the row",
  "two-thirds": "two thirds of the row",
  full: "the full row",
};

export function slotWord(slot: SlotWidth): string {
  return SLOT_WORDS[slot];
}

/** Ids of the row patterns, for the layout tool's enum. */
export function patternIds(spec: LayoutSpec): string[] {
  return spec.rowPatterns.map((p) => p.id);
}

/** Names of the text roles, for the structure tool and the prompt. */
export function roleNames(spec: LayoutSpec): string[] {
  return spec.roles.map((r) => r.role);
}

/** The narrowest slot width that still fits a track of this fraction. */
function widestMinThatFits(spec: LayoutSpec, fraction: number): SlotWidth {
  let best: SlotWidth = "quarter";
  for (const slot of SLOT_ORDER) {
    if (spec.slotFractions[slot] <= fraction + 1e-9) best = slot;
  }
  return best;
}

export function rowPatternsPrompt(spec: LayoutSpec): string {
  const lines = spec.rowPatterns.map((p) => {
    const fr = trackFractions(p);
    const limits = fr
      .map((f) => `min-width up to "${widestMinThatFits(spec, f)}"`)
      .join(" | ");
    return `  ${p.id.padEnd(16)} ${p.label.padEnd(9)} tracks ${p.tracks.join(":")}. Each slot takes ${limits}. Use for ${p.use}.`;
  });
  return [
    `ROW PATTERNS (${spec.grid.source}, ${spec.grid.columns} columns, ${spec.grid.gutterPx}px gutter). A row is always exactly one of these. There are no other row shapes.`,
    ...lines,
    `A pattern with more children than tracks wraps into further rows of the same pattern, so six cards in "3-up" make two rows of three.`,
  ].join("\n");
}

export function minWidthPrompt(spec: LayoutSpec): string {
  const widths = SLOT_ORDER.filter((s) => s in spec.slotFractions);
  return [
    `MIN-WIDTH. Every component line carries a min-width computed from its content: ${widths.map((s) => `"${s}"`).join(", ")}.`,
    `Never put a component in a slot narrower than its min-width. A "half" component fits 2-up and 1-up, and the wide side of a 2:1 row. A "full" component only fits 1-up.`,
  ].join("\n");
}

export function groupingPrompt(spec: LayoutSpec): string {
  const g = spec.grouping;
  return [
    `GROUPS. Components that share a group were made to be read together.`,
    `  - Keep a group's components in one pattern node, in id order, at most ${g.maxPerRow} to a row.`,
    `  - One group per row. Do not mix two groups in the same n-up row. The one exception is a 2:1 or 1:2 row pairing a single primary component with a single supporting one.`,
    `  - Use section nodes with headings only when there are ${g.minGroupsForSections} or more groups. With fewer, a stack of rows is enough.`,
  ].join("\n");
}

export function rolesPrompt(spec: LayoutSpec): string {
  const lines = spec.roles.map((r) => `  ${r.role.padEnd(11)} ${r.meaning}`);
  return [
    `TEXT ROLES. Mark every text element with data-role="<role>". Roles say what the text is. Code picks the size from the role and the space available, so never write a size, a class or a style.`,
    ...lines,
  ].join("\n");
}

/** The whole layout rule block, as the layout stage sees it. */
export function layoutRulesPrompt(spec: LayoutSpec): string {
  return [rowPatternsPrompt(spec), minWidthPrompt(spec), groupingPrompt(spec)].join("\n\n");
}
