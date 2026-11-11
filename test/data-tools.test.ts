import { beforeEach, describe, expect, it } from "vitest";
import { clearHttpCache, DataError, getJson, round } from "../src/demo/data-tools/http";
import { getExchangeRateHistory, getExchangeRates } from "../src/demo/data-tools/rates";
import { DATA_TOOLS, isDataTool, runDataTool } from "../src/demo/data-tools/registry";
import { NO_SUBSTITUTE, type DataTool } from "../src/demo/data-tools/types";
import { describeWeatherCode, getWeatherForecast } from "../src/demo/data-tools/weather";
import { getWikipediaSummary, trimSentences } from "../src/demo/data-tools/wikipedia";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** A fake network: answers by URL substring and counts the calls. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    for (const [needle, respond] of Object.entries(routes)) {
      if (url.includes(needle)) return respond();
    }
    return new Response("nope", { status: 404 });
  };
  return { fetcher, calls };
}

beforeEach(() => clearHttpCache());

describe("getJson", () => {
  it("caches a URL for a few minutes, then fetches again", async () => {
    const { fetcher, calls } = fakeFetch({ "/x": () => ok({ a: 1 }) });
    let t = 1000;
    const http = { fetcher, now: () => t };
    await getJson("https://api.example/x", "The service", http);
    await getJson("https://api.example/x", "The service", http);
    expect(calls).toHaveLength(1);
    t += 6 * 60 * 1000;
    await getJson("https://api.example/x", "The service", http);
    expect(calls).toHaveLength(2);
  });

  it("times out and says which step did", async () => {
    const fetcher = (_: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    await expect(getJson("https://api.example/slow", "The slow service", { fetcher, timeoutMs: 10 })).rejects.toThrow(
      "The slow service timed out",
    );
  });

  it("tells a missing thing from a broken service", async () => {
    const { fetcher } = fakeFetch({ "/down": () => new Response("x", { status: 503 }), "/bad": () => new Response("<html>", { status: 200 }) });
    await expect(getJson("https://a.example/missing", "S", { fetcher })).rejects.toMatchObject({ kind: "not-found" });
    await expect(getJson("https://a.example/down", "S", { fetcher })).rejects.toMatchObject({ kind: "unavailable" });
    await expect(getJson("https://a.example/bad", "S", { fetcher })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rounds", () => {
    expect(round(0.891736, 4)).toBe(0.8917);
    expect(round(158.184)).toBe(158.18);
  });
});

describe("weather", () => {
  const routes = {
    "geocoding-api": () => ok({ results: [{ name: "Kyoto", admin1: "Kyoto", country: "Japan", latitude: 35.02, longitude: 135.75 }] }),
    "api.open-meteo.com": () =>
      ok({
        daily: {
          time: ["2026-11-11", "2026-11-12"],
          weather_code: [1, 63],
          temperature_2m_max: [17.5, 19.4],
          temperature_2m_min: [6.9, 9.8],
          precipitation_probability_max: [0, null],
        },
      }),
  };

  it("returns a small, labelled, pre-rounded forecast", async () => {
    const { fetcher, calls } = fakeFetch(routes);
    const out: any = await getWeatherForecast.handler({ place: "Kyoto", days: 2 }, { fetcher });
    expect(out.place).toBe("Kyoto, Kyoto, Japan");
    expect(out.days).toEqual([
      { date: "2026-11-11", weekday: "Wed", conditions: "Mostly clear", highC: 18, lowC: 7, chanceOfRainPct: 0 },
      { date: "2026-11-12", weekday: "Thu", conditions: "Rain", highC: 19, lowC: 10, chanceOfRainPct: null },
    ]);
    expect(out.note).toContain("Open-Meteo");
    expect(calls[1]).toContain("forecast_days=2");
  });

  it("clamps the number of days", async () => {
    const { fetcher, calls } = fakeFetch(routes);
    await getWeatherForecast.handler({ place: "Kyoto", days: 400 }, { fetcher });
    expect(calls[1]).toContain("forecast_days=10");
  });

  it("reports an unknown place as not found", async () => {
    const { fetcher } = fakeFetch({ "geocoding-api": () => ok({}) });
    await expect(getWeatherForecast.handler({ place: "Zzyzx-nowhere" }, { fetcher })).rejects.toMatchObject({
      kind: "not-found",
      message: 'No place found for "Zzyzx-nowhere"',
    });
  });

  it("names weather codes", () => {
    expect(describeWeatherCode(0)).toBe("Clear");
    expect(describeWeatherCode(95)).toBe("Thunderstorm");
    expect(describeWeatherCode(1234)).toBe("Unknown");
  });
});

describe("exchange rates", () => {
  it("labels each rate and rounds by magnitude", async () => {
    const { fetcher, calls } = fakeFetch({ "/latest": () => ok({ base: "USD", date: "2026-11-10", rates: { EUR: 0.891736, JPY: 158.184 } }) });
    const out: any = await getExchangeRates.handler({ base: "usd", symbols: ["eur", "jpy"] }, { fetcher });
    expect(calls[0]).toContain("base=USD&symbols=EUR,JPY");
    expect(out.rates).toEqual([
      { currency: "EUR", rate: 0.8917, meaning: "1 USD = 0.8917 EUR" },
      { currency: "JPY", rate: 158.18, meaning: "1 USD = 158.18 JPY" },
    ]);
    expect(out.asOf).toBe("2026-11-10");
  });

  it("rejects something that is not a currency code before calling out", async () => {
    const { fetcher, calls } = fakeFetch({});
    await expect(getExchangeRates.handler({ base: "dollars", symbols: ["EUR"] }, { fetcher })).rejects.toMatchObject({ kind: "not-found" });
    expect(calls).toHaveLength(0);
  });

  it("summarises a history and does the arithmetic in code", async () => {
    const rates: Record<string, { EUR: number }> = {};
    for (let d = 1; d <= 28; d++) rates[`2026-10-${String(d).padStart(2, "0")}`] = { EUR: 0.9 - d * 0.001 };
    const { fetcher, calls } = fakeFetch({ "frankfurter": () => ok({ base: "USD", rates }) });
    const now = () => Date.parse("2026-11-10T12:00:00Z");
    const out: any = await getExchangeRateHistory.handler({ base: "USD", symbol: "EUR", days: 30 }, { fetcher, now });
    expect(calls[0]).toContain("/2026-10-11..2026-11-10?base=USD&symbols=EUR");
    expect(out.first).toBe(0.899);
    expect(out.last).toBe(0.872);
    expect(out.changePct).toBe(-3);
    expect(out.low).toBe(0.872);
    expect(out.high).toBe(0.899);
    expect(out.points[out.points.length - 1].date).toBe("2026-10-28");
    expect(out.points.length).toBeLessThanOrEqual(30);
  });

  it("thins a long series but keeps the last day", async () => {
    const rates: Record<string, { EUR: number }> = {};
    for (let i = 0; i < 200; i++) rates[new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)] = { EUR: 0.9 };
    const { fetcher } = fakeFetch({ "frankfurter": () => ok({ base: "USD", rates }) });
    const out: any = await getExchangeRateHistory.handler({ base: "USD", symbol: "EUR", days: 365 }, { fetcher });
    expect(out.points.length).toBeLessThanOrEqual(31);
    expect(out.points[out.points.length - 1].date).toBe(out.to);
    expect(out.note).toContain("of 200 days shown");
  });
});

describe("wikipedia", () => {
  it("returns a trimmed summary with its link and image", async () => {
    const { fetcher, calls } = fakeFetch({
      "/page/summary/": () =>
        ok({ title: "Kyoto", description: "City in Japan", extract: "Kyoto is a city. ".repeat(60), thumbnail: { source: "https://upload.wikimedia.org/k.jpg" }, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Kyoto" } } }),
    });
    const out: any = await getWikipediaSummary.handler({ title: "Kyoto city" }, { fetcher });
    expect(calls[0]).toContain("/page/summary/Kyoto_city");
    expect(out.summary.length).toBeLessThanOrEqual(600);
    expect(out.summary.endsWith(".")).toBe(true);
    expect(out.url).toBe("https://en.wikipedia.org/wiki/Kyoto");
    expect(out.imageUrl).toContain("upload.wikimedia.org");
  });

  it("asks for a more specific title on a disambiguation page", async () => {
    const { fetcher } = fakeFetch({ "/page/summary/": () => ok({ type: "disambiguation", title: "Mercury", extract: "x" }) });
    await expect(getWikipediaSummary.handler({ title: "Mercury" }, { fetcher })).rejects.toThrow("ambiguous");
  });

  it("trims to whole sentences", () => {
    expect(trimSentences("One. Two. Three is longer.", 12)).toBe("One. Two.");
    expect(trimSentences("Short.", 100)).toBe("Short.");
  });
});

describe("runDataTool never throws", () => {
  const boom: DataTool = {
    definition: { name: "get_boom", description: "", input_schema: { type: "object", properties: {} } },
    handler: async () => {
      throw new TypeError("cannot read properties of undefined");
    },
  };
  const down: DataTool = {
    definition: { name: "get_down", description: "", input_schema: { type: "object", properties: {} } },
    handler: async () => {
      throw new DataError("The service returned HTTP 503", "unavailable");
    },
  };

  it("turns a service failure into data with the no-substitute instruction", async () => {
    const out = await runDataTool("get_down", {}, {}, [down]);
    expect(out).toEqual({
      ok: false,
      result: { error: "get_down is temporarily unavailable: The service returned HTTP 503", instruction: NO_SUBSTITUTE },
    });
  });

  it("turns a bug in a handler into data too, without leaking the stack", async () => {
    const out = await runDataTool("get_boom", {}, {}, [boom]);
    expect(out.ok).toBe(false);
    expect(out.result).toEqual({ error: "get_boom failed unexpectedly.", instruction: NO_SUBSTITUTE });
  });

  it("passes a not-found message through as written", async () => {
    const { fetcher } = fakeFetch({ "geocoding-api": () => ok({}) });
    const out = await runDataTool("get_weather_forecast", { place: "Nowhere" }, { fetcher });
    expect(out.result).toEqual({ error: 'No place found for "Nowhere"', instruction: NO_SUBSTITUTE });
  });

  it("answers for a tool that does not exist", async () => {
    const out = await runDataTool("get_stock_price", {});
    expect(out.ok).toBe(false);
  });

  it("registers tools with unique get_ names and closed schemas", () => {
    const names = DATA_TOOLS.map((t) => t.definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of DATA_TOOLS) {
      expect(t.definition.name).toMatch(/^get_/);
      expect(t.definition.input_schema.additionalProperties).toBe(false);
      expect(isDataTool(t.definition.name)).toBe(true);
    }
    expect(isDataTool("sl_card")).toBe(false);
  });
});
