import type { Starter } from "./types.ts";

export const STARTERS: Starter[] = [
  {
    label: "Portfolio allocation",
    prompt:
      "I'm 35 and want a balanced long-horizon portfolio. Suggest an asset allocation, show the breakdown visually, and list the trade-offs I should think about.",
  },
  {
    label: "Retirement income plan",
    prompt:
      "I want to retire at 60 with $1.5M saved. Outline a withdrawal strategy and show the year-by-year income for the first decade.",
  },
  {
    label: "Compare weekend trips",
    prompt:
      "Compare three weekend trips from Philadelphia under $500 per person. Include the rough cost breakdown and the main draw of each.",
  },
  {
    label: "Sourdough vs. ciabatta",
    prompt:
      "What's the difference between sourdough and ciabatta? Cover ingredients, technique, and texture, and tell me which is easier for a beginner.",
  },
];
