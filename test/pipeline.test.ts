import { describe, expect, it } from "vitest";
import { NO_SUBSTITUTE } from "../src/demo/data-tools/types";
import { validateLayout } from "../src/demo/pipeline/layout-repair";
import {
  LIMITS,
  NoComponentsError,
  applyStructure,
  historyMessages,
  noNewNumerals,
  runPipeline,
  type ContentBlock,
  type ModelRequest,
  type ModelResponse,
  type PipelineDeps,
} from "../src/demo/pipeline/run";
import { mockResponse } from "../src/demo/mocks";
import { card, spec, statCard, table } from "./helpers";

const MODELS = { components: "m-components", structure: "m-structure", layout: "m-layout", followUps: "m-follow" };

let n = 0;
const use = (name: string, input: Record<string, unknown>): ContentBlock => ({ type: "tool_use", id: `t${++n}`, name, input });
const reply = (...content: ContentBlock[]): ModelResponse => ({ content, stop_reason: content.length ? "tool_use" : "end_turn" });

const STAT = (v: string, l: string) => ({ content: `<span data-role="stat-value">${v}</span><span data-role="stat-label">${l}</span>` });

/** A model that answers each stage from a script and records what it was asked. */
function scripted(script: {
  components: ModelResponse[];
  structure?: (req: ModelRequest) => ModelResponse;
  layout?: (req: ModelRequest) => ModelResponse;
  followUps?: (req: ModelRequest) => ModelResponse;
}) {
  const requests: ModelRequest[] = [];
  let round = 0;
  const callModel = async (req: ModelRequest): Promise<ModelResponse> => {
    requests.push(structuredClone(req));
    if (req.stage === "components") return script.components[round++] ?? reply();
    if (req.stage === "structure") return (script.structure ?? (() => reply()))(req);
    if (req.stage === "layout") return (script.layout ?? (() => reply()))(req);
    return (script.followUps ?? (() => reply(use("suggest_follow_ups", { prompts: ["One?", "Two?", "Three?"] }))))(req);
  };
  return { callModel, requests };
}

const FORECAST = { place: "Kyoto, Japan", days: [{ weekday: "Wed", highC: 18, lowC: 7 }] };

function deps(model: ReturnType<typeof scripted>, data: Record<string, unknown> = { get_weather_forecast: FORECAST }): PipelineDeps & { dataCalls: string[] } {
  const dataCalls: string[] = [];
  return {
    callModel: model.callModel,
    models: MODELS,
    dataCalls,
    runDataTool: async (name) => {
      dataCalls.push(name);
      return name in data
        ? { ok: true, result: data[name] }
        : { ok: false, result: { error: `${name} is temporarily unavailable: HTTP 503`, instruction: NO_SUBSTITUTE } };
    },
  };
}

describe("the component stage loop", () => {
  it("forces a tool call until a component exists, then lets the model stop", async () => {
    const model = scripted({
      components: [
        reply(use("get_weather_forecast", { place: "Kyoto" })),
        reply(use("sl_card", STAT("18 °C", "High")), use("sl_card", STAT("7 °C", "Low"))),
      ],
    });
    const d = deps(model);
    const out = await runPipeline("Kyoto weather", [], d);

    const rounds = model.requests.filter((r) => r.stage === "components");
    expect(rounds.map((r) => r.toolChoice.type)).toEqual(["any", "any"]);
    expect(rounds).toHaveLength(2);
    expect(d.dataCalls).toEqual(["get_weather_forecast"]);
    expect(out.components).toHaveLength(2);
  });

  it("returns the data result to the model as a tool_result in one user message", async () => {
    const model = scripted({
      components: [
        reply(use("get_weather_forecast", { place: "Kyoto" }), use("get_wikipedia_summary", { title: "Kyoto" })),
        reply(use("sl_card", { content: "<p>ok</p>" })),
      ],
    });
    await runPipeline("Kyoto", [], deps(model));
    const second = model.requests.filter((r) => r.stage === "components")[1];
    const last = second.messages[second.messages.length - 1];
    expect(last.role).toBe("user");
    const blocks = last.content as ContentBlock[];
    expect(blocks.map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
    expect((blocks[0] as any).content).toBe(JSON.stringify(FORECAST));
  });

  it("hands a failed data call back as data and still builds the page", async () => {
    const model = scripted({
      components: [
        reply(use("get_exchange_rates", { base: "USD", symbols: ["EUR"] })),
        reply(use("sl_alert", { attributes: { variant: "warning" }, content: "<p>Rates could not be retrieved.</p>" })),
      ],
    });
    const out = await runPipeline("USD to EUR", [], deps(model));
    const second = model.requests.filter((r) => r.stage === "components")[1];
    const result = JSON.parse(((second.messages.at(-1)!.content as ContentBlock[])[0] as any).content);
    expect(result.instruction).toBe(NO_SUBSTITUTE);
    expect(out.components[0].tagName).toBe("sl-alert");
    expect(out.trace.find((t) => t.stage === "data")).toMatchObject({ ok: false });
  });

  it("stops after a round that placed components and asked for no data", async () => {
    const model = scripted({ components: [reply(use("sl_card", { content: "<p>a</p>" })), reply(use("sl_card", { content: "<p>never asked</p>" }))] });
    const out = await runPipeline("Explain sourdough", [], deps(model));
    expect(model.requests.filter((r) => r.stage === "components")).toHaveLength(1);
    expect(out.components).toHaveLength(1);
  });

  it("caps tool rounds", async () => {
    const forever = Array.from({ length: 20 }, () => reply(use("get_weather_forecast", { place: "Kyoto" })));
    const model = scripted({ components: forever });
    await expect(runPipeline("loop", [], deps(model))).rejects.toBeInstanceOf(NoComponentsError);
    expect(model.requests.filter((r) => r.stage === "components")).toHaveLength(LIMITS.maxToolRounds);
  });

  it("caps data calls and tells the model to build with what it has", async () => {
    const many = Array.from({ length: LIMITS.maxDataCalls + 3 }, (_, i) => use("get_weather_forecast", { place: `P${i}` }));
    const model = scripted({ components: [reply(...many), reply(use("sl_card", { content: "<p>a</p>" }))] });
    const d = deps(model);
    await runPipeline("many places", [], d);
    expect(d.dataCalls).toHaveLength(LIMITS.maxDataCalls);
  });

  it("caps components and acknowledges the ones it drops", async () => {
    const lots = Array.from({ length: LIMITS.maxComponents + 5 }, (_, i) => use("sl_card", { content: `<p>c${i}</p>` }));
    const model = scripted({ components: [reply(...lots)] });
    const out = await runPipeline("lots", [], deps(model));
    expect(out.components).toHaveLength(LIMITS.maxComponents);
  });

  it("fails clearly when no component comes back", async () => {
    const model = scripted({ components: [reply()] });
    await expect(runPipeline("nothing", [], deps(model))).rejects.toBeInstanceOf(NoComponentsError);
  });

  it("sends earlier turns as prompt and summary, never as tool traffic", async () => {
    const model = scripted({ components: [reply(use("sl_card", { content: "<p>a</p>" }))] });
    await runPipeline("and Osaka?", [{ prompt: "Kyoto weather", summary: "I displayed 3 components." }], deps(model));
    expect(model.requests[0].messages).toEqual([
      { role: "user", content: "Kyoto weather" },
      { role: "assistant", content: "I displayed 3 components." },
      { role: "user", content: "and Osaka?" },
    ]);
    expect(historyMessages(Array.from({ length: 20 }, (_, i) => ({ prompt: `p${i}`, summary: "s" })))).toHaveLength(LIMITS.maxHistoryTurns * 2);
  });
});

describe("the structure stage", () => {
  const two = [reply(use("sl_card", STAT("18 °C", "High")), use("sl_card", { content: "<p>Dry until Friday.</p>" }))];

  it("applies order, groups and role marks", async () => {
    const model = scripted({
      components: two,
      structure: () =>
        reply(use("set_structure", { components: [{ id: 1, group: "Advice", content: '<p data-role="body">Dry until Friday.</p>' }, { id: 0, group: "key figures" }] })),
    });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(out.components.map((c) => c.group)).toEqual(["advice", "key-figures"]);
    expect(out.components[0].content).toContain("Dry until Friday.");
  });

  it("passes the component list through when the answer is missing", async () => {
    const model = scripted({ components: two, structure: () => reply() });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(out.components).toHaveLength(2);
    expect(out.trace.find((t) => t.stage === "structure")).toMatchObject({ ok: false });
  });

  it("passes the component list through when the answer is malformed", async () => {
    for (const bad of [{ components: "all of them" }, { components: [] }, { components: [{ id: 99, group: "x" }] }, {}]) {
      const model = scripted({ components: two, structure: () => reply(use("set_structure", bad)) });
      const out = await runPipeline("Kyoto", [], deps(model));
      expect(out.components.map((c) => c.id)).toEqual([0, 1]);
    }
  });

  it("passes the component list through when the call throws", async () => {
    const model = scripted({
      components: two,
      structure: () => {
        throw new Error("Anthropic API 529: overloaded");
      },
    });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(out.components).toHaveLength(2);
    expect(out.trace.find((t) => t.stage === "structure")!.note).toContain("529");
  });

  it("refuses a rewrite that changes a figure, but keeps the grouping", () => {
    const original = [statCard(0, undefined as never, "18 °C")];
    const out = applyStructure(original, { components: [{ id: 0, group: "figures", content: '<span data-role="stat-value">19 °C</span>' }] })!;
    expect(out.components[0].content).toBe(original[0].content);
    expect(out.components[0].group).toBe("figures");
    expect(out.notes.join(" ")).toContain("changed a figure");
  });

  it("never lets the editor change a tag, attributes or chart data, or drop a table", () => {
    const original = [card(0), table(1, 3)];
    const out = applyStructure(original, { components: [{ id: 0, group: "a", tagName: "sl-dialog", attributes: { open: true } }] })!;
    expect(out.components[0].tagName).toBe("sl-card");
    expect(out.components[0].attributes).toEqual({});
    expect(out.components[1]).toEqual(original[1]);
    expect(out.notes.join(" ")).toContain("restored render-table 1");
  });

  it("knows a new number when it sees one", () => {
    expect(noNewNumerals("High 18 °C, low 7", "Low 7. High 18.")).toBe(true);
    expect(noNewNumerals("High 18 °C", "High 18.5 °C")).toBe(false);
    expect(noNewNumerals("1,234.50 EUR", "1,234.50")).toBe(true);
    expect(noNewNumerals("no figures", "about 3 days")).toBe(false);
  });
});

describe("the layout stage and the code passes after it", () => {
  const four = [reply(...["18 °C", "7 °C", "78%", "4 of 7"].map((v) => use("sl_card", STAT(v, "Label"))))];
  const grouped = () => reply(use("set_structure", { components: [0, 1, 2, 3].map((id) => ({ id, group: "figures" })) }));

  it("shows the layout model summary lines and never the markup", async () => {
    const model = scripted({ components: four, structure: grouped });
    await runPipeline("Kyoto", [], deps(model));
    const layoutReq = model.requests.find((r) => r.stage === "layout")!;
    const text = layoutReq.messages[0].content as string;
    expect(text).toContain('0. <sl-card> group=figures min-width=quarter | stat "18 °C"');
    expect(text).not.toContain("data-role");
    expect(text).not.toContain("<span");
    expect(layoutReq.toolChoice).toEqual({ type: "tool", name: "compose_layout" });
    expect(layoutReq.model).toBe("m-layout");
  });

  it("falls back to a stack when the layout model calls no tool", async () => {
    const model = scripted({ components: four, structure: grouped, layout: () => reply() });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(validateLayout(out.layout, out.components, spec)).toEqual([]);
    expect(out.trace.find((t) => t.stage === "layout")).toMatchObject({ ok: false });
  });

  it("falls back to a stack when the layout call throws", async () => {
    const model = scripted({
      components: four,
      layout: () => {
        throw new Error("timeout");
      },
    });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(validateLayout(out.layout, out.components, spec)).toEqual([]);
  });

  it("repairs what the layout model returns, and says so in the trace", async () => {
    const model = scripted({
      components: four,
      structure: grouped,
      layout: () => reply(use("compose_layout", { layout: { kind: "section", heading: "Kyoto", children: [{ kind: "grid", columns: 2, children: [{ kind: "ref", ref: 0 }, { kind: "ref", ref: 0 }, { kind: "ref", ref: 1 }] }] } })),
    });
    const out = await runPipeline("Kyoto", [], deps(model));
    expect(validateLayout(out.layout, out.components, spec)).toEqual([]);
    const repair = out.trace.find((t) => t.label === "layout repair")!;
    expect(repair.note).toContain("free-form grid");
    expect(repair.note).toContain("placed 2 components the layout left out");
  });

  it("typesets the result: every role element carries a type class", async () => {
    const model = scripted({ components: four, structure: grouped });
    const out = await runPipeline("Kyoto", [], deps(model));
    for (const c of out.components) {
      expect(c.content).toMatch(/data-role="stat-value" class="gx-type-heading-0\d gx-role-stat-value"/);
    }
  });

  it("returns follow-ups, and an empty list when that call fails", async () => {
    const good = await runPipeline("Kyoto", [], deps(scripted({ components: four })));
    expect(good.followUps).toEqual(["One?", "Two?", "Three?"]);
    const bad = await runPipeline(
      "Kyoto",
      [],
      deps(
        scripted({
          components: four,
          followUps: () => {
            throw new Error("down");
          },
        }),
      ),
    );
    expect(bad.followUps).toEqual([]);
    expect(bad.components).toHaveLength(4);
  });

  it("returns a summary for the next turn with no markup in it", async () => {
    const out = await runPipeline("Kyoto", [], deps(scripted({ components: four })));
    expect(out.summary).toContain("I displayed 4 components");
    expect(out.summary).toContain("call the data tools again");
    expect(out.summary).not.toContain("<");
  });

  it("uses each stage's own model", async () => {
    const model = scripted({ components: four, structure: grouped });
    await runPipeline("Kyoto", [], deps(model));
    const byStage = Object.fromEntries(model.requests.map((r) => [r.stage, r.model]));
    expect(byStage).toEqual({ components: "m-components", structure: "m-structure", layout: "m-layout", "follow-ups": "m-follow" });
  });
});

describe("mock mode", () => {
  it("runs the canned answer through the real passes and comes out valid", () => {
    const out = mockResponse();
    expect(validateLayout(out.layout, out.components, spec)).toEqual([]);
    const text = JSON.stringify(out.components);
    expect(text).not.toContain("font-size:64px");
    expect(text).not.toContain("huge-number");
    expect(out.components.find((c) => c.tagName === "sl-alert")!.attributes).toEqual({ variant: "warning", open: true });
    const notes = out.trace.map((t) => t.note ?? "").join(" ");
    expect(notes).toContain("joined rows that split one group");
    expect(notes).toContain("placed 1 component the layout left out");
  });
});
