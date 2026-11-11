import { describe, expect, it } from "vitest";
import { findRoleElements, sanitizeHtml, setRoleClasses } from "../src/demo/pipeline/markup";
import { cleanChart, cleanTable, normalizeComponents } from "../src/demo/pipeline/normalize";
import type { ComponentInstance } from "../src/demo/types";
import { card, ctx } from "./helpers";

const clean = (html: string) => sanitizeHtml(html, ctx.sanitize);
const one = (c: Partial<ComponentInstance>) =>
  normalizeComponents([{ id: 0, tagName: "sl-card", attributes: {}, ...c }], ctx);

describe("sanitizeHtml", () => {
  it("removes scripts, styles and comments with their contents", () => {
    expect(clean('<p>a</p><script>alert(1)</script><style>p{}</style><!-- x --><p>b</p>')).toBe("<p>a</p><p>b</p>");
  });

  it("removes inline styles, ids and event handlers", () => {
    expect(clean('<p style="font-size:99px" id="x" onclick="steal()">hi</p>')).toBe("<p>hi</p>");
  });

  it("drops invented classes and keeps the spec's type classes", () => {
    expect(clean('<span class="huge text-9xl gx-type-heading-06">1</span>')).toBe('<span class="gx-type-heading-06">1</span>');
  });

  it("drops javascript: links and makes real links open safely", () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe('<a target="_blank" rel="noopener noreferrer">x</a>');
    expect(clean('<a href="https://example.org/a">x</a>')).toBe(
      '<a href="https://example.org/a" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it("keeps images only from allowlisted hosts over https", () => {
    expect(clean('<img src="https://upload.wikimedia.org/a.jpg" alt="a">')).toContain("upload.wikimedia.org");
    expect(clean('<img src="https://evil.example/a.jpg">')).toBe("");
    expect(clean('<img src="http://upload.wikimedia.org/a.jpg">')).toBe("");
    expect(clean('<img src="https://wikimedia.org.evil.example/a.jpg">')).toBe("");
  });

  it("keeps library elements and unwraps invented custom elements", () => {
    expect(clean('<sl-icon name="info-circle"></sl-icon>')).toBe('<sl-icon name="info-circle"></sl-icon>');
    expect(clean("<my-widget>text</my-widget>")).toBe("text");
  });

  it("removes form controls and embedded frames", () => {
    expect(clean('<form><input value="x"><button>go</button></form><iframe src="https://x.example"></iframe>ok')).toBe("gook");
  });
});

describe("role helpers", () => {
  it("finds role elements and their text, through nested tags", () => {
    const els = findRoleElements('<div data-role="card-title">Kyoto <div>this</div> week</div><span data-role="stat-value">18 °C</span>');
    expect(els.map((e) => [e.role, e.text])).toEqual([
      ["card-title", "Kyoto this week"],
      ["stat-value", "18 °C"],
    ]);
  });

  it("replaces the classes it owns and leaves others alone", () => {
    const owned = (c: string) => c.startsWith("gx-");
    const once = setRoleClasses('<span data-role="stat-value" class="keep gx-type-old">1</span>', () => ["gx-type-new"], owned);
    expect(once).toBe('<span data-role="stat-value" class="keep gx-type-new">1</span>');
    expect(setRoleClasses(once, () => ["gx-type-new"], owned)).toBe(once);
  });
});

describe("normalizeComponents", () => {
  it("drops components that are not in the library", () => {
    const { components, fixes } = normalizeComponents(
      [{ id: 0, tagName: "sl-made-up", attributes: {}, content: "x" }, card(1)],
      ctx,
    );
    expect(components.map((c) => c.tagName)).toEqual(["sl-card"]);
    expect(fixes.join(" ")).toContain("not a component in the library");
  });

  it("removes attributes the manifest does not list for that tag", () => {
    const { components, fixes } = one({ tagName: "sl-alert", attributes: { variant: "warning", glow: true }, content: "<p>x</p>" });
    expect(components[0].attributes).toEqual({ variant: "warning", open: true });
    expect(fixes.join(" ")).toContain('unknown attribute "glow"');
  });

  it("makes every alert open and keeps it open", () => {
    const { components } = one({ tagName: "sl-alert", attributes: { closable: true, duration: 3000 }, content: "<p>x</p>" });
    expect(components[0].attributes).toEqual({ open: true });
  });

  it("turns double line breaks into paragraphs and gives them a role", () => {
    const { components } = one({ content: "First.<br><br>Second." });
    expect(components[0].content).toBe('<p data-role="body">First.</p><p data-role="body">Second.</p>');
  });

  it("demotes h1 and h2, which the page owns", () => {
    const { components } = one({ content: "<h1>Big</h1><p>x</p>" });
    expect(components[0].content).toContain('<h3 data-role="card-title">Big</h3>');
    expect(components[0].content).not.toContain("<h1");
  });

  it("wraps bare text and marks a header slot as the card title", () => {
    const { components } = one({ content: "Plain sentence.", slots: { header: "Kyoto this week" } });
    expect(components[0].content).toBe('<p data-role="body">Plain sentence.</p>');
    expect(components[0].slots!.header).toBe('<span data-role="card-title">Kyoto this week</span>');
  });

  it("removes roles that are not in the spec", () => {
    const { components } = one({ content: '<span data-role="giant-headline">x</span>' });
    expect(components[0].content).toBe("<span>x</span>");
  });

  it("caps inline badges", () => {
    const badges = Array.from({ length: 6 }, (_, i) => `<sl-badge>b${i}</sl-badge>`).join("");
    const { components } = one({ content: `<p>x</p>${badges}` });
    expect(components[0].content!.match(/<sl-badge/g)).toHaveLength(3);
  });

  it("drops empty containers", () => {
    const { components } = normalizeComponents([{ id: 0, tagName: "sl-card", attributes: {}, content: "  " }, card(1)], ctx);
    expect(components).toHaveLength(1);
  });

  it("merges a title-only card into the untitled chart after it", () => {
    const { components, fixes } = normalizeComponents(
      [
        { id: 0, tagName: "sl-card", attributes: {}, slots: { header: "Highs this week" }, group: "trend" },
        { id: 1, tagName: "render-chart", attributes: {}, data: { kind: "chart", chartType: "bar", labels: ["a"], datasets: [{ label: "", data: [1] }] } },
      ],
      ctx,
    );
    expect(components).toHaveLength(1);
    expect(components[0].data!.title).toBe("Highs this week");
    expect(components[0].group).toBe("trend");
    expect(fixes.join(" ")).toContain("merged a title-only card");
  });

  it("renumbers ids from zero and caps the count", () => {
    const many = Array.from({ length: 40 }, (_, i) => card(i + 100));
    const { components } = normalizeComponents(many, ctx);
    expect(components).toHaveLength(ctx.maxComponents);
    expect(components.map((c) => c.id)).toEqual(Array.from({ length: ctx.maxComponents }, (_, i) => i));
  });

  it("tidies group names", () => {
    const { components } = one({ content: "<p>x</p>", group: "  Key Figures! " });
    expect(components[0].group).toBe("key-figures");
  });

  it("is idempotent", () => {
    const messy: ComponentInstance[] = [
      { id: 3, tagName: "sl-card", attributes: { bogus: 1 }, slots: { header: "<h1>T</h1>" }, content: 'One.<br><br><a href="https://example.org" onclick="x()">Two</a>', group: "A b" },
      { id: 9, tagName: "sl-alert", attributes: { variant: "primary", closable: true }, content: '<p style="color:red" class="x">Careful</p><script>1</script>' },
      { id: 4, tagName: "render-table", attributes: {}, data: { kind: "table", columns: ["a", "b"], rows: [[1, "<b>x</b>"]] } },
    ];
    const once = normalizeComponents(messy, ctx);
    const twice = normalizeComponents(once.components, ctx);
    expect(twice.components).toEqual(once.components);
    expect(twice.fixes).toEqual([]);
  });
});

describe("chart and table payloads", () => {
  it("rejects a chart with no numbers and trims series to the labels", () => {
    expect(cleanChart({ chartType: "line", labels: ["a"], datasets: [{ label: "s", data: ["n/a"] }] })).toBeNull();
    expect(cleanChart({ chartType: "line", labels: [], datasets: [] })).toBeNull();
    const ok = cleanChart({ chartType: "radar", labels: ["a", "b"], datasets: [{ label: "s", data: [1, 2, 3] }] })!;
    expect(ok.chartType).toBe("bar");
    expect(ok.datasets[0].data).toEqual([1, 2]);
  });

  it("strips markup from table cells and keeps numbers as numbers", () => {
    const t = cleanTable({ title: "<b>T</b>", columns: ["a", "b"], rows: [[1, "<script>x</script>ok"], "junk"] })!;
    expect(t.title).toBe("T");
    expect(t.rows).toEqual([[1, "x ok"]]);
    expect(cleanTable({ columns: ["a"], rows: [] })).toBeNull();
  });
});
