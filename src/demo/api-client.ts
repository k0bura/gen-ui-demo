import type { PipelineEvent, ComponentChoice, LayoutNode } from "./types.ts";
import { MOCK_COMPONENTS, MOCK_LAYOUT } from "./mocks.ts";

interface GenerateResponse {
  components: ComponentChoice[];
  layout: LayoutNode;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const USE_MOCKS = true;

export async function* runPipeline(prompt: string): AsyncGenerator<PipelineEvent> {
  if (USE_MOCKS) {
    yield* runMockPipeline(prompt);
    return;
  }
  yield* runRealPipeline(prompt);
}

async function* runMockPipeline(_prompt: string): AsyncGenerator<PipelineEvent> {
  yield { type: "stage1_start" };
  await sleep(900);
  yield { type: "stage1_complete", components: MOCK_COMPONENTS };
  yield { type: "stage2_start" };
  await sleep(700);
  yield { type: "stage2_complete", layout: MOCK_LAYOUT };
}

async function* runRealPipeline(prompt: string): AsyncGenerator<PipelineEvent> {
  yield { type: "stage1_start" };
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      yield { type: "error", message: `Server error: ${res.status}` };
      return;
    }
    const data = (await res.json()) as GenerateResponse;
    yield { type: "stage1_complete", components: data.components };
    yield { type: "stage2_start" };
    yield { type: "stage2_complete", layout: data.layout };
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
