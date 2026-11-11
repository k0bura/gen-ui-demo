# gen-ui-demo

A Claude tool-use pipeline that fetches live data and composes a page from
a web-component library, with the layout rules written once and enforced in
code. The model never writes code, CSS or sizes.

**Live:** [gen-ui.jeffmills.dev](https://gen-ui.jeffmills.dev)
**Context:** [jeffmills.dev/projects/gen-ui-demo](https://jeffmills.dev/projects/gen-ui-demo)

## What it is

Type a prompt. The server runs four model calls with plain code between
them:

1. **Data, then components.** A tool-calling loop. The model calls data
   tools (weather, exchange rates, Wikipedia summaries) and the server
   returns small, flat, labelled, pre-rounded results. Then it calls one
   tool per component. Component tools are never executed: the call is the
   output. A failed data call comes back to the model as data, with an
   instruction to say what is missing and not to fill the gap from memory.

2. **Structure and roles.** A second model decides reading order, which
   components belong together, and what each piece of text is (`card-title`,
   `stat-value`, `body`...). It never chooses a size. If its answer is
   missing, malformed or throws, the first stage's list passes through. If
   it changes a figure in a component, that component keeps its original
   text.

3. **Layout.** A third, cheaper model sees one summary line per component
   (tag, group, a few density facts, a computed min-width), never the
   markup, and arranges them with six row patterns. If it returns nothing
   usable, the components are stacked.

4. **Follow-ups.** A small call suggests three next prompts. If it fails,
   there are none. It never fails the request.

Between and after those calls, code does the part that has to be right:

- **normalize** cleans the markup (no scripts, styles, inline styles,
  invented classes or attributes, unknown elements, or images from hosts
  that are not allowlisted) and fixes structure (alerts always open,
  paragraphs for `<br><br>`, missing roles inferred).
- **layout repair** makes any tree obey the spec: every component exactly
  once, only the six row patterns, nothing below its min-width, a group's
  components together and one group per row.
- **typeset** turns each text role into a type style, stepping down a size
  ladder until the text fits the slot it landed in.

Then the browser walks the layout tree and instantiates the components.

## The layout spec

`src/demo/layout-spec.ts` is one data file: the grid, the row patterns,
per-component min-widths, grouping rules, the role-to-type-style table and
the size ladders. Three things are generated from it:

- the layout and role rules in the system prompts, and the `pattern` enum
  in the layout tool (`src/demo/pipeline/spec-prompt.ts`)
- the validators and the repair pass (`layout-repair.ts`, `typeset.ts`)
- the CSS for the row patterns, gaps and type classes (`specToCss`)

So a rule the model is told and a rule the code enforces are the same
rule. The prompt asks for the pattern; the code guarantees it when the
prompt is ignored. A test changes the spec and checks that the prompt, the
tool schema, the CSS and the repair all follow.

**Design source.** The grid, spacing and type scale follow
[IBM Carbon](https://carbondesignsystem.com): the 2x Grid at the `lg`
breakpoint (16 columns, 1056px, 32px gutter), the spacing scale, and the
productive type tokens. Carbon's Figma kit,
[(v11) Carbon Design System](https://www.figma.com/community/file/1157761560874207208),
is free on Figma Community. The components are
[Shoelace](https://shoelace.style), so fonts and colours are the demo's
own. Carbon's own web components were considered and not used: their
manifest is in an older analyzer format with unresolved enum types and no
default slots listed for most elements, which makes it a poor source for
generated tool schemas.

## Data tools

Keyless public APIs, called from the Pages Function:

| Tool | Source |
|------|--------|
| `get_weather_forecast` | [Open-Meteo](https://open-meteo.com) geocoding and forecast |
| `get_exchange_rates`, `get_exchange_rate_history` | [Frankfurter](https://frankfurter.dev) (ECB reference rates) |
| `get_wikipedia_summary` | Wikipedia REST API |

Each call has an 8 second abort timeout and a 5 minute in-memory cache.
Arithmetic (change, range, rounding) is done in code so the model does
none. To add a tool, export a `DataTool` from `src/demo/data-tools/` and
add it to the array in `registry.ts`.

## Stack

- **Astro 6** and **Svelte 5** for the page and the demo shell
- **Shoelace** for the components; their tool schemas are generated from
  its Custom Elements Manifest at build time
- **Chart.js** for the one hand-written chart tool
- **Cloudflare Pages** for hosting, with a Pages Function for the API
- **Anthropic Messages API** with prompt caching on the tools, the system
  prompts and each round of the tool loop
- **Vitest** for the pipeline's pure code

## Run it locally

```bash
npm install
npm test          # unit tests for the code passes, the spec and the pipeline
npm run dev       # frontend at http://localhost:4321
```

Astro's dev server does not run Pages Functions, so `npm run dev` alone
cannot reach the live pipeline. Two options:

**Mock mode.** Open `http://localhost:4321/?mock`. Every prompt returns one
canned answer, written with mistakes on purpose (an inline style, an
invented class, a closed alert, a table squeezed into a narrow slot, a
component missing from the layout) and then run through the real
normalize, repair and typeset passes. "Show what the pipeline did" lists
what was fixed. No API key needed.

**Live API via wrangler.**

```bash
cp .dev.vars.example .dev.vars   # paste your ANTHROPIC_API_KEY
npm run dev:functions            # builds, then serves dist/ and functions/
# open http://localhost:8788
```

Re-run `npm run build` in another terminal to pick up frontend changes.

### Production secrets

In the Cloudflare Pages dashboard: **Settings → Environment variables →
Production →** add `ANTHROPIC_API_KEY` (encrypted). Set a monthly budget
cap in the Anthropic console as a backstop.

### Bot protection (Cloudflare Turnstile)

`/api/generate` spends real money per call, so it is gated by Turnstile.
The browser asks for a fresh token before every request (tokens are
single-use) and the function verifies it with Cloudflare before any model
call.

1. In the Cloudflare dashboard: **Turnstile → Add widget**, with the
   demo's hostname. Managed mode is fine.
2. Put the widget's **site key** in `wrangler.toml` under `[vars]` as
   `TURNSTILE_SITE_KEY`. It is public, and the page reads it at runtime
   from `/api/config`. (This project's variables are managed by
   `wrangler.toml`, so plain variables cannot be added in the dashboard.)
3. Add the widget's **secret key** as a secret named
   `TURNSTILE_SECRET_KEY`: in the Pages project under **Settings →
   Variables and Secrets → Add → Secret**, or with
   `npx wrangler pages secret put TURNSTILE_SECRET_KEY`.
4. Deploy.

The check fails closed. With no secret, only requests to `localhost` get
through; any deployed host answers 503 rather than run an open endpoint.
Local development needs neither variable. To exercise the flow locally,
use Cloudflare's always-pass test keys (see `.dev.vars.example`).

### Cost and models

One prompt is four to seven model calls: two or more rounds of the
component stage, then structure, layout and follow-ups. Limits: 5 tool
rounds, 8 data calls, 25 components, 2000 characters of prompt, 6 turns of
history.

Defaults are `claude-opus-4-6` for components, `claude-sonnet-4-6` for
structure and `claude-haiku-4-5` for layout and follow-ups. Override any
of them with `MODEL_COMPONENTS`, `MODEL_STRUCTURE`, `MODEL_LAYOUT` or
`MODEL_FOLLOW_UPS`. These models are a deliberate choice: every stage uses
forced tool use and a low temperature, and the newest model generations
reject both. Moving to them means `tool_choice: "auto"` with strict tools
and a prompt that names the tool.

There is no abuse protection on `/api/generate` beyond the limits above
and the Anthropic budget cap.

## Project layout

```
src/
├── components/         Svelte: demo shell, layout tree, component, chart and table renderers
├── demo/
│   ├── layout-spec.ts  the layout spec (single source of truth)
│   ├── manifest.ts     Shoelace manifest -> component tool schemas
│   ├── tools.ts        every tool handed to a model
│   ├── prompts.ts      system prompts (layout rules spliced in from the spec)
│   ├── data-tools/     weather, exchange rates, Wikipedia, registry
│   ├── pipeline/       run, normalize, density, layout-repair, typeset, markup, spec-prompt
│   ├── mocks.ts        the canned answer for mock mode
│   └── api-client.ts
├── layouts/, pages/, styles/
functions/api/          the Pages Function: Anthropic transport and validation
test/                   Vitest
```

## Known gaps

- **Not a full HTML sanitiser.** `normalize` is an allowlist pass written
  for the markup a model puts in a component slot. It is tested against
  scripts, styles, event handlers, unsafe links and off-list images, but
  it is a tag-level scanner, not a parser.
- **No streaming.** The response arrives when every stage is done. The
  progress messages are timers.
- **Fit is estimated.** Typesetting estimates text width from character
  count and an average glyph width against a 1056px canvas. It does not
  measure, and does not re-fit when the window is resized.
- **A group split across sections stays split.** Repair joins a group's
  rows only within one parent.
- **No tests for the Svelte components.** The tests cover the pipeline.

## What this is meant to show

**The model composes, the app renders, and the rules live in one place.**
The model's output is forced through tool schemas, so it is structured
data the application can check. What matters most is checked by code: the
figures a second model may not change, the layout it may not break, the
sizes it never gets to pick.

Background: [Generating UI Without Generating Code](https://jeffmills.dev/writing/gen-ui-with-claude-tool-use).

## License

MIT. Built by [Jeff Mills](https://jeffmills.dev).
