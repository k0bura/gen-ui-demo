// Cloudflare Pages Function - POST /api/generate
//
// Two-stage Anthropic pipeline:
//   Stage 1  Sonnet picks components (one tool_use per Shoelace tag).
//   Stage 2  Haiku composes them into a LayoutNode tree.
//
// Returns { components, layout } as JSON.

import type { ComponentInstance, LayoutNode } from "../../src/demo/types";
import { componentTools, layoutTool } from "../../src/demo/tools";
import {
  COMPONENT_SELECTOR_PROMPT,
  LAYOUT_DESIGNER_PROMPT,
} from "../../src/demo/prompts";

interface Env {
  ANTHROPIC_API_KEY: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Sonnet 4.6 picks components (judgement-heavy work);
// Haiku 4.5 arranges the layout (cheaper, structural).
const STAGE_1_MODEL = "claude-opus-4-6";
const STAGE_2_MODEL = "claude-haiku-4-5-20251001";

const MAX_PROMPT_LEN = 2000;
const MAX_COMPONENTS = 25;

// ---------------------------------------------------------------------------
// Anthropic API types (just the shapes we touch)
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  stop_reason?: string;
}

// ---------------------------------------------------------------------------
// Prompt caching.
//
// cache_control on the last element of a block caches everything from the
// start of the request up to and including that element. The variable
// portion (the user prompt) stays outside the cache. Anthropic bills cached
// content at ~10% of the per-call rate on subsequent requests within the
// cache TTL, so for both stages we cache everything except the user message.
// ---------------------------------------------------------------------------

const EPHEMERAL = { cache_control: { type: "ephemeral" } as const };

// Stage 1: cache the tools array. The system prompt is cached separately
// (see selectComponents). componentTools is the big block - ~40 tools, each
// with full attribute schemas - so this is the high-leverage cache.
const cachedComponentTools = componentTools.map((t, i) =>
  i === componentTools.length - 1 ? { ...t, ...EPHEMERAL } : t,
);

// Stage 2: only one tool, but still worth caching.
const cachedLayoutTool = { ...layoutTool, ...EPHEMERAL };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Drop HTML tags so Stage 2's reference card stays readable. Stage 1 emits
// rich content like "<p>Morning: ...</p><p>Afternoon: ...</p>" - for grouping
// purposes Stage 2 only needs the prose, not the markup.
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function callAnthropic(
  apiKey: string,
  payload: Record<string, unknown>,
  stageLabel: string,
): Promise<AnthropicResponse> {
  const t0 = Date.now();

  // What's going out (key elided). Big arrays get summarized so the log
  // is readable in the wrangler terminal.
  console.log(
    `[anthropic ${stageLabel}] →`,
    summarizePayload(payload),
  );

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[anthropic ${stageLabel}] ← ${res.status} (${elapsedMs}ms)`,
      text.slice(0, 400),
    );
    throw new Error(
      `Anthropic API ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as AnthropicResponse & {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };

  const u = data.usage ?? {};
  console.log(
    `[anthropic ${stageLabel}] ← 200 (${elapsedMs}ms)`,
    `stop=${data.stop_reason ?? "?"}`,
    `in=${u.input_tokens ?? "?"}`,
    `out=${u.output_tokens ?? "?"}`,
    `cache_write=${u.cache_creation_input_tokens ?? 0}`,
    `cache_read=${u.cache_read_input_tokens ?? 0}`,
    `tool_uses=${data.content?.filter((b) => b.type === "tool_use").length ?? 0}`,
  );

  return data;
}

// Print a payload summary that's useful without flooding the terminal:
// keep prompts/tools as counts, not full bodies.
function summarizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { model: payload.model };
  if (Array.isArray(payload.tools)) {
    out.tools = `[${payload.tools.length} tools]`;
  }
  if (Array.isArray(payload.system)) {
    const sys = payload.system as Array<{ text?: string }>;
    out.system_chars = sys.reduce(
      (n, b) => n + (b.text?.length ?? 0),
      0,
    );
  } else if (typeof payload.system === "string") {
    out.system_chars = (payload.system as string).length;
  }
  if (Array.isArray(payload.messages)) {
    const msgs = payload.messages as Array<{ role: string; content: unknown }>;
    out.messages = msgs.map((m) => {
      const c = m.content;
      const preview = typeof c === "string" ? c.slice(0, 120) : "[blocks]";
      return `${m.role}: ${preview}${typeof c === "string" && c.length > 120 ? "…" : ""}`;
    });
  }
  out.tool_choice = payload.tool_choice;
  out.max_tokens = payload.max_tokens;
  if (payload.temperature !== undefined) out.temperature = payload.temperature;
  return out;
}

// ---------------------------------------------------------------------------
// Stage 1: component selection
// ---------------------------------------------------------------------------

async function selectComponents(
  apiKey: string,
  userPrompt: string,
): Promise<ComponentInstance[]> {
  const response = await callAnthropic(
    apiKey,
    {
      model: STAGE_1_MODEL,
      // Stage 1 can emit up to 25 component tool_uses, each with prose
      // content and multiple slots - 4k output tokens runs out fast.
      max_tokens: 8192,
      // Low temperature so the model reliably follows the "decompose into
      // many tool_uses" rule instead of sometimes landing on "one big
      // summary alert". 0.2 keeps a little creativity in the content while
      // pinning the structural decision.
      temperature: 0.2,
      system: [
        {
          type: "text",
          text: COMPONENT_SELECTOR_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: cachedComponentTools,
      tool_choice: { type: "any" },
      messages: [
        {
          role: "user",
          content: [
            `User request: "${userPrompt}"`,
            "",
            "REQUIRED: emit MULTIPLE tool calls in this response (parallel tool use). One tool call per atomic section of the answer.",
            "",
            "For this prompt specifically: figure out the natural sections, then emit a separate tool_use for EACH one. If the user asked for a list of N items, emit N+ tool_uses. If they asked for a 14-day itinerary, emit ~16 tool_uses (intro + flight + 14 days + tips). If they asked to compare 3 things, emit ~5 tool_uses (intro + one per thing + verdict).",
            "",
            "A response with only ONE tool_use means you packed everything into a single sl-alert's content - that is wrong and will be rejected. The renderer needs many separate atoms to lay out.",
            "",
            "Plan your tool calls first, then emit them all in a single response (parallel tool_use is supported - just emit multiple tool_use blocks).",
          ].join("\n"),
        },
      ],
    },
    "stage1",
  );

  const components: ComponentInstance[] = [];
  for (const block of response.content) {
    if (block.type !== "tool_use" || !block.name) continue;
    if (components.length >= MAX_COMPONENTS) break;

    const tagName = block.name.replace(/_/g, "-");
    const input = (block.input ?? {}) as {
      attributes?: Record<string, string | number | boolean>;
      content?: string;
      slots?: Record<string, string>;
    };

    components.push({
      id: components.length,
      tagName,
      attributes: input.attributes ?? {},
      content: input.content,
      slots: input.slots,
    });
  }

  return components;
}

// ---------------------------------------------------------------------------
// Stage 2: layout composition
// ---------------------------------------------------------------------------

async function composeLayout(
  apiKey: string,
  userPrompt: string,
  components: ComponentInstance[],
): Promise<LayoutNode> {
  // Serialize the Stage 1 output as a compact reference card the layout LLM
  // can reason about. Each line is "id. <tag> { ...summary }".
  //
  // Critical: include the `header` slot (and other named slots) because that's
  // where Stage 1 puts the semantic label (e.g. header="Day 5 - Kyoto"). Without
  // it, Stage 2 cannot recognize that ids 3-16 are "the 14 day cards" and group
  // them into a grid - it would just see 14 generic sl-cards.
  const summary = components
    .map((c) => {
      const head = `${c.id}. <${c.tagName}>`;
      const bits: string[] = [];

      // Slot labels first - they're the strongest grouping signal.
      const slots = c.slots ?? {};
      if (slots.header) bits.push(`header="${stripTags(slots.header).slice(0, 80)}"`);
      if (slots.icon) {
        const iconMatch = /name="([^"]+)"/.exec(slots.icon);
        if (iconMatch) bits.push(`icon=${iconMatch[1]}`);
      }

      if (c.content) {
        bits.push(`content="${stripTags(c.content).slice(0, 100)}"`);
      }

      const attrs = Object.entries(c.attributes ?? {})
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      if (attrs) bits.push(attrs);

      return bits.length ? `${head}  ${bits.join("  ")}` : head;
    })
    .join("\n");

  const userMsg = [
    `Original prompt: "${userPrompt}"`,
    "",
    "Components selected in Stage 1:",
    summary,
    "",
    `Arrange these ${components.length} components using the compose_layout tool.`,
    `Every component (ids 0 through ${components.length - 1}) must appear`,
    `exactly once as a 'ref' leaf in the tree.`,
  ].join("\n");

  const response = await callAnthropic(
    apiKey,
    {
      model: STAGE_2_MODEL,
      max_tokens: 4096,
      // Stage 2 is purely structural - no need for creativity. Low temp
      // makes the grouping decisions stable run-to-run.
      temperature: 0.1,
      // Cache the (long) system prompt + the layout tool spec; only the
      // user message varies per request.
      system: [
        {
          type: "text",
          text: LAYOUT_DESIGNER_PROMPT,
          ...EPHEMERAL,
        },
      ],
      tools: [cachedLayoutTool],
      tool_choice: { type: "tool", name: "compose_layout" },
      messages: [{ role: "user", content: userMsg }],
    },
    "stage2",
  );

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "compose_layout") {
      const input = block.input as { layout: LayoutNode };
      return input.layout;
    }
  }

  throw new Error("Stage 2 returned no compose_layout tool_use block");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);
  }

  let body: { prompt?: string };
  try {
    body = (await request.json()) as { prompt?: string };
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return json({ error: "Missing 'prompt'" }, 400);
  if (prompt.length > MAX_PROMPT_LEN) {
    return json(
      { error: `Prompt too long (max ${MAX_PROMPT_LEN} chars)` },
      400,
    );
  }

  try {
    const components = await selectComponents(env.ANTHROPIC_API_KEY, prompt);
    if (components.length === 0) {
      return json(
        {
          error: "The model didn't return any components for that prompt.",
        },
        502,
      );
    }

    const layout = await composeLayout(
      env.ANTHROPIC_API_KEY,
      prompt,
      components,
    );

    return json({ components, layout });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate]", message);
    return json({ error: message }, 502);
  }
};
