import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("Configure a canonical site URL.");
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site)}\n`,
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
};
