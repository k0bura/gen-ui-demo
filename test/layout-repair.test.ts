import { describe, expect, it } from "vitest";
import { describeDensity, summaryLine } from "../src/demo/pipeline/density";
import { assignSlots, fallbackLayout, repairLayout, validateLayout } from "../src/demo/pipeline/layout-repair";
import type { ComponentInstance, LayoutNode } from "../src/demo/types";
import { card, chart, ref, spec, statCard, table } from "./helpers";

const repair = (layout: unknown, components: ComponentInstance[]) => {
  const out = repairLayout(layout, components, spec);
  // The contract every case must meet, whatever else it checks.
  expect(validateLayout(out.layout, components, spec)).toEqual([]);
  return out;
};

const rows = (layout: LayoutNode): Array<[string, number[]]> => {
  const out: Array<[string, number[]]> = [];
  const walk = (n: any) => {
    if (n.kind === "pattern") {
      out.push([n.pattern, n.children.flatMap((c: any) => (c.kind === "ref" ? [c.ref] : c.children.map((r: any) => r.ref)))]);
      return;
    }
    (n.children ?? []).forEach(walk);
    (n.tabs ?? []).forEach((t: any) => t.children.forEach(walk));
  };
  walk(layout);
  return out;
};

describe("density and min-width", () => {
  it("widens tables by column count", () => {
    expect(describeDensity(table(0, 2), spec).minWidth).toBe("half");
    expect(describeDensity(table(0, 4), spec).minWidth).toBe("two-thirds");
    expect(describeDensity(table(0, 6), spec).minWidth).toBe("full");
  });

  it("widens a card as its text grows", () => {
    expect(describeDensity(card(0), spec).minWidth).toBe("quarter");
    expect(describeDensity(card(0, undefined, "x".repeat(300)), spec).minWidth).toBe("third");
    expect(describeDensity(card(0, undefined, "x".repeat(700)), spec).minWidth).toBe("half");
  });

  it("writes a one-line summary with no markup in it", () => {
    const line = summaryLine(statCard(3, "figures", "21 °C"), spec);
    expect(line).toBe('3. <sl-card> group=figures min-width=quarter | stat "21 °C" | 10 chars');
    expect(line).not.toContain("data-role");
  });
});

describe("repairLayout", () => {
  it("leaves a layout that already obeys the spec alone", () => {
    const cs = [statCard(0), statCard(1), statCard(2), statCard(3)];
    const { layout, fixes } = repair({ kind: "section", heading: "H", children: [{ kind: "pattern", pattern: "4-up", children: cs.map((c) => ref(c.id)) }] }, cs);
    expect(rows(layout)).toEqual([["4-up", [0, 1, 2, 3]]]);
    expect(fixes).toEqual([]);
    expect((layout as any).heading).toBe("H");
  });

  it("places every component exactly once: adds the missing, drops repeats and strangers", () => {
    const cs = [card(0), card(1), card(2)];
    const { layout, fixes } = repair({ kind: "stack", children: [ref(0), ref(0), ref(99)] }, cs);
    expect(assignSlots(layout, spec).map((s) => s.ref).sort()).toEqual([0, 1, 2]);
    expect(fixes.join("; ")).toContain("placed 2 components the layout left out");
    expect(fixes.join("; ")).toContain("removed a repeated component");
    expect(fixes.join("; ")).toContain("does not exist");
  });

  it("never leaves a component below its min-width", () => {
    const cs = [table(0, 6), card(1), card(2)];
    const { layout, fixes } = repair({ kind: "pattern", pattern: "3-up", children: [ref(0), ref(1), ref(2)] }, cs);
    expect(rows(layout)).toEqual([["1-up", [0]], ["2-up", [1, 2]]]);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it("narrows an n-up row to the widest count everything fits", () => {
    const cs = [chart(0, "g"), chart(1, "g"), chart(2, "g"), chart(3, "g")];
    const { layout } = repair({ kind: "pattern", pattern: "4-up", children: cs.map((c) => ref(c.id)) }, cs);
    expect(rows(layout)).toEqual([["2-up", [0, 1, 2, 3]]]);
  });

  it("mirrors a 2:1 row when the wide component is on the narrow side", () => {
    const cs = [card(0), table(1, 4)];
    const { layout, fixes } = repair({ kind: "pattern", pattern: "2-up-wide-left", children: [ref(0), ref(1)] }, cs);
    expect(rows(layout)).toEqual([["2-up-wide-right", [0, 1]]]);
    expect(fixes.join("; ")).toContain("swapped the wide side");
  });

  it("gives up on a 2:1 pairing that cannot fit either way round", () => {
    const cs = [table(0, 4), table(1, 4)];
    const { layout } = repair({ kind: "pattern", pattern: "2-up-wide-left", children: [ref(0), ref(1)] }, cs);
    expect(rows(layout)).toEqual([["1-up", [0, 1]]]);
  });

  it("rewrites free-form grids, rows and sidebars as row patterns", () => {
    const cs = [card(0), card(1), card(2), chart(3), card(4)];
    const { layout, fixes } = repair(
      {
        kind: "stack",
        children: [
          { kind: "grid", columns: 3, children: [ref(0), ref(1), ref(2)] },
          { kind: "sidebar", side: "right", main: [ref(3)], aside: [ref(4)] },
        ],
      },
      cs,
    );
    expect(rows(layout)).toEqual([["3-up", [0, 1, 2]], ["2-up-wide-left", [3, 4]]]);
    expect(fixes.join("; ")).toContain("free-form grid");
    expect(fixes.join("; ")).toContain("free-form sidebar");
  });

  it("replaces a pattern id that is not in the spec", () => {
    const cs = [card(0), card(1)];
    const { layout } = repair({ kind: "pattern", pattern: "7-up-diagonal", children: [ref(0), ref(1)] }, cs);
    expect(rows(layout)).toEqual([["2-up", [0, 1]]]);
  });

  it("keeps one group per row", () => {
    const cs = [statCard(0, "a"), statCard(1, "a"), card(2, "b"), card(3, "b")];
    const { layout, fixes } = repair({ kind: "pattern", pattern: "4-up", children: cs.map((c) => ref(c.id)) }, cs);
    expect(rows(layout)).toEqual([["2-up", [0, 1]], ["2-up", [2, 3]]]);
    expect(fixes.join("; ")).toContain("split a row that mixed groups");
  });

  it("allows a 2:1 row to pair a primary with a supporting component from another group", () => {
    const cs = [chart(0, "trend"), card(1, "advice")];
    const { layout, fixes } = repair({ kind: "pattern", pattern: "2-up-wide-left", children: [ref(0), ref(1)] }, cs);
    expect(rows(layout)).toEqual([["2-up-wide-left", [0, 1]]]);
    expect(fixes).toEqual([]);
  });

  it("joins sibling rows that split one group", () => {
    const cs = [statCard(0), statCard(1), statCard(2), statCard(3)];
    const { layout, fixes } = repair(
      {
        kind: "stack",
        children: [
          { kind: "pattern", pattern: "2-up", children: [ref(0), ref(1)] },
          { kind: "pattern", pattern: "2-up", children: [ref(2), ref(3)] },
        ],
      },
      cs,
    );
    expect(rows(layout)).toEqual([["4-up", [0, 1, 2, 3]]]);
    expect(fixes.join("; ")).toContain("joined rows that split one group");
  });

  it("avoids a single orphan on the last row when one fewer column divides evenly", () => {
    const cs = [0, 1, 2, 3].map((i) => card(i, "days", "x".repeat(250)));
    const { layout } = repair({ kind: "pattern", pattern: "3-up", children: cs.map((c) => ref(c.id)) }, cs);
    expect(rows(layout)).toEqual([["2-up", [0, 1, 2, 3]]]);
  });

  it("removes section headings when there are too few groups", () => {
    const cs = [card(0, "a"), card(1, "b")];
    const { layout, fixes } = repair(
      { kind: "section", heading: "Root", children: [{ kind: "section", heading: "A", children: [ref(0)] }, { kind: "section", heading: "B", children: [ref(1)] }] },
      cs,
    );
    expect(JSON.stringify(layout)).not.toContain('"heading":"A"');
    expect((layout as any).heading).toBe("Root");
    expect(fixes.join("; ")).toContain("too few groups");
  });

  it("keeps section headings when there are enough groups", () => {
    const cs = [card(0, "a"), card(1, "b"), card(2, "c")];
    const { layout } = repair(
      { kind: "section", heading: "Root", children: cs.map((c) => ({ kind: "section", heading: `S${c.id}`, children: [ref(c.id)] })) },
      cs,
    );
    expect(JSON.stringify(layout)).toContain('"heading":"S2"');
  });

  it("flattens a row nested in a row and keeps its components", () => {
    const cs = [card(0), card(1), card(2)];
    const { layout } = repair(
      { kind: "pattern", pattern: "2-up", children: [ref(0), { kind: "pattern", pattern: "2-up", children: [ref(1), ref(2)] }] },
      cs,
    );
    expect(assignSlots(layout, spec)).toHaveLength(3);
  });

  it("keeps a stack of refs together in one slot, sized by its widest member", () => {
    const cs = [chart(0), statCard(1), statCard(2)];
    const { layout } = repair(
      { kind: "pattern", pattern: "2-up-wide-left", children: [ref(0), { kind: "stack", children: [ref(1), ref(2)] }] },
      cs,
    );
    expect(rows(layout)).toEqual([["2-up-wide-left", [0, 1, 2]]]);
    const widths = assignSlots(layout, spec);
    expect(widths.find((w) => w.ref === 1)!.widthPx).toBe(widths.find((w) => w.ref === 2)!.widthPx);
  });

  it("collapses tabs with one tab and drops empty ones", () => {
    const cs = [card(0)];
    const { layout } = repair({ kind: "tabs", tabs: [{ label: "A", children: [ref(0)] }, { label: "B", children: [] }] }, cs);
    expect(JSON.stringify(layout)).not.toContain('"tabs"');
  });

  it("falls back to a plain stack when nothing usable comes back", () => {
    const cs = [card(0), card(1)];
    for (const junk of [null, undefined, "layout", 42, {}, { kind: "nonsense" }, []]) {
      const { layout } = repair(junk, cs);
      expect(assignSlots(layout, spec).map((s) => s.ref)).toEqual([0, 1]);
    }
    expect(validateLayout(fallbackLayout(cs), cs, spec)).toEqual([]);
  });

  it("survives random trees: the result always validates", () => {
    // A small deterministic generator, so a failure is reproducible.
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const kinds = ["ref", "pattern", "grid", "row", "stack", "section", "tabs", "sidebar", "divider", "bogus"];
    const patterns = [...spec.rowPatterns.map((p) => p.id), "nope"];
    const gen = (depth: number): any => {
      const kind = depth > 3 ? "ref" : kinds[rand(kinds.length)];
      const kids = () => Array.from({ length: rand(5) }, () => gen(depth + 1));
      switch (kind) {
        case "ref": return { kind, ref: rand(14) - 1 };
        case "pattern": return { kind, pattern: patterns[rand(patterns.length)], children: kids() };
        case "grid": return { kind, columns: rand(7), children: kids() };
        case "tabs": return { kind, tabs: Array.from({ length: rand(4) }, (_, i) => ({ label: `t${i}`, children: kids() })) };
        case "sidebar": return { kind, side: rand(2) ? "left" : "right", main: kids(), aside: kids() };
        default: return { kind, heading: "h", children: kids() };
      }
    };
    const makers = [card, (i: number) => statCard(i, "f"), (i: number) => table(i, 2 + (i % 5)), chart, (i: number) => card(i, "g", "x".repeat(i * 90))];
    for (let run = 0; run < 300; run++) {
      const cs = Array.from({ length: 1 + rand(12) }, (_, i) => makers[rand(makers.length)](i));
      const out = repairLayout(gen(0), cs, spec);
      expect(validateLayout(out.layout, cs, spec), `run ${run}`).toEqual([]);
    }
  });
});
