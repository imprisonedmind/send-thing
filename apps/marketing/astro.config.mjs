import { defineConfig } from "astro/config";
import { siteUrl } from "./site.config.mjs";

export default defineConfig({
  site: siteUrl,
  output: "static",
  server: { port: 4321 },
  vite: { server: { strictPort: true } },
});
