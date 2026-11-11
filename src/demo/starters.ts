import type { Starter } from "./types.ts";

// The first three need live data, one tool each and then two together.
// The last needs none, to show the pipeline also works from what the
// model already knows.
export const STARTERS: Starter[] = [
  {
    label: "Kyoto this week",
    prompt: "What's the weather in Kyoto for the next 7 days? Show the trend and tell me which days to plan indoors.",
  },
  {
    label: "USD to EUR, 90 days",
    prompt: "How has the US dollar moved against the euro over the last 90 days? Show today's rate, the trend and the range.",
  },
  {
    label: "Lisbon vs. Porto",
    prompt: "Compare Lisbon and Porto for a long weekend: a short intro to each city and this week's weather side by side.",
  },
  {
    label: "Sourdough vs. ciabatta",
    prompt: "What's the difference between sourdough and ciabatta? Cover ingredients, technique and texture, and tell me which is easier for a beginner.",
  },
];
