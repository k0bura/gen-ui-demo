// Shared fetch helper for the data tools: a hard timeout, a short cache,
// and errors that say which step failed.

export class DataError extends Error {
  constructor(
    message: string,
    /** "not-found" is the caller's input; "unavailable" is the service. */
    readonly kind: "not-found" | "unavailable",
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

// Module scope: lives as long as the Worker isolate does. One prompt often
// asks about the same place or currency several times, and follow-ups do
// too, so even a short-lived cache earns its keep.
const cache = new Map<string, { at: number; value: unknown }>();

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  fetcher?: Fetcher;
  now?: () => number;
  timeoutMs?: number;
}

export function clearHttpCache(): void {
  cache.clear();
}

export async function getJson<T>(url: string, step: string, opts: HttpOptions = {}): Promise<T> {
  const now = opts.now ?? Date.now;
  const hit = cache.get(url);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetcher ?? fetch)(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "gen-ui-demo/0.4 (public demo)" },
    });
  } catch (e) {
    const why = controller.signal.aborted ? "timed out" : e instanceof Error ? e.message : String(e);
    throw new DataError(`${step} ${why}`, "unavailable");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) throw new DataError(`${step} found nothing`, "not-found");
  if (!res.ok) throw new DataError(`${step} returned HTTP ${res.status}`, "unavailable");

  let value: T;
  try {
    value = (await res.json()) as T;
  } catch {
    throw new DataError(`${step} returned something that is not JSON`, "unavailable");
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(url, { at: now(), value });
  return value;
}

export const round = (n: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
