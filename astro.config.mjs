// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://www.love-tours.fr",
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  // CSS inliné dans le HTML : supprime la requête bloquante au premier rendu
  // (site statique de 6 pages, le cache d'un fichier CSS séparé pèse peu).
  build: { inlineStylesheets: "always" },
  vite: { plugins: [tailwindcss()] },
});
