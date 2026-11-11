import { describe, expect, it } from "vitest";
import { repairLayout } from "../src/demo/pipeline/layout-repair";
import { fitOnLadder, typeset } from "../src/demo/pipeline/typeset";
import type { ComponentInstance } from "../src/demo/types";
import { ref, spec, statCard } from "./helpers";

const classOf = (c: ComponentInstance, role: string): string =>
  new RegExp(`data-role="${role}" class="([^"]+)"`).exec(c.content ?? "")?.[1] ?? "";

const layoutFor = (pattern: string, cs: ComponentInstance[]) =>
  repairLayout({ kind: "pattern", pattern, children: cs.map((c) => ref(c.id)) }, cs, spec).layout;

describe("fitOnLadder", () => {
  it("uses the top of the ladder when the text fits", () => {
    expect(fitOnLadder(spec, "stat-value", "18 °C", 480)).toBe(0);
  });

  it("steps down as the slot narrows", () => {
    const text = "1,234,567.89 EUR";
    const wide = fitOnLadder(spec, "stat-value", text, 480);
    const narrow = fitOnLadder(spec, "stat-value", text, 200);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("stops at the bottom of the ladder however long the text is", () => {
    const role = spec.roles.find((r) => r.role === "stat-value")!;
    expect(fitOnLadder(spec, "stat-value", "9".repeat(400), 100)).toBe(role.ladder.length - 1);
  });

  it("allows titles their two lines", () => {
    expect(fitOnLadder(spec, "card-title", "A title that needs a second line here", 220)).toBe(0);
  });
});

describe("typeset", () => {
  it("puts a type class and a role class on every role element", () => {
    const cs = [statCard(0)];
    const [out] = typeset(cs, layoutFor("1-up", cs), spec);
    expect(classOf(out, "stat-value")).toBe("gx-type-heading-06 gx-role-stat-value");
    expect(classOf(out, "stat-label")).toBe("gx-type-body-01 gx-role-stat-label");
  });

  it("sets the same figure smaller in a quarter slot than in a full row", () => {
    const text = "1,234,567.89 EUR";
    const full = [statCard(0, "f", text)];
    const quarter = [0, 1, 2, 3].map((i) => statCard(i, "f", text));
    const big = classOf(typeset(full, layoutFor("1-up", full), spec)[0], "stat-value");
    const small = classOf(typeset(quarter, layoutFor("4-up", quarter), spec)[0], "stat-value");
    const size = (cls: string) => spec.typeStyles[cls.split(" ")[0].replace("gx-type-", "")].sizePx;
    expect(size(small)).toBeLessThan(size(big));
  });

  it("gives a group one size: the smallest any member needs", () => {
    const cs = [statCard(0, "f", "7"), statCard(1, "f", "1,234,567.89 EUR"), statCard(2, "f", "3"), statCard(3, "f", "4")];
    const out = typeset(cs, layoutFor("4-up", cs), spec);
    const classes = out.map((c) => classOf(c, "stat-value"));
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).not.toContain("heading-06");
  });

  it("does not share sizes across groups", () => {
    const cs = [statCard(0, "a", "7"), statCard(1, "b", "1,234,567.89 EUR and more text")];
    const out = typeset(cs, layoutFor("2-up", cs), spec);
    expect(classOf(out[0], "stat-value")).toContain("heading-06");
    expect(classOf(out[1], "stat-value")).not.toContain("heading-06");
  });

  it("is idempotent", () => {
    const cs = [statCard(0), statCard(1, "f", "1,234,567.89 EUR")];
    const layout = layoutFor("2-up", cs);
    const once = typeset(cs, layout, spec);
    expect(typeset(once, layout, spec)).toEqual(once);
  });
});
