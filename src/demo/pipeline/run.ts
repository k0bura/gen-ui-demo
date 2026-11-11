// The pipeline, start to finish.
//
//   components   a tool-calling loop: data tools, then component calls
//   normalize    code
//   structure    one model call: order, groups, text roles
//   normalize    code
//   layout       one model call over one summary line per component
//   repair       code: the layout now obeys the spec
//   typeset      code: roles become type styles sized to their slots
//   follow-ups   one cheap model call; failure is an empty list
//
// The model and the network are both passed in, so tests drive the whole
// thing with a scripted model and no HTTP.

import { runDataTool as realRunDataTool, isDataTool, dataToolDefinitions, type DataToolOutcome } from "../data-tools/registry";
import { LAYOUT_SPEC, typeClassNames, type LayoutSpec } from "../layout-spec";
import { allLibraryTags, componentSpecs } from "../manifest";
import { COMPONENT_PROMPT, FOLLOW_UP_PROMPT, layoutPrompt, structurePrompt } from "../prompts";
import { componentTools, followUpTool, handWrittenTools, layoutTool, structureTool } from "../tools";
import {
  CHART_TAG,
  TABLE_TAG,
  type AnthropicTool,
  type ComponentInstance,
  type GenerateResponse,
  type HistoryTurn,
  type LayoutNode,
  type TraceEntry,
} from "../types";
import { conversationSummary, summaryLines } from "./density";
import { fallbackLayout, repairLayout, validateLayout } from "./layout-repair";
import { stripTags } from "./markup";
import { normalizeComponents, type NormalizeContext } from "./normalize";
import { roleNames } from "./spec-prompt";
import { typeset } from "./typeset";

// ---------------------------------------------------------------------------
// The model seam
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export type ToolChoice = { type: "auto" } | { type: "any" } | { type: "tool"; name: string };

export interface ModelRequest {
  stage: TraceEntry["stage"];
  model: string;
  system: string;
  tools: AnthropicTool[];
  toolChoice: ToolChoice;
  messages: Message[];
  maxTokens: number;
  temperature: number;
}

export interface ModelResponse {
  content: ContentBlock[];
  stop_reason?: string;
}

export type CallModel = (req: ModelRequest) => Promise<ModelResponse>;

export interface Models {
  components: string;
  structure: string;
  layout: string;
  followUps: string;
}

export interface PipelineDeps {
  callModel: CallModel;
  models: Models;
  runDataTool?: (name: string, input: Record<string, unknown>) => Promise<DataToolOutcome>;
  spec?: LayoutSpec;
  now?: () => number;
}

export const LIMITS = {
  maxToolRounds: 5,
  maxDataCalls: 8,
  maxComponents: 25,
  maxHistoryTurns: 6,
} as const;

export const IMAGE_HOSTS = ["wikimedia.org"] as const;

export class NoComponentsError extends Error {
  constructor() {
    super("The model didn't return any components for that prompt.");
  }
}

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

export function normalizeContext(spec: LayoutSpec): NormalizeContext {
  return {
    attributesByTag: new Map(componentSpecs.map((s) => [s.tagName, new Set(Object.keys(s.attributes))])),
    sanitize: {
      allowedClasses: new Set(typeClassNames(spec)),
      allowedImageHosts: IMAGE_HOSTS,
      allowedCustomElements: allLibraryTags,
    },
    roles: new Set(roleNames(spec)),
    maxComponents: LIMITS.maxComponents,
  };
}

const toolUses = (res: ModelResponse) =>
  res.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

/** Earlier turns as plain messages: the prompt, then what was shown. */
export function historyMessages(history: HistoryTurn[]): Message[] {
  return history.slice(-LIMITS.maxHistoryTurns).flatMap((turn): Message[] => [
    { role: "user", content: turn.prompt },
    { role: "assistant", content: turn.summary },
  ]);
}

// ---------------------------------------------------------------------------
// Stage: components
// ---------------------------------------------------------------------------

function toInstance(name: string, input: Record<string, unknown>, id: number): ComponentInstance {
  if (name === "render_chart") {
    return { id, tagName: CHART_TAG, attributes: {}, data: { kind: "chart", ...(input as object) } as never };
  }
  if (name === "render_table") {
    return { id, tagName: TABLE_TAG, attributes: {}, data: { kind: "table", ...(input as object) } as never };
  }
  return {
    id,
    tagName: name.replace(/_/g, "-"),
    attributes: (input.attributes ?? {}) as ComponentInstance["attributes"],
    content: typeof input.content === "string" ? input.content : undefined,
    slots: (input.slots ?? undefined) as Record<string, string> | undefined,
  };
}

export async function runComponentStage(
  prompt: string,
  history: HistoryTurn[],
  deps: PipelineDeps,
  trace: TraceEntry[],
): Promise<ComponentInstance[]> {
  const now = deps.now ?? Date.now;
  const runData = deps.runDataTool ?? ((name, input) => realRunDataTool(name, input));
  const tools = [...dataToolDefinitions, ...handWrittenTools, ...componentTools];

  // The loop works on its own copy of the conversation. Tool calls and
  // results never go back to the client, so the next prompt starts small
  // and fetches fresh data.
  const messages: Message[] = [...historyMessages(history), { role: "user", content: prompt }];
  const components: ComponentInstance[] = [];
  let dataCalls = 0;

  for (let round = 0; round < LIMITS.maxToolRounds; round++) {
    const t0 = now();
    const res = await deps.callModel({
      stage: "components",
      model: deps.models.components,
      system: COMPONENT_PROMPT,
      tools,
      // Until a component exists the model must call a tool, so it cannot
      // answer in prose. After that it may stop when it is done.
      toolChoice: components.length === 0 ? { type: "any" } : { type: "auto" },
      messages,
      maxTokens: 8192,
      temperature: 0.2,
    });
    const calls = toolUses(res);
    trace.push({
      stage: "components",
      label: `round ${round + 1}`,
      ok: true,
      ms: now() - t0,
      note: `${calls.length} tool call${calls.length === 1 ? "" : "s"}`,
    });
    if (calls.length === 0) break;

    const results: ContentBlock[] = [];
    let askedForData = false;
    // Data calls in one response run together.
    const outcomes = await Promise.all(
      calls.map(async (call) => {
        if (!isDataTool(call.name)) return null;
        askedForData = true;
        if (++dataCalls > LIMITS.maxDataCalls) {
          return { ok: false, ms: 0, result: { error: "Data call limit reached for this request.", instruction: "Build the page from the data you already have." } };
        }
        const d0 = now();
        const outcome = await runData(call.name, call.input ?? {});
        return { ...outcome, ms: now() - d0 };
      }),
    );

    calls.forEach((call, i) => {
      const outcome = outcomes[i];
      if (outcome) {
        trace.push({
          stage: "data",
          label: `${call.name}(${JSON.stringify(call.input ?? {}).slice(0, 80)})`,
          ok: outcome.ok,
          ms: outcome.ms,
          ...(outcome.ok ? {} : { note: String((outcome.result as { error?: string }).error ?? "") }),
        });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(outcome.result) });
        return;
      }
      // A component tool. Past the cap the call is acknowledged and dropped.
      if (components.length < LIMITS.maxComponents) {
        components.push(toInstance(call.name, call.input ?? {}, components.length));
        results.push({ type: "tool_result", tool_use_id: call.id, content: '{"status":"rendered"}' });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, content: '{"status":"dropped","reason":"component limit reached"}' });
      }
    });

    // A round that placed components and asked for no data is the answer.
    // Going round again would only buy a closing remark.
    if (components.length > 0 && !askedForData) break;

    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: results });
  }

  return components;
}

// ---------------------------------------------------------------------------
// Stage: structure and roles
// ---------------------------------------------------------------------------

const numerals = (text: string): string[] => text.match(/\d+(?:[.,]\d+)*/g) ?? [];

/** True when `after` contains no number that `before` did not. */
export function noNewNumerals(before: string, after: string): boolean {
  const known = new Set(numerals(before));
  return numerals(after).every((n) => known.has(n));
}

const markupText = (c: Pick<ComponentInstance, "content" | "slots">): string =>
  stripTags([c.content ?? "", ...Object.values(c.slots ?? {})].join(" "));

/**
 * Applies the structure stage's answer to the component list. Tag,
 * attributes and chart/table data always come from the original. Rewritten
 * markup is accepted only if it adds no new figures; otherwise the original
 * markup stays and the group and order are still used.
 */
export function applyStructure(
  original: ComponentInstance[],
  answer: unknown,
): { components: ComponentInstance[]; notes: string[] } | null {
  const list = (answer as { components?: unknown })?.components;
  if (!Array.isArray(list) || list.length === 0) return null;

  const byId = new Map(original.map((c) => [c.id, c]));
  const used = new Set<number>();
  const notes: string[] = [];
  const out: ComponentInstance[] = [];

  for (const item of list) {
    const o = (item ?? {}) as Record<string, unknown>;
    const src = byId.get(Number(o.id));
    if (!src || used.has(src.id)) continue;
    used.add(src.id);

    const next: ComponentInstance = { ...src };
    if (typeof o.group === "string" && o.group.trim()) next.group = o.group;

    if (!src.data) {
      const candidate: Pick<ComponentInstance, "content" | "slots"> = {
        content: typeof o.content === "string" ? o.content : src.content,
        slots:
          o.slots && typeof o.slots === "object"
            ? { ...src.slots, ...(o.slots as Record<string, string>) }
            : src.slots,
      };
      if (noNewNumerals(markupText(src), markupText(candidate))) {
        next.content = candidate.content;
        next.slots = candidate.slots;
      } else {
        notes.push(`kept the original text of component ${src.id}: the rewrite changed a figure`);
      }
    }
    out.push(next);
  }

  if (out.length === 0) return null;
  // Data is never dropped by an editor. A chart or table it left out comes back.
  for (const c of original) {
    if (!used.has(c.id) && c.data) {
      out.push(c);
      notes.push(`restored ${c.tagName} ${c.id}, which the structure stage left out`);
    }
  }
  return { components: out, notes };
}

export async function runStructureStage(
  prompt: string,
  components: ComponentInstance[],
  deps: PipelineDeps,
  spec: LayoutSpec,
  trace: TraceEntry[],
): Promise<ComponentInstance[]> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  try {
    const res = await deps.callModel({
      stage: "structure",
      model: deps.models.structure,
      system: structurePrompt(spec),
      tools: [structureTool(spec)],
      toolChoice: { type: "tool", name: "set_structure" },
      messages: [
        {
          role: "user",
          content: `Request: "${prompt}"\n\nComponents:\n${JSON.stringify(
            components.map(({ id, tagName, content, slots, data }) => ({
              id,
              tagName,
              ...(content ? { content } : {}),
              ...(slots ? { slots } : {}),
              ...(data ? { title: data.title ?? null, kind: data.kind } : {}),
            })),
          )}`,
        },
      ],
      maxTokens: 8192,
      temperature: 0.2,
    });
    const call = toolUses(res).find((c) => c.name === "set_structure");
    const applied = call ? applyStructure(components, call.input) : null;
    if (!applied) {
      trace.push({ stage: "structure", label: "structure and roles", ok: false, ms: now() - t0, note: "no usable answer; kept the component list as it was" });
      return components;
    }
    trace.push({
      stage: "structure",
      label: "structure and roles",
      ok: true,
      ms: now() - t0,
      note: [`${new Set(applied.components.map((c) => c.group)).size} groups`, ...applied.notes].join("; "),
    });
    return applied.components;
  } catch (e) {
    // This stage improves the page. It is not allowed to cost the user the page.
    trace.push({ stage: "structure", label: "structure and roles", ok: false, ms: now() - t0, note: `failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); kept the component list as it was` });
    return components;
  }
}

// ---------------------------------------------------------------------------
// Stage: layout
// ---------------------------------------------------------------------------

export async function runLayoutStage(
  prompt: string,
  components: ComponentInstance[],
  deps: PipelineDeps,
  spec: LayoutSpec,
  trace: TraceEntry[],
): Promise<unknown> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  try {
    const res = await deps.callModel({
      stage: "layout",
      model: deps.models.layout,
      system: layoutPrompt(spec),
      tools: [layoutTool(spec)],
      toolChoice: { type: "tool", name: "compose_layout" },
      messages: [
        {
          role: "user",
          content: `Request: "${prompt}"\n\nComponents:\n${summaryLines(components, spec)}\n\nArrange all ${components.length} components (ids 0 to ${components.length - 1}).`,
        },
      ],
      maxTokens: 4096,
      temperature: 0.1,
    });
    const call = toolUses(res).find((c) => c.name === "compose_layout");
    trace.push({ stage: "layout", label: "compose layout", ok: Boolean(call), ms: now() - t0, ...(call ? {} : { note: "no tool call; stacked the components" }) });
    return call ? (call.input as { layout?: unknown }).layout : null;
  } catch (e) {
    trace.push({ stage: "layout", label: "compose layout", ok: false, ms: now() - t0, note: `failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}); stacked the components` });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage: follow-ups
// ---------------------------------------------------------------------------

export async function runFollowUps(
  prompt: string,
  summary: string,
  deps: PipelineDeps,
  trace: TraceEntry[],
): Promise<string[]> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  try {
    const res = await deps.callModel({
      stage: "follow-ups",
      model: deps.models.followUps,
      system: FOLLOW_UP_PROMPT,
      tools: [followUpTool],
      toolChoice: { type: "tool", name: "suggest_follow_ups" },
      messages: [{ role: "user", content: `Request: "${prompt}"\n\nThe page showed: ${summary}` }],
      maxTokens: 300,
      temperature: 0.7,
    });
    const prompts = (toolUses(res).find((c) => c.name === "suggest_follow_ups")?.input as { prompts?: unknown })?.prompts;
    const list = (Array.isArray(prompts) ? prompts : [])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim().slice(0, 80))
      .slice(0, 3);
    trace.push({ stage: "follow-ups", label: "suggest follow-ups", ok: list.length > 0, ms: now() - t0 });
    return list;
  } catch {
    trace.push({ stage: "follow-ups", label: "suggest follow-ups", ok: false, ms: now() - t0, note: "failed; no suggestions shown" });
    return [];
  }
}

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

export async function runPipeline(
  prompt: string,
  history: HistoryTurn[],
  deps: PipelineDeps,
): Promise<GenerateResponse> {
  const spec = deps.spec ?? LAYOUT_SPEC;
  const ctx = normalizeContext(spec);
  const trace: TraceEntry[] = [];
  const fixed = (label: string, fixes: string[]) => {
    if (fixes.length) trace.push({ stage: "repair", label, ok: true, note: fixes.join("; ") });
  };

  const raw = await runComponentStage(prompt, history, deps, trace);
  const first = normalizeComponents(raw, ctx);
  fixed("normalize after components", first.fixes);
  if (first.components.length === 0) throw new NoComponentsError();

  const structured = await runStructureStage(prompt, first.components, deps, spec, trace);
  const second = normalizeComponents(structured, ctx);
  fixed("normalize after structure", second.fixes);
  // Normalizing can only remove. If it removed everything, the first pass stands.
  const components = second.components.length ? second.components : first.components;

  const summary = conversationSummary(components, spec);
  // Layout and follow-ups need nothing from each other, so they run together.
  const [proposed, followUps] = await Promise.all([
    runLayoutStage(prompt, components, deps, spec, trace),
    runFollowUps(prompt, summary, deps, trace),
  ]);

  const repaired = repairLayout(proposed, components, spec);
  fixed("layout repair", repaired.fixes);
  let layout: LayoutNode = repaired.layout;
  const problems = validateLayout(layout, components, spec);
  if (problems.length) {
    // Repair is meant to make this impossible. If it ever is not, the page
    // still renders, as a plain stack, and the trace says why.
    trace.push({ stage: "repair", label: "layout self-check", ok: false, note: problems.join("; ") });
    layout = fallbackLayout(components);
  }

  return { components: typeset(components, layout, spec), layout, followUps, summary, trace };
}
