import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  plugins: [svelte(), yaml()],
  server: {
    open: true,
  },
});
