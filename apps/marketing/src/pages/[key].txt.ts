import type { APIRoute, GetStaticPaths } from "astro";
import { indexNowKey } from "../../site.config.mjs";

export const getStaticPaths: GetStaticPaths = () => [
  { params: { key: indexNowKey } },
];
export const GET: APIRoute = () =>
  new Response(`${indexNowKey}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
