// Deterministic cleanup of what the model emitted.
//
// Runs after the component stage and again after the structure stage. It
// is idempotent: normalize(normalize(x)) equals normalize(x). The prompts
// ask for all of this; this file is what makes it true when a prompt is
// ignored.

import {
  CHART_TAG,
  TABLE_TAG,
  type ChartData,
  type ComponentInstance,
  type TableData,
} from "../types";
import { sanitizeHtml, stripTags, rewriteTags, type SanitizeOptions } from "./markup";

export interface NormalizeContext {
  /** Attribute names each library tag accepts, from the manifest. */
  attributesByTag: ReadonlyMap<string, ReadonlySet<string>>;
  sanitize: SanitizeOptions;
  roles: ReadonlySet<string>;
  maxComponents: number;
}

export interface NormalizeResult {
  components: ComponentInstance[];
  /** What was changed, for the trace the UI shows. */
  fixes: string[];
}

const CHART_TYPES = new Set(["line", "bar", "pie", "doughnut"]);
const MAX_INLINE_BADGES = 3;

// ---------------------------------------------------------------------------
// Payload validation for the hand-written tools
// ---------------------------------------------------------------------------

export function cleanChart(input: unknown): ChartData | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const chartType = CHART_TYPES.has(String(o.chartType)) ? (o.chartType as ChartData["chartType"]) : "bar";
  const labels = Array.isArray(o.labels) ? o.labels.map((l) => String(l)).slice(0, 60) : [];
  const datasets = (Array.isArray(o.datasets) ? o.datasets : [])
    .map((d) => {
      const ds = (d ?? {}) as Record<string, unknown>;
      const data = (Array.isArray(ds.data) ? ds.data : [])
        .map((n) => (typeof n === "number" ? n : Number(n)))
        .slice(0, labels.length);
      return { label: String(ds.label ?? ""), data };
    })
    .filter((d) => d.data.length > 0 && d.data.every((n) => Number.isFinite(n)))
    .slice(0, 6);
  if (labels.length === 0 || datasets.length === 0) return null;
  const chart: ChartData = { kind: "chart", chartType, labels, datasets };
  if (typeof o.title === "string" && o.title.trim()) chart.title = stripTags(o.title).slice(0, 120);
  if (typeof o.unit === "string" && o.unit.trim()) chart.unit = stripTags(o.unit).slice(0, 16);
  return chart;
}

export function cleanTable(input: unknown): TableData | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const columns = Array.isArray(o.columns) ? o.columns.map((c) => stripTags(String(c))).slice(0, 8) : [];
  const rows = (Array.isArray(o.rows) ? o.rows : [])
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) =>
      r.slice(0, columns.length).map((cell) =>
        typeof cell === "number" && Number.isFinite(cell) ? cell : stripTags(String(cell ?? "")),
      ),
    )
    .filter((r) => r.length > 0)
    .slice(0, 40);
  if (columns.length === 0 || rows.length === 0) return null;
  const table: TableData = { kind: "table", columns, rows };
  if (typeof o.title === "string" && o.title.trim()) table.title = stripTags(o.title).slice(0, 120);
  if (typeof o.caption === "string" && o.caption.trim()) table.caption = stripTags(o.caption).slice(0, 200);
  return table;
}

// ---------------------------------------------------------------------------
// Markup-level fixes
// ---------------------------------------------------------------------------

const BLOCK_RE = /<\s*(p|h[1-6]|ul|ol|div|section|article|table|blockquote)\b/i;

/** `a<br><br>b` is a model's stand-in for two paragraphs. Make them real. */
function paragraphs(html: string): string {
  const trimmed = html.trim();
  if (BLOCK_RE.test(trimmed)) return trimmed;
  if (!/<\s*br\s*\/?>\s*<\s*br\s*\/?>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/(?:<\s*br\s*\/?>\s*){2,}/i)
    .map((p) => p.replace(/<\s*br\s*\/?>/gi, " ").trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

/** The page owns h1 and h2. Inside a component the top level is h3. */
function demoteHeadings(html: string): string {
  return rewriteTags(html, (tag) => {
    if (tag.name === "h1" || tag.name === "h2") return { ...tag, name: "h3" };
    return undefined;
  });
}

/** Keeps the first few inline badges and tags, removes the rest whole. */
function capBadges(html: string): string {
  let seen = 0;
  return html.replace(/<(sl-badge|sl-tag)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (whole) =>
    ++seen > MAX_INLINE_BADGES ? "" : whole,
  );
}

/** Drops data-role values that are not in the spec, and fills in obvious ones. */
function fixRoles(html: string, roles: ReadonlySet<string>, fallbackRole: string): string {
  let out = rewriteTags(html, (tag) => {
    if (tag.closing) return undefined;
    const role = tag.attrs.find((a) => a.name === "data-role");
    if (role && !roles.has(role.value ?? "")) {
      return { ...tag, attrs: tag.attrs.filter((a) => a.name !== "data-role") };
    }
    if (role) return undefined;
    if (tag.name === "p" || tag.name === "li") {
      return { ...tag, attrs: [...tag.attrs, { name: "data-role", value: "body" }] };
    }
    if (/^h[3-6]$/.test(tag.name)) {
      return { ...tag, attrs: [...tag.attrs, { name: "data-role", value: "card-title" }] };
    }
    return undefined;
  });
  // Bare text with no element around it gets one, so it has a role too.
  if (out.trim() && !/<[a-zA-Z]/.test(out)) {
    const tag = fallbackRole === "body" ? "p" : "span";
    out = `<${tag} data-role="${fallbackRole}">${out.trim()}</${tag}>`;
  }
  return out;
}

function cleanMarkup(html: string, ctx: NormalizeContext, fallbackRole: string): string {
  let out = sanitizeHtml(html, ctx.sanitize);
  out = paragraphs(out);
  out = demoteHeadings(out);
  out = capBadges(out);
  out = fixRoles(out, ctx.roles, fallbackRole);
  return out.trim();
}

// ---------------------------------------------------------------------------
// Component-level fixes
// ---------------------------------------------------------------------------

const TITLE_SLOTS: Record<string, string> = { "sl-card": "header", "sl-details": "summary" };

function hasVisibleContent(c: ComponentInstance): boolean {
  if (c.data) return true;
  if (c.content && (stripTags(c.content) || /<(img|sl-)/i.test(c.content))) return true;
  return Object.values(c.slots ?? {}).some((s) => stripTags(s) || /<(img|sl-)/i.test(s));
}

function isTitleOnlyCard(c: ComponentInstance): boolean {
  if (c.tagName !== "sl-card") return false;
  if (c.content && stripTags(c.content)) return false;
  const slots = Object.entries(c.slots ?? {}).filter(([, v]) => stripTags(v));
  return slots.length === 1 && slots[0][0] === "header";
}

export function normalizeComponents(
  input: ComponentInstance[],
  ctx: NormalizeContext,
): NormalizeResult {
  const fixes: string[] = [];
  const out: ComponentInstance[] = [];

  for (const raw of input) {
    const tag = String(raw.tagName ?? "").toLowerCase();

    if (tag === CHART_TAG || tag === TABLE_TAG) {
      const data = tag === CHART_TAG ? cleanChart(raw.data) : cleanTable(raw.data);
      if (!data) {
        fixes.push(`dropped a ${tag} with no usable data`);
        continue;
      }
      out.push({ id: raw.id, tagName: tag, attributes: {}, data, ...(raw.group ? { group: raw.group } : {}) });
      continue;
    }

    const allowed = ctx.attributesByTag.get(tag);
    if (!allowed) {
      fixes.push(`dropped <${tag}>: not a component in the library`);
      continue;
    }

    const attributes: ComponentInstance["attributes"] = {};
    for (const [name, value] of Object.entries(raw.attributes ?? {})) {
      if (!allowed.has(name)) {
        fixes.push(`<${tag}>: removed unknown attribute "${name}"`);
        continue;
      }
      if (["string", "number", "boolean"].includes(typeof value)) attributes[name] = value;
    }

    // An alert without `open` renders nothing, a closable one can be
    // dismissed, and one with a duration hides itself. None of that suits a
    // generated page, so an alert is always open and stays open.
    if (tag === "sl-alert") {
      attributes.open = true;
      delete attributes.closable;
      delete attributes.duration;
    }

    const slots: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw.slots ?? {})) {
      if (typeof value !== "string" || !value.trim()) continue;
      const isTitle = TITLE_SLOTS[tag] === name;
      const cleaned = cleanMarkup(value, ctx, isTitle ? "card-title" : "body");
      if (cleaned) slots[name] = cleaned;
    }

    if (tag === "sl-details" && !slots.summary && !attributes.summary) {
      attributes.summary = "Details";
    }

    const component: ComponentInstance = { id: raw.id, tagName: tag, attributes };
    const content = typeof raw.content === "string" ? cleanMarkup(raw.content, ctx, "body") : "";
    if (content) component.content = content;
    if (Object.keys(slots).length) component.slots = slots;
    if (typeof raw.group === "string" && raw.group.trim()) {
      component.group = raw.group.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (!component.group) delete component.group;
    }

    if (["sl-card", "sl-alert", "sl-details"].includes(tag) && !hasVisibleContent(component)) {
      fixes.push(`dropped an empty <${tag}>`);
      continue;
    }
    out.push(component);
  }

  // A card that is only a title, sitting right before a chart or table with
  // no title of its own, is the model splitting one thing in two. Join them.
  const merged: ComponentInstance[] = [];
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const next = out[i + 1];
    if (isTitleOnlyCard(cur) && next?.data && !next.data.title) {
      next.data = { ...next.data, title: stripTags(cur.slots!.header) };
      if (!next.group && cur.group) next.group = cur.group;
      fixes.push(`merged a title-only card into the ${next.tagName} after it`);
      continue;
    }
    merged.push(cur);
  }

  if (merged.length > ctx.maxComponents) {
    fixes.push(`kept the first ${ctx.maxComponents} of ${merged.length} components`);
  }
  const components = merged.slice(0, ctx.maxComponents).map((c, i) => ({ ...c, id: i }));
  return { components, fixes };
}
