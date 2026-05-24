// Manifest-driven tool generation.
//
// The design system IS the tool surface. Shoelace ships a Custom Elements
// Manifest at @shoelace-style/shoelace/dist/custom-elements.json. We read
// it at build time and emit Anthropic tool specs.
//
// Adding a new component to Shoelace, or rev'ing one with a new prop, means
// the LLM's tool surface updates automatically next build. No hand-curated
// tool list to maintain. This is the same pattern that powers the AXS MCP
// server.

import manifestJson from "@shoelace-style/shoelace/dist/custom-elements.json";
import type {
  AnthropicTool,
  ComponentSpec,
  PropertySchema,
  SlotSpec,
} from "./types";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

// These components only exist as children of a parent (handled by Stage 2
// layout primitives like `tabs`, `menu`, etc.), not exposed as standalone
// Stage 1 tools.
const COMPOSITE_CHILDREN = new Set<string>([
  "sl-tab",
  "sl-tab-panel",
  "sl-menu-item",
  "sl-menu-label",
  "sl-option",
  "sl-radio",
  "sl-radio-button",
  "sl-breadcrumb-item",
  "sl-carousel-item",
  "sl-tree-item",
]);

// Utility helpers that don't render visible UI.
const UTILITIES = new Set<string>([
  "sl-include",
  "sl-mutation-observer",
  "sl-resize-observer",
  "sl-visually-hidden",
  "sl-animation",
  "sl-popup",
]);

// Container/parent components handled by Stage 2 layout primitives.
const STAGE_2_COMPOSITES = new Set<string>([
  "sl-tab-group",
  "sl-menu",
  "sl-tree",
  "sl-button-group",
  "sl-radio-group",
  "sl-breadcrumb",
  "sl-carousel",
]);

// Modal / overlay components need imperative open-state handling that doesn't
// fit cleanly into a one-shot composition. Hide for now.
const OVERLAYS = new Set<string>([
  "sl-dialog",
  "sl-drawer",
  "sl-dropdown",
  "sl-tooltip",
]);

function shouldExpose(tag: string, status: string | undefined): boolean {
  if (COMPOSITE_CHILDREN.has(tag)) return false;
  if (UTILITIES.has(tag)) return false;
  if (STAGE_2_COMPOSITES.has(tag)) return false;
  if (OVERLAYS.has(tag)) return false;
  if (status === "experimental") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Type conversion: Shoelace TypeScript type strings → JSON Schema
// ---------------------------------------------------------------------------

function parseTypeString(typeText: string | undefined): Partial<PropertySchema> {
  if (!typeText) return { type: "string" };

  const t = typeText.trim();

  // Boolean
  if (t === "boolean") return { type: "boolean" };

  // Number
  if (t === "number") return { type: "number" };

  // String union → enum.  e.g.  "'primary' | 'success' | 'neutral'"
  const unionMatch = t.match(/^('[^']*'\s*\|\s*)+'[^']*'$/);
  if (unionMatch) {
    const values = t.split("|").map((s) => s.trim().replace(/^'|'$/g, ""));
    return { type: "string", enum: values };
  }

  // Plain string types
  if (t === "string") return { type: "string" };

  // Things like "Date | string", "HTMLFormElement | string", etc — treat as string
  return { type: "string" };
}

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

interface ManifestAttribute {
  name: string;
  type?: { text?: string };
  default?: string;
  description?: string;
}

interface ManifestSlot {
  name: string;
  description?: string;
}

interface ManifestDeclaration {
  kind: string;
  tagName?: string;
  description?: string;
  summary?: string;
  status?: string;
  attributes?: ManifestAttribute[];
  slots?: ManifestSlot[];
}

interface Manifest {
  modules: Array<{ declarations?: ManifestDeclaration[] }>;
}

const manifest = manifestJson as unknown as Manifest;

// ---------------------------------------------------------------------------
// Build the component specs (used by the renderer) and tool specs (used by
// the Anthropic API).
// ---------------------------------------------------------------------------

export const componentSpecs: ComponentSpec[] = [];

for (const mod of manifest.modules) {
  for (const decl of mod.declarations ?? []) {
    const tag = decl.tagName;
    if (!tag || !decl.customElement) continue;
    if (!shouldExpose(tag, decl.status)) continue;

    const attributes: Record<string, PropertySchema> = {};
    for (const a of decl.attributes ?? []) {
      const base = parseTypeString(a.type?.text);
      attributes[a.name] = {
        ...base,
        description: cleanDescription(a.description ?? ""),
      } as PropertySchema;
    }

    const slots: SlotSpec[] = (decl.slots ?? []).map((s) => ({
      name: s.name || "(default)",
      description: cleanDescription(s.description ?? ""),
    }));

    componentSpecs.push({
      tagName: tag,
      toolName: tag.replace(/-/g, "_"),
      description: cleanDescription(decl.summary || decl.description || ""),
      attributes,
      slots,
    });
  }
}

// Sort alphabetically for stable ordering.
componentSpecs.sort((a, b) => a.tagName.localeCompare(b.tagName));

// ---------------------------------------------------------------------------
// Anthropic tool spec generation
// ---------------------------------------------------------------------------

export function toolForComponent(spec: ComponentSpec): AnthropicTool {
  const props: Record<string, PropertySchema> = {};

  // attributes go in nested `attributes` object
  if (Object.keys(spec.attributes).length > 0) {
    props.attributes = {
      type: "object",
      description: "HTML attributes for the component.",
      properties: spec.attributes,
      additionalProperties: false,
    } as PropertySchema;
  }

  // default slot becomes `content`
  const hasDefault = spec.slots.some((s) => s.name === "(default)");
  if (hasDefault) {
    props.content = {
      type: "string",
      description: "Text content for the component's default slot.",
    } as PropertySchema;
  }

  // named slots collected under a single `slots` object
  const namedSlots = spec.slots.filter((s) => s.name !== "(default)");
  if (namedSlots.length > 0) {
    const slotProps: Record<string, PropertySchema> = {};
    for (const slot of namedSlots) {
      slotProps[slot.name] = {
        type: "string",
        description: slot.description,
      } as PropertySchema;
    }
    props.slots = {
      type: "object",
      description:
        "Named slots. Each key is a slot name; values are text content.",
      properties: slotProps,
      additionalProperties: false,
    } as PropertySchema;
  }

  return {
    name: spec.toolName,
    description: spec.description || `Render a <${spec.tagName}> element.`,
    input_schema: {
      type: "object",
      properties: props,
      additionalProperties: false,
    },
  };
}

export const componentTools: AnthropicTool[] = componentSpecs.map(toolForComponent);

export function specByTag(tag: string): ComponentSpec | undefined {
  return componentSpecs.find((s) => s.tagName === tag);
}

export function specByToolName(toolName: string): ComponentSpec | undefined {
  return componentSpecs.find((s) => s.toolName === toolName);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanDescription(d: string): string {
  // Collapse whitespace, strip JSDoc-style line breaks for compact tool docs.
  return d.replace(/\s+/g, " ").trim();
}
