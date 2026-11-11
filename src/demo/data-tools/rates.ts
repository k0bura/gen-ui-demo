// Exchange rates from Frankfurter (frankfurter.dev), which republishes the
// European Central Bank's daily reference rates. No key.

import { DataError, getJson, round } from "./http";
import type { DataTool } from "./types";

const code = (v: unknown): string => String(v ?? "").trim().toUpperCase();
const isCode = (c: string): boolean => /^[A-Z]{3}$/.test(c);

function requireCodes(...codes: string[]): void {
  for (const c of codes) {
    if (!isCode(c)) throw new DataError(`"${c}" is not a three-letter currency code`, "not-found");
  }
}

/** Rates below 10 keep four places; larger ones keep two. */
const rate = (n: number): number => round(n, n < 10 ? 4 : 2);

interface Latest {
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface Series {
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

export const getExchangeRates: DataTool = {
  definition: {
    name: "get_exchange_rates",
    description:
      "Latest reference exchange rates from one currency to one or more others. Use three-letter codes (USD, EUR, JPY, GBP).",
    input_schema: {
      type: "object",
      properties: {
        base: { type: "string", description: "Currency to convert from, e.g. USD" },
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Currencies to convert to, e.g. [\"EUR\", \"JPY\"]. Up to 8.",
        },
      },
      required: ["base", "symbols"],
      additionalProperties: false,
    },
  },
  handler: async (input, http) => {
    const base = code(input.base);
    const symbols = (Array.isArray(input.symbols) ? input.symbols : [input.symbols]).map(code).filter(Boolean).slice(0, 8);
    requireCodes(base, ...symbols);
    if (!symbols.length) throw new DataError("No target currencies were given", "not-found");
    const url = `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbols.join(",")}`;
    const res = await getJson<Latest>(url, "The exchange-rate service", http);
    return {
      base: res.base,
      asOf: res.date,
      rates: Object.entries(res.rates).map(([currency, value]) => ({
        currency,
        rate: rate(value),
        meaning: `1 ${res.base} = ${rate(value)} ${currency}`,
      })),
      note: "European Central Bank reference rates, published on working days. Not a tradable quote.",
    };
  },
};

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const getExchangeRateHistory: DataTool = {
  definition: {
    name: "get_exchange_rate_history",
    description:
      "Daily history of one currency pair over the last N days, with the first and last values, the change and the range. Use it for trends and charts. Three-letter codes.",
    input_schema: {
      type: "object",
      properties: {
        base: { type: "string", description: "Currency to convert from, e.g. USD" },
        symbol: { type: "string", description: "Currency to convert to, e.g. EUR" },
        days: { type: "number", description: "How far back, 7 to 365. Defaults to 30." },
      },
      required: ["base", "symbol"],
      additionalProperties: false,
    },
  },
  handler: async (input, http) => {
    const base = code(input.base);
    const symbol = code(input.symbol);
    requireCodes(base, symbol);
    const days = Math.max(7, Math.min(365, Math.round(Number(input.days) || 30)));
    const now = (http.now ?? Date.now)();
    const url = `https://api.frankfurter.dev/v1/${isoDay(now - days * 86400000)}..${isoDay(now)}?base=${base}&symbols=${symbol}`;
    const res = await getJson<Series>(url, "The exchange-rate service", http);
    const all = Object.entries(res.rates)
      .map(([date, r]) => ({ date, rate: r[symbol] }))
      .filter((p) => typeof p.rate === "number")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (all.length < 2) throw new DataError(`No rate history for ${base} to ${symbol}`, "not-found");

    // A chart reads fine at about 30 points. Thin longer series evenly and
    // always keep the last day.
    const step = Math.max(1, Math.ceil(all.length / 30));
    const points = all.filter((_, i) => i % step === 0 || i === all.length - 1);
    const first = all[0].rate;
    const last = all[all.length - 1].rate;
    const values = all.map((p) => p.rate);
    return {
      pair: `${base}/${symbol}`,
      from: all[0].date,
      to: all[all.length - 1].date,
      first: rate(first),
      last: rate(last),
      changePct: round(((last - first) / first) * 100, 2),
      low: rate(Math.min(...values)),
      high: rate(Math.max(...values)),
      points: points.map((p) => ({ date: p.date, rate: rate(p.rate) })),
      note: `European Central Bank reference rates on working days. ${points.length} of ${all.length} days shown.`,
    };
  },
};
