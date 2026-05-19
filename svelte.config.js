import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default {
  preprocess: vitePreprocess(),
  plugins: [tailwindcss()],
};
