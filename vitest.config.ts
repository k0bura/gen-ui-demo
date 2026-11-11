import { defineConfig } from "vitest/config";

// Kept apart from astro.config.mjs on purpose: the tests cover the pure
// pipeline code and need neither Astro nor Svelte.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
