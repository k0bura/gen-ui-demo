// The data tools the component stage can call, and the one place they run.

import type { AnthropicTool } from "../types";
import { DataError, type HttpOptions } from "./http";
import { getExchangeRateHistory, getExchangeRates } from "./rates";
import { NO_SUBSTITUTE, type DataTool, type DataToolError } from "./types";
import { getWeatherForecast } from "./weather";
import { getWikipediaSummary } from "./wikipedia";

export const DATA_TOOLS: DataTool[] = [
  getWeatherForecast,
  getExchangeRates,
  getExchangeRateHistory,
  getWikipediaSummary,
];

export const dataToolDefinitions: AnthropicTool[] = DATA_TOOLS.map((t) => t.definition);

export function isDataTool(name: string, tools: DataTool[] = DATA_TOOLS): boolean {
  return tools.some((t) => t.definition.name === name);
}

export interface DataToolOutcome {
  ok: boolean;
  result: unknown | DataToolError;
}

/**
 * Runs one data tool. Never throws: whatever goes wrong comes back as
 * `{ error, instruction }`, which the model receives as the tool result.
 */
export async function runDataTool(
  name: string,
  input: Record<string, unknown>,
  http: HttpOptions = {},
  tools: DataTool[] = DATA_TOOLS,
): Promise<DataToolOutcome> {
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) {
    return { ok: false, result: { error: `There is no data tool called ${name}.`, instruction: NO_SUBSTITUTE } };
  }
  try {
    return { ok: true, result: await tool.handler(input ?? {}, http) };
  } catch (e) {
    const error =
      e instanceof DataError
        ? e.kind === "not-found"
          ? e.message
          : `${name} is temporarily unavailable: ${e.message}`
        : `${name} failed unexpectedly.`;
    return { ok: false, result: { error, instruction: NO_SUBSTITUTE } };
  }
}
