import type {
  ComponentInstance,
  LayoutNode,
  PipelineEvent,
} from "./types";
import { MOCK_COMPONENTS, MOCK_LAYOUT } from "./mocks";

interface GenerateResponse {
  components: ComponentInstance[];
  layout: LayoutNode;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Flip to `true` for offline development without an Anthropic key. Production
// + CF Pages deploys hit /api/generate (the real two-stage pipeline).
export const USE_MOCKS = false;

export async function* runPipeline(
  prompt: string,
): AsyncGenerator<PipelineEvent> {
  if (USE_MOCKS) {
    yield* runMockPipeline(prompt);
    return;
  }
  yield* runRealPipeline(prompt);
}

async function* runMockPipeline(
  _prompt: string,
): AsyncGenerator<PipelineEvent> {
  yield { type: "stage1-start" };
  await sleep(900);
  yield { type: "stage1-result", components: MOCK_COMPONENTS };
  yield { type: "stage2-start" };
  await sleep(700);
  yield { type: "stage2-result", layout: MOCK_LAYOUT };
}

// The server returns a single JSON response after both stages complete.
// We yield stage events around the fetch so the UI gets a consistent
// event stream, but they all fire in quick succession once the response
// arrives - there's no progress mid-pipeline.
async function* runRealPipeline(
  prompt: string,
): AsyncGenerator<PipelineEvent> {
  yield { type: "stage1-start" };
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      let message = `Server error: ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody.error) message = errBody.error;
      } catch {
        // ignore, fall through with default
      }
      yield { type: "error", message };
      return;
    }
    const data = (await res.json()) as GenerateResponse;
    yield { type: "stage1-result", components: data.components };
    yield { type: "stage2-start" };
    yield { type: "stage2-result", layout: data.layout };
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
