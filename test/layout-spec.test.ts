import { describe, expect, it } from "vitest";
import {
  LAYOUT_SPEC,
  SLOT_ORDER,
  equalPattern,
  fits,
  specToCss,
  trackFractions,
  trackWidthsPx,
  typeClass,
  typeClassNames,
} from "../src/demo/layout-spec";
import { layoutPrompt, structurePrompt } from "../src/demo/prompts";
import {
  layoutRulesPrompt,
  patternIds,
  roleNames,
  rolesPrompt,
} from "../src/demo/pipeline/spec-prompt";
import { layoutTool, structureTool } from "../src/demo/tools";

const spec = LAYOUT_SPEC;

describe("the layout spec is internally consistent", () => {
  it("has an equal n-up pattern for every count up to maxPerRow", () => {
    for (let n = 1; n <= spec.grouping.maxPerRow; n++) {
      expect(equalPattern(spec, n).tracks).toHaveLength(n);
    }
  });

  it("clamps equalPattern to the allowed range", () => {
    expect(equalPattern(spec, 0).id).toBe("1-up");
    expect(equalPattern(spec, 9).tracks).toHaveLength(spec.grouping.maxPerRow);
  });

  it("gives every role a ladder of styles that exist, largest first", () => {
    for (const role of spec.roles) {
      expect(role.ladder.length).toBeGreaterThan(0);
      const sizes = role.ladder.map((name) => {
        expect(spec.typeStyles[name], `${role.role} -> ${name}`).toBeDefined();
        return spec.typeStyles[name].sizePx;
      });
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    }
  });

  it("only names min-widths that are slot widths", () => {
    for (const w of [...Object.values(spec.minWidths.byTag), spec.minWidths.fallback]) {
      expect(SLOT_ORDER).toContain(w);
    }
  });

  it("splits a row into tracks that add up to the row minus its gutters", () => {
    for (const p of spec.rowPatterns) {
      const widths = trackWidthsPx(spec, p, spec.grid.canvasPx);
      const gutters = (p.tracks.length - 1) * spec.grid.gutterPx;
      const total = widths.reduce((a, b) => a + b, 0);
      expect(spec.grid.canvasPx - gutters - total).toBeGreaterThanOrEqual(0);
      expect(spec.grid.canvasPx - gutters - total).toBeLessThan(p.tracks.length);
      expect(trackFractions(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
  });

  it("knows what fits where", () => {
    expect(fits(spec, "third", 1 / 3)).toBe(true);
    expect(fits(spec, "half", 1 / 3)).toBe(false);
    expect(fits(spec, "half", 2 / 3)).toBe(true);
    expect(fits(spec, "full", 2 / 3)).toBe(false);
    expect(fits(spec, "quarter", 1 / 4)).toBe(true);
  });
});

describe("prompts, tool schemas and CSS are generated from the spec", () => {
  it("offers the layout model exactly the spec's row patterns", () => {
    const schema = layoutTool(spec).input_schema.properties.layout as any;
    expect(schema.properties.pattern.enum).toEqual(spec.rowPatterns.map((p) => p.id));
    expect(schema.properties.kind.enum).not.toContain("grid");
    expect(schema.properties.kind.enum).not.toContain("row");
    expect(schema.properties.kind.enum).not.toContain("sidebar");
  });

  it("names every row pattern and its use in the layout prompt", () => {
    const prompt = layoutPrompt(spec);
    for (const p of spec.rowPatterns) {
      expect(prompt).toContain(p.id);
      expect(prompt).toContain(p.use);
    }
    expect(prompt).toContain(`${spec.grouping.minGroupsForSections} or more groups`);
    expect(prompt).toContain(`at most ${spec.grouping.maxPerRow} to a row`);
  });

  it("names every role and its meaning in the structure prompt and tool", () => {
    const prompt = structurePrompt(spec);
    const toolText = JSON.stringify(structureTool(spec));
    for (const r of spec.roles) {
      expect(prompt).toContain(r.role);
      expect(prompt).toContain(r.meaning);
      expect(toolText).toContain(r.role);
    }
  });

  it("follows the spec when the spec changes", () => {
    const changed = {
      ...spec,
      rowPatterns: [...spec.rowPatterns, { id: "5-up", label: "5-up", tracks: [1, 1, 1, 1, 1], use: "a strip of five tiny tiles" }],
      roles: [...spec.roles, { role: "pull-quote", meaning: "a quotation set apart", ladder: ["heading-03"], maxLines: 4 }],
      grouping: { maxPerRow: 5, minGroupsForSections: 4 },
    };
    expect(patternIds(changed)).toContain("5-up");
    expect(layoutRulesPrompt(changed)).toContain("a strip of five tiny tiles");
    expect(layoutRulesPrompt(changed)).toContain("4 or more groups");
    expect(roleNames(changed)).toContain("pull-quote");
    expect(rolesPrompt(changed)).toContain("a quotation set apart");
    expect((layoutTool(changed).input_schema.properties.layout as any).properties.pattern.enum).toContain("5-up");
    expect(specToCss(changed)).toContain('[data-pattern="5-up"]');
    expect(specToCss(changed)).toContain(".gx-role-pull-quote");
    expect(equalPattern(changed, 5).id).toBe("5-up");
  });

  it("emits a CSS rule for every type class, pattern and gap", () => {
    const css = specToCss(spec);
    for (const name of Object.keys(spec.typeStyles)) expect(css).toContain(`.${typeClass(name)}{`);
    for (const p of spec.rowPatterns) expect(css).toContain(`[data-pattern="${p.id}"]`);
    for (const gap of Object.keys(spec.spacingPx)) expect(css).toContain(`[data-gap="${gap}"]`);
    expect(css).toContain("grid-template-columns:minmax(0,2fr) minmax(0,1fr)");
    expect(css).toContain("font-size:2.625rem");
  });

  it("lists the type classes the sanitiser must let through", () => {
    const names = typeClassNames(spec);
    expect(names).toContain("gx-type-heading-06");
    expect(names).toContain("gx-role-stat-value");
  });
});
