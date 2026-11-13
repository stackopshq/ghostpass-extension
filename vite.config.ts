import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  build: {
    rollupOptions: {
      // Le document hors écran n'est pas cité par le manifeste : le service worker l'ouvre à la
      // demande. Il faut donc le désigner à Rollup pour qu'il soit construit.
      input: { offscreen: "src/offscreen/index.html" },
    },
  },
});
