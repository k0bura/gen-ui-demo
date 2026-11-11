// The layout spec: one data file that both the prompts and the code read.
//
// Everything a designer would hand over as "the layout rules" lives here:
// the grid, the closed set of row patterns, how narrow each kind of
// component may go, how groups behave, and how text roles map to type
// styles. Nothing below is prose for the model or logic for the repair
// pass. spec-prompt.ts turns it into prompt text and a tool schema;
// layout-repair.ts and typeset.ts enforce it. Change a number here and
// the prompt and the enforcement change together.
//
// Design source: IBM Carbon (carbondesignsystem.com), whose Figma kit
// "(v11) Carbon Design System" is free on Figma Community. The grid is
// Carbon's 2x Grid at the `lg` breakpoint, spacing is Carbon's spacing
// scale, and the type styles are Carbon's productive type tokens. The
// components are still Shoelace, so fonts and colours are the demo's own;
// only the layout and type scale come from Carbon.

export type SlotWidth = "quarter" | "third" | "half" | "two-thirds" | "full";

export interface RowPattern {
  id: string;
  label: string;
  /** Track ratios, left to right. [2, 1] is a 2:1 split. */
  tracks: number[];
  /** When to reach for it, in one line. Goes into the prompt verbatim. */
  use: string;
}

export interface TypeStyle {
  /** Carbon type token this style is taken from. */
  token: string;
  sizePx: number;
  lineHeightPx: number;
  weight: number;
  letterSpacingPx: number;
  uppercase?: boolean;
  muted?: boolean;
}

export interface RoleSpec {
  role: string;
  /** What the role means. Goes into the structure-stage prompt verbatim. */
  meaning: string;
  /** Largest style first. Typesetting steps down until the text fits. */
  ladder: string[];
  /** A fitted role is kept on this many lines at most. */
  maxLines: number;
  /** Titles in one group share a size, so cards in a row match. */
  sharedAcrossGroup?: boolean;
}

export interface LayoutSpec {
  grid: {
    source: string;
    breakpoint: string;
    columns: number;
    canvasPx: number;
    gutterPx: number;
    cardPaddingPx: number;
  };
  spacingPx: Record<"xs" | "sm" | "md" | "lg" | "xl", number>;
  slotFractions: Record<SlotWidth, number>;
  rowPatterns: RowPattern[];
  minWidths: {
    byTag: Record<string, SlotWidth>;
    fallback: SlotWidth;
    /** Content thresholds that widen a component beyond its tag default. */
    density: {
      longTextChars: number;
      veryLongTextChars: number;
      wideTableColumns: number;
      veryWideTableColumns: number;
      manyChartLabels: number;
    };
  };
  grouping: {
    maxPerRow: number;
    minGroupsForSections: number;
  };
  typeStyles: Record<string, TypeStyle>;
  roles: RoleSpec[];
  /** Average glyph width as a fraction of font size, for fit estimates. */
  avgCharWidthEm: number;
}

export const LAYOUT_SPEC: LayoutSpec = {
  grid: {
    source: "Carbon 2x Grid",
    breakpoint: "lg",
    columns: 16,
    // Carbon's lg breakpoint. The demo's result area is exactly this wide.
    canvasPx: 1056,
    // 16px padding either side of a column boundary.
    gutterPx: 32,
    cardPaddingPx: 20,
  },

  // Carbon spacing-03, -05, -06, -07, -09.
  spacingPx: { xs: 8, sm: 16, md: 24, lg: 32, xl: 48 },

  slotFractions: {
    quarter: 1 / 4,
    third: 1 / 3,
    half: 1 / 2,
    "two-thirds": 2 / 3,
    full: 1,
  },

  // The closed set. A row is always one of these and nothing else.
  rowPatterns: [
    {
      id: "1-up",
      label: "1-up",
      tracks: [1],
      use: "one component that needs the full width: a wide table, a long read, an intro or closing note",
    },
    {
      id: "2-up",
      label: "2-up 1:1",
      tracks: [1, 1],
      use: "two things of equal weight, or a comparison of two",
    },
    {
      id: "2-up-wide-left",
      label: "2-up 2:1",
      tracks: [2, 1],
      use: "a primary component on the left (chart, table) with a supporting one beside it",
    },
    {
      id: "2-up-wide-right",
      label: "2-up 1:2",
      tracks: [1, 2],
      use: "a supporting component on the left with the primary one on the right",
    },
    {
      id: "3-up",
      label: "3-up",
      tracks: [1, 1, 1],
      use: "three like things, or a series of cards that reads well three across",
    },
    {
      id: "4-up",
      label: "4-up",
      tracks: [1, 1, 1, 1],
      use: "headline figures and other small tiles",
    },
  ],

  minWidths: {
    byTag: {
      "render-table": "half",
      "render-chart": "half",
      "sl-alert": "third",
      "sl-details": "third",
      "sl-card": "quarter",
      "sl-badge": "quarter",
      "sl-tag": "quarter",
      "sl-progress-ring": "quarter",
      "sl-progress-bar": "third",
      "sl-rating": "quarter",
      "sl-format-number": "quarter",
    },
    fallback: "third",
    density: {
      longTextChars: 220,
      veryLongTextChars: 600,
      wideTableColumns: 4,
      veryWideTableColumns: 6,
      manyChartLabels: 10,
    },
  },

  grouping: {
    maxPerRow: 4,
    minGroupsForSections: 3,
  },

  // Carbon productive type tokens, values as published.
  typeStyles: {
    "heading-06": { token: "heading-06", sizePx: 42, lineHeightPx: 50, weight: 300, letterSpacingPx: 0 },
    "heading-05": { token: "heading-05", sizePx: 32, lineHeightPx: 40, weight: 400, letterSpacingPx: 0 },
    "heading-04": { token: "heading-04", sizePx: 28, lineHeightPx: 36, weight: 400, letterSpacingPx: 0 },
    "heading-03": { token: "heading-03", sizePx: 20, lineHeightPx: 28, weight: 400, letterSpacingPx: 0 },
    "heading-02": { token: "heading-02", sizePx: 16, lineHeightPx: 24, weight: 600, letterSpacingPx: 0 },
    "heading-01": { token: "heading-01", sizePx: 14, lineHeightPx: 20, weight: 600, letterSpacingPx: 0.16 },
    "body-02": { token: "body-02", sizePx: 16, lineHeightPx: 24, weight: 400, letterSpacingPx: 0 },
    "body-01": { token: "body-01", sizePx: 14, lineHeightPx: 20, weight: 400, letterSpacingPx: 0.16 },
    "label-01": { token: "label-01", sizePx: 12, lineHeightPx: 16, weight: 400, letterSpacingPx: 0.32, muted: true },
    "eyebrow-01": { token: "label-01", sizePx: 12, lineHeightPx: 16, weight: 600, letterSpacingPx: 0.32, uppercase: true, muted: true },
  },

  roles: [
    {
      role: "eyebrow",
      meaning: "a short kicker above a title or figure, such as a category or a unit",
      ladder: ["eyebrow-01"],
      maxLines: 1,
    },
    {
      role: "card-title",
      meaning: "the title of a card, alert or expandable panel",
      ladder: ["heading-03", "heading-02", "heading-01"],
      maxLines: 2,
      sharedAcrossGroup: true,
    },
    {
      role: "stat-value",
      meaning: "one headline figure: a number with its unit, nothing else",
      ladder: ["heading-06", "heading-05", "heading-04", "heading-03"],
      maxLines: 1,
      sharedAcrossGroup: true,
    },
    {
      role: "stat-label",
      meaning: "the few words that say what a headline figure measures",
      ladder: ["body-01"],
      maxLines: 2,
    },
    {
      role: "body",
      meaning: "running text: sentences, paragraphs, list items",
      ladder: ["body-02", "body-01"],
      maxLines: 99,
    },
    {
      role: "caption",
      meaning: "a source line, a date, a caveat, or other fine print",
      ladder: ["label-01"],
      maxLines: 3,
    },
  ],

  avgCharWidthEm: 0.56,
};

// ---------------------------------------------------------------------------
// Lookups derived from the spec. Pure, so both the server and tests use them.
// ---------------------------------------------------------------------------

export const SLOT_ORDER: SlotWidth[] = ["quarter", "third", "half", "two-thirds", "full"];

export function patternById(spec: LayoutSpec, id: string): RowPattern | undefined {
  return spec.rowPatterns.find((p) => p.id === id);
}

export function roleByName(spec: LayoutSpec, role: string): RoleSpec | undefined {
  return spec.roles.find((r) => r.role === role);
}

/** Fraction of the row each track of a pattern gets. */
export function trackFractions(pattern: RowPattern): number[] {
  const total = pattern.tracks.reduce((a, b) => a + b, 0);
  return pattern.tracks.map((t) => t / total);
}

/** Pixel width of each track at a given row width, gutters taken out. */
export function trackWidthsPx(spec: LayoutSpec, pattern: RowPattern, rowPx: number): number[] {
  const gutters = (pattern.tracks.length - 1) * spec.grid.gutterPx;
  return trackFractions(pattern).map((f) => Math.floor((rowPx - gutters) * f));
}

/** The n-up pattern with exactly `count` equal tracks. */
export function equalPattern(spec: LayoutSpec, count: number): RowPattern {
  const n = Math.max(1, Math.min(spec.grouping.maxPerRow, count));
  const found = spec.rowPatterns.find(
    (p) => p.tracks.length === n && p.tracks.every((t) => t === p.tracks[0]),
  );
  if (!found) throw new Error(`layout spec has no equal ${n}-up pattern`);
  return found;
}

/** Does a component with this minimum width fit a track of this fraction? */
export function fits(spec: LayoutSpec, min: SlotWidth, trackFraction: number): boolean {
  // A hair of tolerance so 1/3 fits a 1/3 track despite float error.
  return spec.slotFractions[min] <= trackFraction + 1e-9;
}

export const typeClass = (styleName: string): string => `gx-type-${styleName}`;
export const roleClass = (role: string): string => `gx-role-${role}`;

/** Every class the type system may put on generated markup. */
export function typeClassNames(spec: LayoutSpec): string[] {
  return [
    ...Object.keys(spec.typeStyles).map(typeClass),
    ...spec.roles.map((r) => roleClass(r.role)),
  ];
}

/** The stylesheet for the type classes, generated so it cannot drift. */
export function specToCss(spec: LayoutSpec): string {
  const rules: string[] = [];
  for (const [name, s] of Object.entries(spec.typeStyles)) {
    const decls = [
      `font-size:${s.sizePx / 16}rem`,
      `line-height:${s.lineHeightPx}px`,
      `font-weight:${s.weight}`,
      `letter-spacing:${s.letterSpacingPx}px`,
    ];
    if (s.uppercase) decls.push("text-transform:uppercase");
    if (s.muted) decls.push("color:var(--color-fg-muted)");
    rules.push(`.${typeClass(name)}{${decls.join(";")}}`);
  }
  for (const r of spec.roles) {
    if (r.maxLines >= 99) continue;
    const clamp =
      r.maxLines === 1
        ? "white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
        : `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${r.maxLines};overflow:hidden`;
    rules.push(`.${roleClass(r.role)}{${clamp}}`);
  }
  for (const [name, px] of Object.entries(spec.spacingPx)) {
    rules.push(`[data-gap="${name}"]{--gap:${px}px}`);
  }
  for (const p of spec.rowPatterns) {
    rules.push(
      `.gen-pattern[data-pattern="${p.id}"]{grid-template-columns:${p.tracks
        .map((t) => `minmax(0,${t}fr)`)
        .join(" ")}}`,
    );
  }
  rules.push(`.gen-pattern{column-gap:${spec.grid.gutterPx}px;row-gap:${spec.spacingPx.md}px}`);
  return rules.join("\n");
}
