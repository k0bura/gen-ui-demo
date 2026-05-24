// Cloudflare Pages Function — POST /api/generate
// Placeholder. Real implementation lands when we wire the Anthropic SDK.

export const onRequestPost: PagesFunction = async () => {
  return new Response(
    JSON.stringify({ error: "Not implemented yet" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
};
