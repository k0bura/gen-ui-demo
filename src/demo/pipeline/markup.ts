// HTML helpers for the model's slot and content strings.
//
// These run in a Cloudflare Pages Function and in Node tests, so there is
// no DOM. Everything is a small tag-level scanner. It is a cleanup pass
// with an allowlist, not a general-purpose sanitiser: it is written for
// the markup a model emits into a component slot, and the README says so.

export interface Attr {
  name: string;
  /** null for a bare attribute such as `open`. */
  value: string | null;
}

export interface Tag {
  closing: boolean;
  name: string;
  attrs: Attr[];
  selfClosing: boolean;
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = [];
  for (const m of raw.matchAll(ATTR_RE)) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs.push({ name: m[1].toLowerCase(), value: value === undefined ? null : value });
  }
  return attrs;
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderTag(tag: Tag): string {
  if (tag.closing) return `</${tag.name}>`;
  const attrs = tag.attrs
    .map((a) => (a.value === null ? a.name : `${a.name}="${escapeAttr(a.value)}"`))
    .join(" ");
  return `<${tag.name}${attrs ? " " + attrs : ""}${tag.selfClosing ? " /" : ""}>`;
}

/**
 * Calls `fn` for every tag. Return a Tag to rewrite it, null to remove the
 * tag (its children stay), or undefined to leave it as written.
 */
export function rewriteTags(
  html: string,
  fn: (tag: Tag) => Tag | null | undefined,
): string {
  return html.replace(TAG_RE, (whole, slash: string, name: string, rest: string) => {
    const selfClosing = /\/\s*$/.test(rest);
    const tag: Tag = {
      closing: slash === "/",
      name: name.toLowerCase(),
      attrs: slash === "/" ? [] : parseAttrs(selfClosing ? rest.replace(/\/\s*$/, "") : rest),
      selfClosing,
    };
    const out = fn(tag);
    if (out === null) return "";
    if (out === undefined) return whole;
    return renderTag(out);
  });
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Elements removed together with everything inside them.
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"];
// Elements whose tags are removed but whose children are kept.
const DROP_TAG_ONLY = new Set(["link", "meta", "base", "form", "input", "button", "textarea", "select", "html", "head", "body", "font", "center"]);
const URL_ATTRS = new Set(["href", "src"]);

export interface SanitizeOptions {
  /** Class names that may stay. Everything else in a class attribute goes. */
  allowedClasses: ReadonlySet<string>;
  /** Hosts an <img> may load from. Others are removed. */
  allowedImageHosts: readonly string[];
  /** Custom-element tag names that may appear inside slot markup. */
  allowedCustomElements: ReadonlySet<string>;
}

function hostAllowed(url: string, hosts: readonly string[]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

function safeLink(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url.trim());
}

export function sanitizeHtml(html: string, opts: SanitizeOptions): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const name of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}\\s*>`, "gi"), "");
    out = out.replace(new RegExp(`<${name}\\b[^>]*>`, "gi"), "");
  }

  return rewriteTags(out, (tag) => {
    if (DROP_TAG_ONLY.has(tag.name)) return null;
    if (tag.name.includes("-") && !opts.allowedCustomElements.has(tag.name)) return null;
    if (tag.closing) return undefined;

    if (tag.name === "img") {
      const src = tag.attrs.find((a) => a.name === "src")?.value ?? "";
      if (!hostAllowed(src, opts.allowedImageHosts)) return null;
    }

    const attrs: Attr[] = [];
    for (const a of tag.attrs) {
      if (a.name.startsWith("on")) continue;
      if (a.name === "style" || a.name === "id" || a.name === "srcset") continue;
      if (a.name === "class") {
        const kept = (a.value ?? "").split(/\s+/).filter((c) => opts.allowedClasses.has(c));
        if (kept.length) attrs.push({ name: "class", value: kept.join(" ") });
        continue;
      }
      if (URL_ATTRS.has(a.name) && tag.name !== "img" && !safeLink(a.value ?? "")) continue;
      attrs.push(a);
    }
    if (tag.name === "a") {
      const rest = attrs.filter((a) => a.name !== "target" && a.name !== "rel");
      rest.push({ name: "target", value: "_blank" }, { name: "rel", value: "noopener noreferrer" });
      return { ...tag, attrs: rest };
    }
    return { ...tag, attrs };
  });
}

// ---------------------------------------------------------------------------
// Role elements
// ---------------------------------------------------------------------------

export interface RoleElement {
  role: string;
  /** Index of the opening tag in the source string. */
  start: number;
  /** Index just past the opening tag. */
  openEnd: number;
  /** Visible text inside the element. */
  text: string;
}

/** Finds every element carrying data-role, with the text it contains. */
export function findRoleElements(html: string): RoleElement[] {
  const found: RoleElement[] = [];
  const re = new RegExp(TAG_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] === "/") continue;
    const role = parseAttrs(m[3]).find((a) => a.name === "data-role")?.value;
    if (!role) continue;
    const name = m[2].toLowerCase();
    const openEnd = m.index + m[0].length;

    // Walk forward to the matching close tag, counting nested same-name tags.
    const inner = new RegExp(`<(\\/?)${name}\\b[^>]*>`, "gi");
    inner.lastIndex = openEnd;
    let depth = 1;
    let end = html.length;
    let im: RegExpExecArray | null;
    while ((im = inner.exec(html))) {
      if (im[1] === "/") depth--;
      else if (!/\/\s*>$/.test(im[0])) depth++;
      if (depth === 0) {
        end = im.index;
        break;
      }
    }
    found.push({ role, start: m.index, openEnd, text: stripTags(html.slice(openEnd, end)) });
  }
  return found;
}

/**
 * Sets the classes on every data-role element. `pick` returns the classes
 * for one element; classes it previously set (matching `owned`) are replaced,
 * so running this twice gives the same markup.
 */
export function setRoleClasses(
  html: string,
  pick: (el: RoleElement) => string[],
  owned: (className: string) => boolean,
): string {
  const els = findRoleElements(html);
  let out = html;
  // Last to first, so earlier indexes stay valid as the string grows.
  for (const el of [...els].reverse()) {
    const open = out.slice(el.start, el.openEnd);
    const rewritten = rewriteTags(open, (tag) => {
      const existing = (tag.attrs.find((a) => a.name === "class")?.value ?? "")
        .split(/\s+/)
        .filter((c) => c && !owned(c));
      const classes = [...existing, ...pick(el)];
      const attrs = tag.attrs.filter((a) => a.name !== "class");
      if (classes.length) attrs.push({ name: "class", value: classes.join(" ") });
      return { ...tag, attrs };
    });
    out = out.slice(0, el.start) + rewritten + out.slice(el.openEnd);
  }
  return out;
}
