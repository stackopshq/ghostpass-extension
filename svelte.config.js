import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // Build DOM with createElement instead of innerHTML templates: AMO's linter flags innerHTML.
  compilerOptions: { fragments: "tree" },
};
