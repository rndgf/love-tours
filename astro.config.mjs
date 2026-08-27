// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://www.love-tours.fr",
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  vite: { plugins: [tailwindcss()] },
});
