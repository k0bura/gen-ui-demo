// Server-side check for Cloudflare Turnstile.
//
// The Pages Function calls this before it spends anything on a model call.
// It fails closed: with no secret configured, only requests to a local dev
// host get through, so a deploy that forgot its secret answers 503 instead
// of running an open, paid endpoint.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface TurnstileCheck {
  ok: boolean;
  /** HTTP status to answer with when `ok` is false. */
  status?: number;
  error?: string;
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function checkTurnstile(opts: {
  secret: string | undefined;
  token: unknown;
  hostname: string;
  remoteIp?: string | null;
  fetcher?: Fetcher;
}): Promise<TurnstileCheck> {
  const { secret, token, hostname, remoteIp } = opts;
  const fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));

  if (!secret) {
    if (isLocalHost(hostname)) return { ok: true };
    return { ok: false, status: 503, error: "Bot protection is not configured on this deployment." };
  }

  if (typeof token !== "string" || !token || token.length > 2048) {
    return { ok: false, status: 403, error: "Missing verification token. Reload the page and try again." };
  }

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);

  let outcome: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetcher(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    });
    outcome = (await res.json()) as typeof outcome;
  } catch {
    // Cloudflare unreachable: refuse rather than run unprotected.
    return { ok: false, status: 503, error: "Verification service is unavailable. Try again shortly." };
  }

  if (outcome.success === true) return { ok: true };
  return { ok: false, status: 403, error: "Verification failed. Reload the page and try again." };
}
