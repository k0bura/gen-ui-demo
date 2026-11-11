// Layout repair: makes any tree the layout model returns obey the spec.
//
// Guarantees, whatever came in:
//   - every component appears exactly once
//   - every row is one of the spec's row patterns
//   - no component sits in a slot narrower than its min-width
//   - a group's components stay together, one group per n-up row
//   - nested sections only appear when there are enough groups to need them
//
// The output grammar is narrower than the input: section | stack at the
// root, then pattern rows, sections, tabs and dividers. Pattern children
// are refs, or a stack of refs sharing one slot.

import {
  equalPattern,
  fits,
  patternById,
  trackFractions,
  SLOT_ORDER,
  type LayoutSpec,
  type RowPattern,
  type SlotWidth,
} from "../layout-spec";
import type { ComponentInstance, LayoutNode, LayoutPattern, LayoutRef } from "../types";
import { describeDensity } from "./density";

interface Info {
  min: SlotWidth;
  group: string | undefined;
}

/** A pattern child: one ref, or a few refs stacked in one slot. */
type Cell = LayoutRef | { kind: "stack"; gap: "sm"; children: LayoutRef[] };

export interface RepairResult {
  layout: LayoutNode;
  fixes: string[];
}

export function fallbackLayout(components: ComponentInstance[]): LayoutNode {
  return {
    kind: "stack",
    gap: "md",
    children: components.map((c) => ({
      kind: "pattern",
      pattern: "1-up",
      children: [{ kind: "ref", ref: c.id }],
    })),
  };
}

export function repairLayout(
  input: unknown,
  components: ComponentInstance[],
  spec: LayoutSpec,
): RepairResult {
  const fixes: string[] = [];
  const note = (f: string) => {
    if (!fixes.includes(f)) fixes.push(f);
  };

  const info = new Map<number, Info>();
  for (const c of components) {
    info.set(c.id, { min: describeDensity(c, spec).minWidth, group: c.group });
  }
  const seen = new Set<number>();

  const cellRefs = (cell: Cell): LayoutRef[] => (cell.kind === "ref" ? [cell] : cell.children);
  const cellMin = (cell: Cell): SlotWidth =>
    cellRefs(cell)
      .map((r) => info.get(r.ref)!.min)
      .reduce((a, b) => (SLOT_ORDER.indexOf(a) >= SLOT_ORDER.indexOf(b) ? a : b));
  const cellGroup = (cell: Cell): string | undefined => info.get(cellRefs(cell)[0].ref)!.group;

  function takeRef(node: any): LayoutRef | null {
    const id = Number(node?.ref);
    if (!Number.isInteger(id) || !info.has(id)) {
      note("removed a reference to a component that does not exist");
      return null;
    }
    if (seen.has(id)) {
      note("removed a repeated component");
      return null;
    }
    seen.add(id);
    return { kind: "ref", ref: id };
  }

  /** Every ref under a node, in order, claimed as it is found. */
  function flattenRefs(node: any): LayoutRef[] {
    if (!node || typeof node !== "object") return [];
    if (node.kind === "ref") {
      const r = takeRef(node);
      return r ? [r] : [];
    }
    const lists: any[] = [];
    for (const key of ["children", "main", "aside"]) {
      if (Array.isArray(node[key])) lists.push(...node[key]);
    }
    if (Array.isArray(node.tabs)) for (const t of node.tabs) lists.push(...(t?.children ?? []));
    return lists.flatMap(flattenRefs);
  }

  function toCells(children: any[]): Cell[] {
    const cells: Cell[] = [];
    for (const child of children ?? []) {
      if (child?.kind === "ref") {
        const r = takeRef(child);
        if (r) cells.push(r);
      } else if (child?.kind === "stack") {
        const refs = flattenRefs(child);
        if (refs.length === 1) cells.push(refs[0]);
        else if (refs.length > 1) cells.push({ kind: "stack", gap: "sm", children: refs });
      } else {
        // A row inside a row is not in the grammar. Keep its components.
        const refs = flattenRefs(child);
        if (refs.length) note("flattened a row nested inside a row");
        cells.push(...refs);
      }
    }
    return cells;
  }

  const row = (pattern: RowPattern, cells: Cell[]): LayoutPattern => ({
    kind: "pattern",
    pattern: pattern.id,
    children: cells,
  });

  /** Lays cells out in equal columns, as many across as the widths allow. */
  function equalRows(cells: Cell[], wanted: number): LayoutPattern[] {
    if (cells.length === 0) return [];
    // A component that needs the whole row gets one, and splits the run.
    const fullAt = cells.findIndex((c) => cellMin(c) === "full");
    if (fullAt !== -1 && cells.length > 1) {
      note("gave a full-width component a row of its own");
      return [
        ...equalRows(cells.slice(0, fullAt), wanted),
        row(equalPattern(spec, 1), [cells[fullAt]]),
        ...equalRows(cells.slice(fullAt + 1), wanted),
      ];
    }
    let n = Math.max(1, Math.min(wanted, cells.length, spec.grouping.maxPerRow));
    while (n > 1 && !cells.every((c) => fits(spec, cellMin(c), 1 / n))) n--;
    if (n < Math.min(wanted, cells.length)) note("narrowed a row so nothing sits below its min-width");
    // Avoid a last row holding a single orphan when one fewer column divides evenly.
    if (n > 2 && cells.length > n && cells.length % n === 1 && cells.length % (n - 1) === 0) n--;
    return [row(equalPattern(spec, n), cells)];
  }

  /** Splits a run of cells wherever the group changes. */
  function byGroup(cells: Cell[]): Cell[][] {
    const runs: Cell[][] = [];
    for (const cell of cells) {
      const last = runs[runs.length - 1];
      if (last && cellGroup(last[0]) === cellGroup(cell)) last.push(cell);
      else runs.push([cell]);
    }
    return runs;
  }

  function fitRows(cells: Cell[], pattern: RowPattern): LayoutPattern[] {
    if (cells.length === 0) return [];
    const fractions = trackFractions(pattern);
    const asymmetric = fractions.some((f) => Math.abs(f - fractions[0]) > 1e-9);

    if (asymmetric && cells.length === 2) {
      if (cells.every((c, i) => fits(spec, cellMin(c), fractions[i]))) return [row(pattern, cells)];
      // Try the mirror image before giving up on the pairing.
      const mirror = spec.rowPatterns.find(
        (p) => p.tracks.length === 2 && p.tracks[0] === pattern.tracks[1] && p.tracks[1] === pattern.tracks[0],
      );
      if (mirror) {
        const mf = trackFractions(mirror);
        if (cells.every((c, i) => fits(spec, cellMin(c), mf[i]))) {
          note("swapped the wide side of a row to respect min-width");
          return [row(mirror, cells)];
        }
      }
      note("narrowed a row so nothing sits below its min-width");
      return equalRows(cells, 2);
    }

    // One group per n-up row.
    const runs = byGroup(cells);
    const mixed = runs.length > 1 && runs.some((r) => r.length > 1 && cellGroup(r[0]) !== undefined);
    if (mixed) {
      note("split a row that mixed groups");
      return runs.flatMap((r) => equalRows(r, pattern.tracks.length));
    }
    return equalRows(cells, pattern.tracks.length);
  }

  function requestedPattern(node: any, childCount: number): RowPattern {
    if (node.kind === "pattern") {
      const p = patternById(spec, String(node.pattern));
      if (p) return p;
      note("replaced a row pattern that is not in the spec");
      return equalPattern(spec, childCount);
    }
    note(`rewrote a free-form ${node.kind} as a row pattern`);
    if (node.kind === "grid") return equalPattern(spec, Number(node.columns) || childCount);
    return equalPattern(spec, childCount);
  }

  function blocks(nodes: any[]): LayoutNode[] {
    const out: LayoutNode[] = [];
    for (const node of nodes ?? []) {
      if (!node || typeof node !== "object") continue;
      switch (node.kind) {
        case "ref": {
          const r = takeRef(node);
          if (r) out.push(row(equalPattern(spec, 1), [r]));
          break;
        }
        case "pattern":
        case "grid":
        case "row": {
          const cells = toCells(node.children);
          out.push(...fitRows(cells, requestedPattern(node, cells.length)));
          break;
        }
        case "sidebar": {
          note("rewrote a free-form sidebar as a row pattern");
          const main = flattenRefs({ children: node.main });
          const aside = flattenRefs({ children: node.aside });
          const cell = (refs: LayoutRef[]): Cell | null =>
            refs.length === 0 ? null : refs.length === 1 ? refs[0] : { kind: "stack", gap: "sm", children: refs };
          const wide = node.side === "left" ? "2-up-wide-right" : "2-up-wide-left";
          const ordered = (node.side === "left" ? [cell(aside), cell(main)] : [cell(main), cell(aside)]).filter(
            (c): c is Cell => c !== null,
          );
          out.push(...fitRows(ordered, patternById(spec, wide) ?? equalPattern(spec, 2)));
          break;
        }
        case "stack":
          out.push(...blocks(node.children));
          break;
        case "section": {
          const children = blocks(node.children);
          if (children.length) {
            out.push({
              kind: "section",
              ...(typeof node.heading === "string" && node.heading.trim() ? { heading: node.heading.trim().slice(0, 80) } : {}),
              ...(typeof node.description === "string" && node.description.trim()
                ? { description: node.description.trim().slice(0, 160) }
                : {}),
              children,
            });
          }
          break;
        }
        case "tabs": {
          const tabs = (Array.isArray(node.tabs) ? node.tabs : [])
            .map((t: any) => ({ label: String(t?.label ?? "").slice(0, 40) || "Tab", children: blocks(t?.children) }))
            .filter((t: { children: LayoutNode[] }) => t.children.length);
          if (tabs.length >= 2) out.push({ kind: "tabs", tabs });
          else if (tabs.length === 1) out.push(...tabs[0].children);
          break;
        }
        case "divider":
          out.push({ kind: "divider" });
          break;
        default:
          note("ignored a layout node of an unknown kind");
      }
    }
    return out;
  }

  // --- Pass 1: rebuild the tree in the narrow grammar ----------------------
  const root: any = input && typeof input === "object" ? input : null;
  let heading: string | undefined;
  let description: string | undefined;
  let children: LayoutNode[];
  if (root?.kind === "section") {
    heading = typeof root.heading === "string" && root.heading.trim() ? root.heading.trim().slice(0, 80) : undefined;
    description =
      typeof root.description === "string" && root.description.trim()
        ? root.description.trim().slice(0, 160)
        : undefined;
    children = blocks(root.children);
  } else {
    if (!root) note("no usable layout came back, so the components were stacked");
    children = blocks(root ? [root] : []);
  }

  // --- Pass 2: anything the model left out goes at the end -----------------
  const missing = components.filter((c) => !seen.has(c.id));
  if (missing.length) {
    note(`placed ${missing.length} component${missing.length === 1 ? "" : "s"} the layout left out`);
    const cells = missing.map((c) => takeRef({ ref: c.id })!).filter(Boolean);
    for (const run of byGroup(cells)) {
      children.push(...equalRows(run, cellGroup(run[0]) ? spec.grouping.maxPerRow : 1));
    }
  }

  // --- Pass 3: a group split across sibling rows is pulled back together ---
  function regroup(list: LayoutNode[]): LayoutNode[] {
    const out: LayoutNode[] = [];
    const home = new Map<string, LayoutPattern>();
    for (const node of list) {
      if (node.kind === "section") {
        out.push({ ...node, children: regroup(node.children) });
        continue;
      }
      if (node.kind === "tabs") {
        out.push({ ...node, tabs: node.tabs.map((t) => ({ ...t, children: regroup(t.children) })) });
        continue;
      }
      if (node.kind !== "pattern") {
        out.push(node);
        continue;
      }
      const cells = node.children as Cell[];
      const groups = new Set(cells.map(cellGroup));
      const only = groups.size === 1 ? [...groups][0] : undefined;
      const p = patternById(spec, node.pattern)!;
      const equal = p.tracks.every((t) => t === p.tracks[0]);
      if (only && equal) {
        const first = home.get(only);
        if (first) {
          note("joined rows that split one group");
          const joined = equalRows([...(first.children as Cell[]), ...cells], spec.grouping.maxPerRow);
          // A group with a full-width member can come back as several rows.
          const at = out.indexOf(first);
          out.splice(at, 1, ...joined);
          home.set(only, joined[joined.length - 1]);
          continue;
        }
        home.set(only, node);
      }
      out.push(node);
    }
    return out;
  }
  children = regroup(children);

  // --- Pass 4: sections only when there are enough groups ------------------
  const groupCount = new Set(components.map((c) => c.group).filter(Boolean)).size;
  if (groupCount < spec.grouping.minGroupsForSections) {
    const unwrap = (list: LayoutNode[]): LayoutNode[] =>
      list.flatMap((n) => {
        if (n.kind === "section") {
          note("removed section headings: too few groups to need them");
          return unwrap(n.children);
        }
        return [n];
      });
    children = unwrap(children);
  }

  // --- Pass 5: tidy dividers left at the edges or doubled up ---------------
  children = children.filter(
    (n, i, all) => n.kind !== "divider" || (i > 0 && i < all.length - 1 && all[i - 1].kind !== "divider"),
  );

  if (children.length === 0) return { layout: fallbackLayout(components), fixes };

  const layout: LayoutNode =
    heading || description
      ? { kind: "section", ...(heading ? { heading } : {}), ...(description ? { description } : {}), children }
      : { kind: "stack", gap: "md", children };
  return { layout, fixes };
}

// ---------------------------------------------------------------------------
// Checks, used by tests and by the pipeline's own self-check
// ---------------------------------------------------------------------------

export interface SlotAssignment {
  ref: number;
  /** Fraction of the canvas this component's slot spans. */
  fraction: number;
  widthPx: number;
}

/** Where every component ended up, and how wide its slot is. */
export function assignSlots(layout: LayoutNode, spec: LayoutSpec): SlotAssignment[] {
  const out: SlotAssignment[] = [];
  const walk = (node: LayoutNode, widthPx: number, fraction: number) => {
    switch (node.kind) {
      case "ref":
        out.push({ ref: node.ref, fraction, widthPx });
        break;
      case "pattern": {
        const p = patternById(spec, node.pattern) ?? equalPattern(spec, 1);
        const fr = trackFractions(p);
        const gutters = (p.tracks.length - 1) * spec.grid.gutterPx;
        node.children.forEach((child, i) => {
          const f = fr[i % fr.length];
          walk(child, Math.floor((widthPx - gutters) * f), fraction * f);
        });
        break;
      }
      case "section":
      case "stack":
      case "grid":
      case "row":
        node.children.forEach((c) => walk(c, widthPx, fraction));
        break;
      case "tabs":
        node.tabs.forEach((t) => t.children.forEach((c) => walk(c, widthPx, fraction)));
        break;
      case "sidebar":
        [...node.main, ...node.aside].forEach((c) => walk(c, widthPx, fraction));
        break;
      case "divider":
        break;
    }
  };
  walk(layout, spec.grid.canvasPx, 1);
  return out;
}

/** Empty when the layout obeys the spec. Otherwise, what is wrong. */
export function validateLayout(
  layout: LayoutNode,
  components: ComponentInstance[],
  spec: LayoutSpec,
): string[] {
  const problems: string[] = [];
  const slots = assignSlots(layout, spec);
  const counts = new Map<number, number>();
  for (const s of slots) counts.set(s.ref, (counts.get(s.ref) ?? 0) + 1);
  for (const c of components) {
    const n = counts.get(c.id) ?? 0;
    if (n !== 1) problems.push(`component ${c.id} appears ${n} times`);
  }
  for (const s of slots) {
    const c = components.find((x) => x.id === s.ref);
    if (!c) {
      problems.push(`ref ${s.ref} points at nothing`);
      continue;
    }
    const min = describeDensity(c, spec).minWidth;
    if (!fits(spec, min, s.fraction)) {
      problems.push(`component ${c.id} needs "${min}" but its slot is ${s.fraction.toFixed(2)} of the row`);
    }
  }
  const checkKinds = (node: LayoutNode) => {
    if (node.kind === "grid" || node.kind === "row" || node.kind === "sidebar") {
      problems.push(`free-form ${node.kind} survived repair`);
    }
    if (node.kind === "pattern" && !patternById(spec, node.pattern)) {
      problems.push(`unknown pattern "${node.pattern}"`);
    }
    if ("children" in node) node.children.forEach(checkKinds);
    if (node.kind === "tabs") node.tabs.forEach((t) => t.children.forEach(checkKinds));
  };
  checkKinds(layout);
  return problems;
}
