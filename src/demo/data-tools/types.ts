import type { AnthropicTool } from "../types";
import type { HttpOptions } from "./http";

export interface DataTool {
  definition: AnthropicTool;
  /** Returns a small, flat, labelled object. Throws DataError on failure. */
  handler: (input: Record<string, unknown>, http: HttpOptions) => Promise<unknown>;
}

/**
 * Sent back to the model with every failed data call. A failure is data:
 * the model can say what is missing and still build the rest of the page.
 */
export const NO_SUBSTITUTE =
  "Tell the user this could not be retrieved. Do not substitute figures, facts, dates or links from your own knowledge.";

export interface DataToolError {
  error: string;
  instruction: string;
}
