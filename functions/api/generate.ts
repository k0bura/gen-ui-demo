// Cloudflare Pages Function - POST /api/generate
//
// Body:    { prompt: string, history?: [{ prompt, summary }], turnstileToken?: string }
// Returns: { components, layout, followUps, summary, trace }
//
// The pipeline itself lives in src/demo/pipeline/run.ts and knows nothing
// about HTTP. This file is the Anthropic transport (with prompt caching),
// request validation, and error mapping. The function is stateless: the
// client sends the earlier turns back as short summaries.

import {
  LIMITS,
  NoComponentsError,
  runPipeline,
  type CallModel,
  type ModelRequest,
  type ModelResponse,
  type Models,
} from "../../src/demo/pipeline/run";
import { checkTurnstile } from "../../src/demo/turnstile-verify";
import type { HistoryTurn } from "../../src/demo/types";

interface Env {
  ANTHROPIC_API_KEY: string;
  /** Cloudflare Turnstile secret. Required on any non-local host. */
  TURNSTILE_SECRET_KEY?: string;
  /** Optional overrides, mainly for trying a different model locally. */
  MODEL_COMPONENTS?: string;
  MODEL_STRUCTURE?: string;
  MODEL_LAYOUT?: string;
  MODEL_FOLLOW_UPS?: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// The component stage does the judgement-heavy work: which data to fetch,
// what to show. Structure is an editing pass. Layout and follow-ups are
// small structural tasks over short inputs, which is why the cheapest
// model is enough for them.
//
// These models are chosen on purpose. Every stage relies on forced tool
// use (tool_choice "any" or a named tool) and a low temperature, and the
// newest model generations reject both. Moving up means switching to
// tool_choice "auto" with strict tools; see the README.
const DEFAULT_MODELS: Models = {
  components: "claude-opus-4-6",
  structure: "claude-sonnet-4-6",
  layout: "claude-haiku-4-5",
  followUps: "claude-haiku-4-5",
};

const MAX_PROMPT_LEN = 2000;
const MAX_SUMMARY_LEN = 2000;

const EPHEMERAL = { cache_control: { type: "ephemeral" } as const };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Prompt caching.
//
// A cache breakpoint covers everything before it, in render order: tools,
// then system, then messages. Tools and system prompt are the same on every
// request, so both get a breakpoint. In the component stage's loop the
// conversation grows by one round at a time, so the last block of the last
// message gets one too and each round reads the previous round from cache.
// ---------------------------------------------------------------------------

function toPayload(req: ModelRequest): Record<string, unknown> {
  const tools = req.tools.map((t, i) => (i === req.tools.length - 1 ? { ...t, ...EPHEMERAL } : t));

  const messages = req.messages.map((m, i) => {
    const last = i === req.messages.length - 1;
    if (!last || req.stage !== "components" || typeof m.content === "string") return m;
    const blocks = m.content.map((b, j) => (j === m.content.length - 1 ? { ...b, ...EPHEMERAL } : b));
    return { ...m, content: blocks };
  });

  return {
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    system: [{ type: "text", text: req.system, ...EPHEMERAL }],
    tools,
    tool_choice: req.toolChoice,
    messages,
  };
}

function anthropicCaller(apiKey: string): CallModel {
  return async (req) => {
    const t0 = Date.now();
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(toPayload(req)),
    });
    const elapsedMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text();
      console.error(`[anthropic ${req.stage}] ${res.status} (${elapsedMs}ms)`, text.slice(0, 400));
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as ModelResponse & {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const u = data.usage ?? {};
    console.log(
      `[anthropic ${req.stage}] 200 (${elapsedMs}ms)`,
      `model=${req.model}`,
      `stop=${data.stop_reason ?? "?"}`,
      `in=${u.input_tokens ?? "?"}`,
      `out=${u.output_tokens ?? "?"}`,
      `cache_write=${u.cache_creation_input_tokens ?? 0}`,
      `cache_read=${u.cache_read_input_tokens ?? 0}`,
      `tool_uses=${data.content?.filter((b) => b.type === "tool_use").length ?? 0}`,
    );
    return data;
  };
}

function readHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is HistoryTurn =>
        Boolean(t) && typeof t.prompt === "string" && typeof t.summary === "string",
    )
    .slice(-LIMITS.maxHistoryTurns)
    .map((t) => ({
      prompt: t.prompt.slice(0, MAX_PROMPT_LEN),
      summary: t.summary.slice(0, MAX_SUMMARY_LEN),
    }));
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);
  }

  let body: { prompt?: unknown; history?: unknown; turnstileToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return json({ error: "Missing 'prompt'" }, 400);
  if (prompt.length > MAX_PROMPT_LEN) {
    return json({ error: `Prompt too long (max ${MAX_PROMPT_LEN} chars)` }, 400);
  }

  // Checked after the cheap validation and before any model call.
  const human = await checkTurnstile({
    secret: env.TURNSTILE_SECRET_KEY,
    token: body.turnstileToken,
    hostname: new URL(request.url).hostname,
    remoteIp: request.headers.get("CF-Connecting-IP"),
  });
  if (!human.ok) return json({ error: human.error }, human.status ?? 403);

  const models: Models = {
    components: env.MODEL_COMPONENTS || DEFAULT_MODELS.components,
    structure: env.MODEL_STRUCTURE || DEFAULT_MODELS.structure,
    layout: env.MODEL_LAYOUT || DEFAULT_MODELS.layout,
    followUps: env.MODEL_FOLLOW_UPS || DEFAULT_MODELS.followUps,
  };

  try {
    const result = await runPipeline(prompt, readHistory(body.history), {
      callModel: anthropicCaller(env.ANTHROPIC_API_KEY),
      models,
    });
    return json(result);
  } catch (e) {
    if (e instanceof NoComponentsError) return json({ error: e.message }, 502);
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate]", message);
    return json({ error: message }, 502);
  }
};
