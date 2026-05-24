// Cloudflare Pages Function — POST /api/generate
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
const STAGE_1_MODEL = "claude-sonnet-4-6";
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
// (see selectComponents). componentTools is the big block — ~40 tools, each
// with full attribute schemas — so this is the high-leverage cache.
const cachedComponentTools = componentTools.map((t, i) =>
  i === componentTools.length - 1 ? { ...t, ...EPHEMERAL } : t,
);

// Stage 2: only one tool, but still worth caching.
const cachedLayoutTool = { ...layoutTool, ...EPHEMERAL };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function callAnthropic(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<AnthropicResponse> {
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Anthropic API ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  return (await res.json()) as AnthropicResponse;
}

// ---------------------------------------------------------------------------
// Stage 1: component selection
// ---------------------------------------------------------------------------

async function selectComponents(
  apiKey: string,
  userPrompt: string,
): Promise<ComponentInstance[]> {
  const response = await callAnthropic(apiKey, {
    model: STAGE_1_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: COMPONENT_SELECTOR_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: cachedComponentTools,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: userPrompt }],
  });

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
  const summary = components
    .map((c) => {
      const head = `${c.id}. <${c.tagName}>`;
      const bits: string[] = [];
      if (c.content) bits.push(`content="${c.content.slice(0, 80)}"`);
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

  const response = await callAnthropic(apiKey, {
    model: STAGE_2_MODEL,
    max_tokens: 4096,
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
  });

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
