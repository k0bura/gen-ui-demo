# gen-ui-demo

A two-stage Claude tool-use pipeline that composes UI from a small
web-component library — without ever generating code.

**Live:** [gen-ui.jeffmills.dev](https://gen-ui.jeffmills.dev)
**Context:** [jeffmills.dev/projects/gen-ui-demo](https://jeffmills.dev/projects/gen-ui-demo)

## What it is

Type a prompt. Two Claude calls in series:

1. **Stage 1 — Component selection.** The model receives a tool schema
   describing a handful of components (text, list, table, chart,
   accordion) and returns structured `tool_use` blocks that pick
   components and fill them with content. No JSX, no HTML. Typed JSON
   constrained by the schema.

2. **Stage 2 — Layout composition.** A second call receives the
   selected components plus a layout-tool schema. It returns a nested
   layout tree that groups components into rows, columns, and stacks.
   Constrained to a small layout grammar.

3. **Deterministic render.** The application walks the layout tree and
   instantiates web components. Standards-based custom elements — the
   same components work in Vue, Angular, AEM, or vanilla HTML.

The model never writes code. The application code does the rendering.
That's the whole point.

## Stack

- **Astro 6** — static site generator + island architecture
- **Svelte 5** — the demo UI shell
- **Lit 3** — the framework-agnostic component library (`jm-*` web components)
- **Tailwind v4** — utility CSS
- **Cloudflare Pages** — hosting + Pages Functions for the API
- **Anthropic SDK** — the live pipeline (mocks ship by default)

## Run it locally

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:4321`. The `/api/generate` endpoint
is served by Cloudflare Pages in production — Astro's dev server does not
run Pages Functions, so `npm run dev` alone won't be able to hit the live
Anthropic pipeline.

### Two ways to exercise the pipeline locally

**Offline mocks** — flip `USE_MOCKS = true` in `src/demo/api-client.ts`. The
demo will short-circuit `/api/generate` and return a canned response. Good
for UI iteration without an API key.

**Live API via wrangler** — to exercise the real two-stage pipeline locally:

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars and paste your ANTHROPIC_API_KEY
npm run build
npx wrangler pages dev dist --compatibility-date=2026-05-22
```

`wrangler pages dev` serves both the built static site and the
`functions/api/generate.ts` endpoint, picking up secrets from `.dev.vars`.

### Production secrets

In the Cloudflare Pages dashboard for this project:
**Settings → Environment variables → Production →** add
`ANTHROPIC_API_KEY` (encrypted). Set a monthly budget cap on the Anthropic
console as a backstop.

## Project layout

```
src/
├── components/       Svelte demo UI (PromptForm, GenUI, LayoutTree, ...)
├── demo/             Pipeline plumbing (api-client, mocks, prompts, tools, types)
├── lib/ds/           The Lit web-component library (jm-text, jm-list, ...)
├── layouts/          Astro App layout (header, footer, theme)
├── pages/            index.astro — the standalone app
└── styles/           Slate + blue design tokens

functions/api/        Cloudflare Pages Functions (the API endpoint)
```

## What this is meant to show

This isn't a chatbot or a code generator. It's an architectural pattern:
**LLM composes, app renders**. The interesting bit is what the LLM is
*prevented* from doing. By forcing all model output through tool
schemas, the output is structured data the application can trust — not
code the application has to evaluate.

Background on the pattern lives in this writing piece:
[Generating UI Without Generating Code](https://jeffmills.dev/writing/gen-ui-with-claude-tool-use).

## License

MIT. Built by [Jeff Mills](https://jeffmills.dev).
