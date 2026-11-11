// Cloudflare Pages Function - GET /api/config
//
// Public, non-secret settings the page needs at runtime. The Turnstile site
// key is public by design, and reading it here (rather than baking it in at
// build time) means it can live in wrangler.toml [vars] next to the rest of
// the project's configuration.

interface Env {
  TURNSTILE_SITE_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  new Response(JSON.stringify({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "" }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
