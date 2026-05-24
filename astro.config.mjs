import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://gen-ui.jeffmills.dev",
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
  },
});
