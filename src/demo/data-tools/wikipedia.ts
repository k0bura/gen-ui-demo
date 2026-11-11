// Short encyclopedia summaries from the Wikipedia REST API. No key.

import { DataError, getJson, type HttpOptions } from "./http";
import type { DataTool } from "./types";

interface Summary {
  type?: string;
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

/** Trims to whole sentences so an extract never ends mid-thought. */
export function trimSentences(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return stop > max * 0.4 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…";
}

export const getWikipediaSummary: DataTool = {
  definition: {
    name: "get_wikipedia_summary",
    description:
      "A short factual summary of a place, person, organisation or topic from Wikipedia, with a link and a lead image when there is one. Use the article title (e.g. Kyoto, Euro, Ada Lovelace).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Wikipedia article title, e.g. Kyoto" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  handler: async (input, http: HttpOptions) => {
    const title = String(input.title ?? "").trim();
    if (!title) throw new DataError("No article title was given", "not-found");
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`;
    const res = await getJson<Summary>(url, "The Wikipedia lookup", http);
    if (res.type === "disambiguation") {
      throw new DataError(`"${title}" is ambiguous on Wikipedia. Ask for a more specific title.`, "not-found");
    }
    if (!res.extract) throw new DataError(`No summary found for "${title}"`, "not-found");
    return {
      title: res.title,
      description: res.description ?? null,
      summary: trimSentences(res.extract, 600),
      url: res.content_urls?.desktop?.page ?? null,
      imageUrl: res.thumbnail?.source ?? null,
      note: "Text from Wikipedia, CC BY-SA. Link to the article when you use it.",
    };
  },
};
