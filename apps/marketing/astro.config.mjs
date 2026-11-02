import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://send-thing.lukestephens.co.za",
  output: "static",
  server: { port: 4321 },
  vite: { server: { strictPort: true } },
});
