export const componentTools = [
  {
    name: "text",
    description: "Render a short paragraph. Use for explanations, summaries, or single-sentence answers. NEVER use for ordered or numbered content.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique identifier for this component, used to reference it in the layout step." },
        body: { type: "string" },
      },
      required: ["name", "body"],
    },
  },
  {
    name: "list",
    description: "Render an ordered or unordered list. Use for steps, bullets, or any sequence.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique identifier for this component." },
        variant: { type: "string", enum: ["ordered", "unordered"] },
        items: { type: "array", items: { type: "string" } },
      },
      required: ["name", "variant", "items"],
    },
  },
  {
    name: "table",
    description: "Render a table. Use for tabular or comparative data. All cells must be strings.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique identifier for this component." },
        headers: { type: "array", items: { type: "string" } },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
        },
      },
      required: ["name", "headers", "rows"],
    },
  },
  {
    name: "accordion",
    description: "Render a collapsible accordion. Use when there are three or more discrete topics that the user may want to expand independently.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique identifier for this component." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["title", "content"],
          },
        },
      },
      required: ["name", "items"],
    },
  },
  {
    name: "chart",
    description: "Render a chart. Pick the most appropriate kind based on the data.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique identifier for this component." },
        kind: { type: "string", enum: ["bar", "line", "doughnut", "pie"] },
        label: { type: "string", description: "Caption / title for the chart." },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number", minimum: 0 },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["name", "kind", "label", "data"],
    },
  },
] as const;

export const layoutTool = {
  name: "compose_layout",
  description: "Compose the selected components into a visual layout of rows and columns.",
  input_schema: {
    type: "object",
    properties: {
      layout: {
        type: "object",
        description: "Root layout node.",
        properties: {
          kind: { type: "string", enum: ["container"] },
          direction: { type: "string", enum: ["row", "column"] },
          children: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["container", "component"] },
                direction: { type: "string", enum: ["row", "column"] },
                name: { type: "string", description: "Component name (only for kind=component)." },
                children: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      kind: { type: "string", enum: ["container", "component"] },
                      direction: { type: "string", enum: ["row", "column"] },
                      name: { type: "string" },
                      children: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            kind: { type: "string", enum: ["component"] },
                            name: { type: "string" },
                          },
                          required: ["kind", "name"],
                        },
                      },
                    },
                    required: ["kind"],
                  },
                },
              },
              required: ["kind"],
            },
          },
        },
        required: ["kind", "direction", "children"],
      },
    },
    required: ["layout"],
  },
} as const;
