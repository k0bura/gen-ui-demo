import { mockResponse } from "./mocks";
import type { GenerateResponse, HistoryTurn, PipelineEvent } from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Mock mode needs no API key: every prompt returns the same canned answer,
// run through the real code passes. Turn it on with `?mock` in the URL, or
// by flipping the constant for a whole dev session.
const FORCE_MOCKS = false;

export function useMocks(): boolean {
  if (FORCE_MOCKS) return true;
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("mock");
}

/**
 * Runs one prompt. `history` is the earlier turns of this conversation as
 * the client remembers them: the server keeps no state.
 */
export async function* runPipeline(
  prompt: string,
  history: HistoryTurn[] = [],
  getToken: () => Promise<string | null> = async () => null,
): AsyncGenerator<PipelineEvent> {
  yield { type: "start" };

  if (useMocks()) {
    await sleep(600);
    yield { type: "result", response: mockResponse() };
    return;
  }

  try {
    // A Turnstile token is single-use, so each request gets its own. Null
    // means no site key is configured (local development).
    const turnstileToken = await getToken();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history, ...(turnstileToken ? { turnstileToken } : {}) }),
    });
    if (!res.ok) {
      let message = `Server error: ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody.error) message = errBody.error;
      } catch {
        // Not JSON. Keep the status message.
      }
      yield { type: "error", message };
      return;
    }
    yield { type: "result", response: (await res.json()) as GenerateResponse };
  } catch (e) {
    yield { type: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
