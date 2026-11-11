// Every tool the pipeline hands to a model.
//
//   Component stage   data tools (run by the server), one tool per library
//                     component (generated from the manifest), and two
//                     hand-written ones for charts and tables.
//   Structure stage   one tool that returns groups, order and text roles.
//   Layout stage      one tool whose row patterns come from the layout spec.
//   Follow-ups        one tool that returns three suggested prompts.

import { LAYOUT_SPEC, type LayoutSpec } from "./layout-spec";
import { componentTools as manifestTools } from "./manifest";
import { patternIds, roleNames } from "./pipeline/spec-prompt";
import type { AnthropicTool } from "./types";

export const componentTools = manifestTools;

// ---------------------------------------------------------------------------
// Hand-written component tools. The library has no chart and no data table,
// so these two are ours. Like every component tool they are never executed:
// the call is the output.
// ---------------------------------------------------------------------------

export const chartTool: AnthropicTool = {
  name: "render_chart",
  description:
    "Render a chart from numbers you got from a data tool. line for a series over time, bar for comparing a few values, pie or doughnut for parts of a whole. Give it a title. Never invent the numbers.",
  input_schema: {
    type: "object",
    properties: {
      chartType: { type: "string", enum: ["line", "bar", "pie", "doughnut"] },
      title: { type: "string", description: "Short chart title." },
      unit: { type: "string", description: "Unit for the values, e.g. °C, %, EUR." },
      labels: { type: "array", items: { type: "string" }, description: "X-axis labels, or slice names." },
      datasets: {
        type: "array",
        description: "One entry per series. data has one number per label.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            data: { type: "array", items: { type: "number" } },
          },
        },
      },
    },
    required: ["chartType", "title", "labels", "datasets"],
    additionalProperties: false,
  },
};

export const tableTool: AnthropicTool = {
  name: "render_table",
  description:
    "Render a table. Use it whenever the answer has rows and columns: a forecast by day, a comparison across several attributes, a list of rates. Pass numbers as numbers so they align right.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short table title." },
      caption: { type: "string", description: "Optional source or caveat line." },
      columns: { type: "array", items: { type: "string" }, description: "Column headings, at most 8." },
      rows: {
        type: "array",
        description: "One array per row, one cell per column. Cells are strings or numbers.",
        items: { type: "array" },
      },
    },
    required: ["title", "columns", "rows"],
    additionalProperties: false,
  },
};

export const handWrittenTools: AnthropicTool[] = [chartTool, tableTool];

// ---------------------------------------------------------------------------
// Structure stage
// ---------------------------------------------------------------------------

export function structureTool(spec: LayoutSpec = LAYOUT_SPEC): AnthropicTool {
  return {
    name: "set_structure",
    description:
      "Return the components in display order, each with a group, and with data-role marks on its text. You change order, grouping and role marks only. Never change a figure, a fact or a link.",
    input_schema: {
      type: "object",
      properties: {
        components: {
          type: "array",
          description: "The components to show, in the order they should be read.",
          items: {
            type: "object",
            properties: {
              id: { type: "number", description: "The component's id from the list you were given." },
              group: {
                type: "string",
                description: "Short kebab-case name shared by components that belong together, e.g. key-figures, daily-forecast.",
              },
              content: {
                type: "string",
                description: `The component's content markup with data-role marks added. Omit to keep it unchanged. Roles: ${roleNames(spec).join(", ")}.`,
              },
              slots: {
                type: "object",
                description: "Named slots with data-role marks added. Omit to keep them unchanged.",
              },
            },
            required: ["id", "group"],
          },
        },
      },
      required: ["components"],
    },
  };
}

// ---------------------------------------------------------------------------
// Layout stage
// ---------------------------------------------------------------------------

export function layoutTool(spec: LayoutSpec = LAYOUT_SPEC): AnthropicTool {
  // The API does not resolve recursive $refs reliably, so one level is
  // described here and the recursion is explained in the description.
  const nodeSchema = {
    type: "object",
    description: "A layout node: ref, pattern, stack, section, tabs or divider.",
    properties: {
      kind: { type: "string", enum: ["ref", "pattern", "stack", "section", "tabs", "divider"] },
      ref: { type: "number", description: "(ref) The id of a component." },
      pattern: {
        type: "string",
        enum: patternIds(spec),
        description: "(pattern) Which row pattern. These are the only row shapes there are.",
      },
      heading: { type: "string", description: "(section) Section heading." },
      description: { type: "string", description: "(section) Optional line under the heading." },
      tabs: {
        type: "array",
        description: "(tabs) [{ label, children }]. children are pattern rows.",
        items: {
          type: "object",
          properties: { label: { type: "string" }, children: { type: "array" } },
          required: ["label", "children"],
        },
      },
      children: {
        type: "array",
        description:
          "(pattern) refs, or a stack of refs that share one slot. (stack, section) pattern rows, sections, tabs, dividers.",
      },
    },
    required: ["kind"],
  };

  return {
    name: "compose_layout",
    description: `Arrange the components into a page.

Node kinds:
  ref       { kind: "ref", ref: <id> }                          one component
  pattern   { kind: "pattern", pattern: "<id>", children: [] }  one row, or several rows of the same shape
  stack     { kind: "stack", children: [] }                     rows one under another; inside a pattern, refs sharing a slot
  section   { kind: "section", heading: "...", children: [] }   a headed group of rows
  tabs      { kind: "tabs", tabs: [{ label, children }] }       alternative views of the same subject
  divider   { kind: "divider" }

The root is a section whose heading names the answer. Its children are pattern rows (and sections, when there are enough groups). Every component id appears exactly once.`,
    input_schema: {
      type: "object",
      properties: { layout: nodeSchema as never },
      required: ["layout"],
    },
  };
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export const followUpTool: AnthropicTool = {
  name: "suggest_follow_ups",
  description: "Suggest three short follow-up prompts the user could ask next.",
  input_schema: {
    type: "object",
    properties: {
      prompts: {
        type: "array",
        items: { type: "string" },
        description: "Exactly three prompts, each under 60 characters.",
      },
    },
    required: ["prompts"],
  },
};
