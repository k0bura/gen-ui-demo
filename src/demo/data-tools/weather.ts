// Weather from Open-Meteo (open-meteo.com). No key. Two calls: place name
// to coordinates, then the daily forecast.

import { DataError, getJson, round, type HttpOptions } from "./http";
import type { DataTool } from "./types";

// WMO weather interpretation codes, as Open-Meteo documents them.
const WMO: Array<[number[], string]> = [
  [[0], "Clear"],
  [[1], "Mostly clear"],
  [[2], "Partly cloudy"],
  [[3], "Overcast"],
  [[45, 48], "Fog"],
  [[51, 53, 55, 56, 57], "Drizzle"],
  [[61, 63, 65, 66, 67], "Rain"],
  [[71, 73, 75, 77], "Snow"],
  [[80, 81, 82], "Rain showers"],
  [[85, 86], "Snow showers"],
  [[95, 96, 99], "Thunderstorm"],
];

export const describeWeatherCode = (code: number): string =>
  WMO.find(([codes]) => codes.includes(code))?.[1] ?? "Unknown";

interface GeoResponse {
  results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number; timezone?: string }>;
}

interface ForecastResponse {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: Array<number | null>;
  };
}

export interface Place {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export async function geocode(place: string, http: HttpOptions): Promise<Place> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const geo = await getJson<GeoResponse>(url, "The place lookup", http);
  const hit = geo.results?.[0];
  if (!hit) throw new DataError(`No place found for "${place}"`, "not-found");
  return { name: hit.name, region: hit.admin1, country: hit.country, latitude: hit.latitude, longitude: hit.longitude };
}

const weekday = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

export const getWeatherForecast: DataTool = {
  definition: {
    name: "get_weather_forecast",
    description:
      "Daily weather forecast for a city or town: high, low, conditions and chance of rain for each day. Use the plain place name (e.g. Kyoto, Lisbon, Philadelphia). Temperatures are in Celsius.",
    input_schema: {
      type: "object",
      properties: {
        place: { type: "string", description: "City or town name, e.g. Kyoto" },
        days: { type: "number", description: "How many days, 1 to 10. Defaults to 7." },
      },
      required: ["place"],
      additionalProperties: false,
    },
  },
  handler: async (input, http) => {
    const place = await geocode(String(input.place ?? ""), http);
    const days = Math.max(1, Math.min(10, Math.round(Number(input.days) || 7)));
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=${days}`;
    const res = await getJson<ForecastResponse>(url, "The forecast service", http);
    const d = res.daily;
    if (!d?.time?.length) throw new DataError("The forecast service returned no days", "unavailable");
    return {
      place: [place.name, place.region, place.country].filter(Boolean).join(", "),
      unit: "°C",
      days: d.time.map((date, i) => ({
        date,
        weekday: weekday(date),
        conditions: describeWeatherCode(d.weather_code[i]),
        highC: round(d.temperature_2m_max[i], 0),
        lowC: round(d.temperature_2m_min[i], 0),
        chanceOfRainPct: d.precipitation_probability_max[i] ?? null,
      })),
      note: "Forecast from Open-Meteo. Temperatures are rounded to whole degrees Celsius.",
    };
  },
};
