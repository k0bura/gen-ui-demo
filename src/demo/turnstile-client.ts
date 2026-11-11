// Browser side of Cloudflare Turnstile.
//
// A token is single-use, so every request asks for a fresh one. The widget
// is rendered once in "execute" mode and stays invisible unless Cloudflare
// decides the visitor needs an interactive challenge.

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 60_000;

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      execution: "execute";
      appearance: "interaction-only";
      theme: "dark";
      callback: (token: string) => void;
      "error-callback": (code?: string) => void;
      "timeout-callback": () => void;
    },
  ): string;
  execute(id: string): void;
  reset(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let siteKeyLoading: Promise<string> | null = null;

/**
 * The public site key, read once from /api/config. Empty means Turnstile is
 * off: no key is configured, or there is no function to ask (plain
 * `astro dev`). The server still enforces its own check either way.
 */
function siteKey(): Promise<string> {
  siteKeyLoading ??= fetch("/api/config")
    .then((res) => (res.ok ? (res.json() as Promise<{ turnstileSiteKey?: string }>) : {}))
    .then((cfg: { turnstileSiteKey?: string }) => cfg.turnstileSiteKey ?? "")
    .catch(() => "");
  return siteKeyLoading;
}

let scriptLoading: Promise<void> | null = null;
let widgetId: string | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function loadScript(): Promise<void> {
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoading = null;
      reject(new Error("Could not load the verification script."));
    };
    document.head.appendChild(s);
  });
  return scriptLoading;
}

function settle(fn: (p: NonNullable<typeof pending>) => void) {
  const p = pending;
  pending = null;
  if (p) fn(p);
}

/**
 * Resolves to a fresh token, or to null when no site key is configured
 * (local development). Rejects when verification cannot be completed.
 */
export async function getTurnstileToken(container: HTMLElement | null): Promise<string | null> {
  const sitekey = await siteKey();
  if (!sitekey) return null;
  if (!container) throw new Error("Verification widget is not ready.");

  await loadScript();
  const api = window.turnstile;
  if (!api) throw new Error("Verification script did not initialise.");

  return new Promise<string>((resolve, reject) => {
    settle((p) => p.reject(new Error("Superseded by a newer request.")));
    pending = { resolve, reject };
    const timer = setTimeout(
      () => settle((p) => p.reject(new Error("Verification timed out. Try again."))),
      TOKEN_TIMEOUT_MS,
    );
    const done = (fn: (p: NonNullable<typeof pending>) => void) => {
      clearTimeout(timer);
      settle(fn);
    };

    if (widgetId === null) {
      widgetId = api.render(container, {
        sitekey,
        execution: "execute",
        appearance: "interaction-only",
        theme: "dark",
        callback: (token) => done((p) => p.resolve(token)),
        "error-callback": () => done((p) => p.reject(new Error("Verification failed. Reload and try again."))),
        "timeout-callback": () => done((p) => p.reject(new Error("Verification expired. Try again."))),
      });
    } else {
      api.reset(widgetId);
    }
    api.execute(widgetId);
  });
}
