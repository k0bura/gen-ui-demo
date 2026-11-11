// Typesetting: the model says what a piece of text is, code decides how
// big it is.
//
// Each data-role has a ladder of type styles in the layout spec. For every
// component we know the width of the slot it landed in, so we can estimate
// whether the text fits at the top of the ladder and step down until it
// does. Roles marked sharedAcrossGroup take the smallest size any member
// of the group needed, so cards in one row carry matching titles.

import {
  roleByName,
  roleClass,
  typeClass,
  type LayoutSpec,
} from "../layout-spec";
import type { ComponentInstance, LayoutNode } from "../types";
import { assignSlots } from "./layout-repair";
import { findRoleElements, setRoleClasses } from "./markup";

/** Index into a role's ladder: the first style at which the text fits. */
export function fitOnLadder(
  spec: LayoutSpec,
  role: string,
  text: string,
  innerWidthPx: number,
): number {
  const r = roleByName(spec, role);
  if (!r) return 0;
  for (let i = 0; i < r.ladder.length; i++) {
    const style = spec.typeStyles[r.ladder[i]];
    const textPx = text.length * style.sizePx * spec.avgCharWidthEm;
    const lines = Math.max(1, Math.ceil(textPx / Math.max(1, innerWidthPx)));
    if (lines <= r.maxLines) return i;
  }
  return r.ladder.length - 1;
}

const OWNED = (c: string) => c.startsWith("gx-type-") || c.startsWith("gx-role-");

export function typeset(
  components: ComponentInstance[],
  layout: LayoutNode,
  spec: LayoutSpec,
): ComponentInstance[] {
  const widths = new Map(assignSlots(layout, spec).map((s) => [s.ref, s.widthPx]));
  const inner = (c: ComponentInstance) =>
    (widths.get(c.id) ?? spec.grid.canvasPx) - 2 * spec.grid.cardPaddingPx;

  const markupOf = (c: ComponentInstance) => [c.content ?? "", ...Object.values(c.slots ?? {})];

  // First pass: the step each component needs for each role on its own.
  const need = new Map<number, Map<string, number>>();
  for (const c of components) {
    const steps = new Map<string, number>();
    for (const html of markupOf(c)) {
      for (const el of findRoleElements(html)) {
        const step = fitOnLadder(spec, el.role, el.text, inner(c));
        steps.set(el.role, Math.max(steps.get(el.role) ?? 0, step));
      }
    }
    need.set(c.id, steps);
  }

  // Second pass: shared roles take the group's largest step (smallest size).
  const groupStep = new Map<string, number>();
  for (const c of components) {
    if (!c.group) continue;
    for (const [role, step] of need.get(c.id)!) {
      if (!roleByName(spec, role)?.sharedAcrossGroup) continue;
      const key = `${c.group}\u0000${role}`;
      groupStep.set(key, Math.max(groupStep.get(key) ?? 0, step));
    }
  }

  return components.map((c) => {
    const apply = (html: string) =>
      setRoleClasses(
        html,
        (el) => {
          const r = roleByName(spec, el.role);
          if (!r) return [];
          const own = need.get(c.id)!.get(el.role) ?? 0;
          const shared = c.group && r.sharedAcrossGroup ? groupStep.get(`${c.group}\u0000${el.role}`) : undefined;
          const step = Math.min(r.ladder.length - 1, shared ?? own);
          return [typeClass(r.ladder[step]), roleClass(r.role)];
        },
        OWNED,
      );
    const out: ComponentInstance = { ...c };
    if (c.content) out.content = apply(c.content);
    if (c.slots) {
      out.slots = Object.fromEntries(Object.entries(c.slots).map(([k, v]) => [k, apply(v)]));
    }
    return out;
  });
}
