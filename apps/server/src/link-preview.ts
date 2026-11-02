import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Parser } from "htmlparser2";
import ipaddr from "ipaddr.js";
import type { LinkPreview } from "@send-thing/contracts";

// Previews must never turn the host into a proxy for its LAN, tailnet or loopback.
export function publicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const ip = ipaddr.process(address);
  return (
    ip.range() === "unicast" &&
    (ip.kind() === "ipv4" || (ip.toByteArray()[0]! & 0xe0) === 0x20)
  );
}

export function previewUrl(value: string, base?: string): URL {
  const url = new URL(value, base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Unsupported preview address.");
  return url;
}

async function fetchPublic(
  input: string,
  maxBytes: number,
  accepts: RegExp,
  signal: AbortSignal,
  redirects = 0,
  truncate = false,
): Promise<{ body: Buffer; url: string; mime: string }> {
  const url = previewUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  signal.throwIfAborted();
  let cancel = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    aborted,
  ]).finally(() => signal.removeEventListener("abort", cancel));
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new Error("Private preview address.");
  const selected =
    addresses.find((address) => address.family === 4) ?? addresses[0]!;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        // Pin the validated DNS answer; a second lookup would permit DNS rebinding.
        lookup: (_hostname, _options, callback) =>
          callback(null, selected.address, selected.family),
        family: selected.family,
        headers: {
          "User-Agent": "SendThing/1.0 (Link Preview)",
          Accept: "text/html,image/*",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          response.headers.location
        ) {
          response.destroy();
          if (redirects >= 4) {
            reject(new Error("Too many preview redirects."));
            return;
          }
          try {
            resolve(
              fetchPublic(
                previewUrl(response.headers.location, url.href).href,
                maxBytes,
                accepts,
                signal,
                redirects + 1,
                truncate,
              ),
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        const mime = (response.headers["content-type"] ?? "")
          .split(";")[0]!
          .trim()
          .toLowerCase();
        if (
          status !== 200 ||
          !accepts.test(mime) ||
          (!truncate &&
            Number(response.headers["content-length"]) > maxBytes) ||
          ![undefined, "identity"].includes(
            response.headers["content-encoding"],
          )
        ) {
          response.destroy();
          reject(new Error("Preview response unavailable."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes && truncate) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            resolve({ body: Buffer.concat(chunks), url: url.href, mime });
            response.destroy();
          } else if (size > maxBytes)
            response.destroy(new Error("Preview exceeds size limit."));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({ body: Buffer.concat(chunks), url: url.href, mime }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

export function parseMetadata(html: string, pageUrl: string) {
  const meta = new Map<string, string>();
  let title = "";
  let inTitle = false;
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (name === "body") {
          parser.pause();
          return;
        }
        if (name === "title") inTitle = true;
        if (name !== "meta") return;
        const key = (
          attributes.property ??
          attributes.name ??
          ""
        ).toLowerCase();
        const value = attributes.content?.trim();
        if (value && !meta.has(key)) meta.set(key, value);
      },
      onclosetag(name) {
        if (name === "title") inTitle = false;
      },
      ontext(text) {
        if (inTitle) title += text;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  const text = (value: string, limit: number) =>
    value.replace(/\s+/g, " ").trim().slice(0, limit);
  const resource = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key);
      if (value)
        try {
          return previewUrl(value, pageUrl).href;
        } catch {
          /* Ignore invalid resource metadata. */
        }
    }
    return null;
  };
  return {
    title: text(
      meta.get("og:title") ?? meta.get("twitter:title") ?? title,
      240,
    ),
    description: text(
      meta.get("og:description") ??
        meta.get("twitter:description") ??
        meta.get("description") ??
        "",
      500,
    ),
    siteName: text(meta.get("og:site_name") ?? "", 100),
    imageUrl: resource(
      "og:image:secure_url",
      "og:image",
      "og:image:url",
      "twitter:image",
      "twitter:image:src",
    ),
    video: Boolean(
      resource(
        "og:video:secure_url",
        "og:video",
        "og:video:url",
        "twitter:player",
      ),
    ),
  };
}

export class LinkPreviews {
  private cache = new Map<
    string,
    { value: LinkPreview | null; until: number; size: number }
  >();
  private pending = new Map<string, Promise<LinkPreview | null>>();
  private bytes = 0;
  private active = 0;
  private queue: (() => void)[] = [];
  private abort = new AbortController();

  close() {
    this.abort.abort();
    this.cache.clear();
    this.bytes = 0;
  }

  async get(url: string): Promise<LinkPreview | null> {
    const existing = this.cache.get(url);
    if (existing && existing.until > Date.now()) return existing.value;
    const pending = this.pending.get(url);
    if (pending) return pending;
    if (this.pending.size >= 100) throw new Error("Too many pending previews.");
    const task = this.load(url);
    this.pending.set(url, task);
    try {
      return await task;
    } finally {
      this.pending.delete(url);
    }
  }

  private async load(url: string): Promise<LinkPreview | null> {
    if (this.active >= 4)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
    let value: LinkPreview | null = null;
    try {
      this.abort.signal.throwIfAborted();
      const signal = AbortSignal.any([
        this.abort.signal,
        AbortSignal.timeout(12_000),
      ]);
      const page = await fetchPublic(
        url,
        1024 * 1024,
        /^text\/html$|^application\/xhtml\+xml$/,
        signal,
        0,
        true,
      );
      const metadata = parseMetadata(page.body.toString("utf8"), page.url);
      if (
        metadata.title ||
        metadata.description ||
        metadata.imageUrl ||
        metadata.video
      ) {
        let image: string | null = null;
        if (metadata.imageUrl) {
          try {
            const photo = await fetchPublic(
              metadata.imageUrl,
              2 * 1024 * 1024,
              /^image\/(jpeg|png|webp|gif|avif)$/,
              signal,
            );
            image = `data:${photo.mime};base64,${photo.body.toString("base64")}`;
          } catch {
            /* Keep the real text metadata when the thumbnail is unavailable. */
          }
        }
        value = {
          url,
          title: metadata.title,
          description: metadata.description,
          siteName: metadata.siteName,
          image,
          video: metadata.video,
        };
      }
    } catch {
      /* Unreachable sites remain ordinary links. Failures are cached briefly. */
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
    if (this.abort.signal.aborted) return null;
    const old = this.cache.get(url);
    if (old) {
      this.bytes -= old.size;
      this.cache.delete(url);
    }
    const size = Buffer.byteLength(JSON.stringify(value));
    this.cache.set(url, {
      value,
      size,
      until: Date.now() + (value ? 60 * 60_000 : 5 * 60_000),
    });
    this.bytes += size;
    while (this.bytes > 16 * 1024 * 1024 || this.cache.size > 128) {
      const key = this.cache.keys().next().value!;
      this.bytes -= this.cache.get(key)!.size;
      this.cache.delete(key);
    }
    return value;
  }
}
