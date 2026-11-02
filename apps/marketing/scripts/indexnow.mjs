import { readFile } from "node:fs/promises";
import { siteUrl, indexNowKey } from "../site.config.mjs";

const origin = new URL(siteUrl);
const sitemap = await readFile(
  new URL("../dist/sitemap.xml", import.meta.url),
  "utf8",
);
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);
if (
  !urlList.length ||
  urlList.some((url) => new URL(url).origin !== origin.origin)
)
  throw new Error(
    "The built sitemap must contain URLs on the configured site.",
  );

const keyLocation = new URL(`/${indexNowKey}.txt`, origin).href;
const keyResponse = await fetch(keyLocation, {
  signal: AbortSignal.timeout(30_000),
});
if (!keyResponse.ok || (await keyResponse.text()).trim() !== indexNowKey)
  throw new Error(
    "IndexNow ownership file is not live. Deploy before submitting.",
  );

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: origin.host,
    key: indexNowKey,
    keyLocation,
    urlList,
  }),
  signal: AbortSignal.timeout(30_000),
});
if (response.status !== 200 && response.status !== 202)
  throw new Error(
    `IndexNow submission failed (HTTP ${response.status}): ${(await response.text()).slice(0, 500)}`,
  );
console.log(
  `IndexNow received ${urlList.length} URL(s) (HTTP ${response.status}).${response.status === 202 ? " Key validation is pending." : ""} Submission does not guarantee indexing.`,
);
