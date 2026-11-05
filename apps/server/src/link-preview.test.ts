import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LinkPreviews,
  parseMetadata,
  previewUrl,
  publicAddress,
} from "./link-preview.ts";
import { Store, newToken } from "./store.ts";

test("metadata and image bytes survive expiry, memory eviction and host restart without refetching", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "send-thing-previews-"));
  const filename = join(directory, "state.sqlite");
  const host = { name: "Host", token: newToken() };
  let store = new Store(filename, host);
  const fetch = t.mock.fn(async (url: string) => ({
    url,
    mime: url.endsWith(".png") ? "image/png" : "text/html",
    body: Buffer.from(
      url.endsWith(".png")
        ? "thumbnail bytes"
        : '<meta property="og:title" content="Saved title"><meta property="og:image" content="/og.png">',
    ),
  }));
  let previews = new LinkPreviews(store, fetch);
  try {
    const url = "https://example.com/post";
    const first = await previews.get(url);
    assert.equal(first?.title, "Saved title");
    assert.equal(
      first?.image,
      `data:image/png;base64,${Buffer.from("thumbnail bytes").toString("base64")}`,
    );
    assert.equal(fetch.mock.callCount(), 2);

    const later = Date.now() + 24 * 60 * 60_000;
    t.mock.method(Date, "now", () => later);
    assert.deepEqual(await previews.get(url), first);
    assert.equal(fetch.mock.callCount(), 2);

    for (let index = 0; index < 129; index++)
      await previews.get(`https://example.com/post/${index}`);
    const calls = fetch.mock.callCount();
    assert.deepEqual(await previews.get(url), first);
    assert.equal(fetch.mock.callCount(), calls);

    previews.close();
    store.close();
    store = new Store(filename, host);
    previews = new LinkPreviews(store, fetch);
    assert.deepEqual(await previews.get(url), first);
    assert.equal(fetch.mock.callCount(), calls);
  } finally {
    previews.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const failure of ["page", "image"])
  test(`failed ${failure} fetches are retried instead of permanently cached`, async (t) => {
    const store = new Store(":memory:", { name: "Host", token: newToken() });
    let failing = true;
    const fetch = t.mock.fn(async (url: string) => {
      const image = url.endsWith(".png");
      if (failing && (failure === "page" || image))
        throw new Error("Temporarily unavailable");
      return {
        url,
        mime: image ? "image/png" : "text/html",
        body: Buffer.from(
          image
            ? "thumbnail bytes"
            : '<title>Saved title</title><meta property="og:image" content="/og.png">',
        ),
      };
    });
    const previews = new LinkPreviews(store, fetch);
    try {
      const url = "https://example.com/post";
      const first = await previews.get(url);
      if (failure === "page") assert.equal(first, null);
      else {
        assert.equal(first?.title, "Saved title");
        assert.equal(first?.image, null);
      }
      assert.equal(store.linkPreview(url), null);
      const calls = fetch.mock.callCount();
      failing = false;
      assert.deepEqual(await previews.get(url), first);
      assert.equal(fetch.mock.callCount(), calls);

      const later = Date.now() + 5 * 60_000 + 1;
      t.mock.method(Date, "now", () => later);
      const recovered = await previews.get(url);
      assert.equal(recovered?.title, "Saved title");
      assert.ok(recovered?.image);
      assert.equal(fetch.mock.callCount(), calls + 2);
      assert.deepEqual(store.linkPreview(url), recovered);
    } finally {
      previews.close();
      store.close();
    }
  });

test("Open Graph wins over document fallbacks, decodes entities and resolves relative media", () => {
  const result = parseMetadata(
    `<html><head>
    <title>Fallback</title>
    <meta name="twitter:title" content="Twitter title">
    <meta content="A &amp; B" property="og:title">
    <meta property="og:description" content="An &quot;example&quot; description">
    <meta property="og:site_name" content="Example">
    <meta property="og:image" content="/preview.jpg?a=1&amp;b=2">
    <meta property="og:image" content="/second.jpg">
    <meta property="og:video" content="//cdn.example.com/video.mp4">
    </head><body><meta property="og:title" content="Not metadata"></body></html>`,
    "https://example.com/post",
  );
  assert.deepEqual(result, {
    title: "A & B",
    description: 'An "example" description',
    siteName: "Example",
    imageUrl: "https://example.com/preview.jpg?a=1&b=2",
    video: true,
  });
});

test("Twitter cards and normal document metadata are supported without invented content", () => {
  assert.deepEqual(
    parseMetadata(
      '<head><title> Article </title><meta name="description" content="Some text"><meta name="twitter:image" content="thumb.png"></head>',
      "https://example.com/blog/post",
    ),
    {
      title: "Article",
      description: "Some text",
      siteName: "",
      imageUrl: "https://example.com/blog/thumb.png",
      video: false,
    },
  );
  assert.deepEqual(
    parseMetadata(
      "<html><body>No metadata</body></html>",
      "https://example.com",
    ),
    {
      title: "",
      description: "",
      siteName: "",
      imageUrl: null,
      video: false,
    },
  );
});

test("streamed metadata in the body supplies a link preview", () => {
  assert.deepEqual(
    parseMetadata(
      `<html><head><meta charset="utf-8"></head><body>
      <main>Page content</main>
      <script>const example = '<meta property="og:title" content="Not metadata">';</script>
      <title>Document title</title>
      <meta property="og:title" content="Streamed title">
      <meta property="og:description" content="Streamed description">
      <meta property="og:site_name" content="Example">
      <meta property="og:image" content="/og.png">
      </body></html>`,
      "https://example.com/post",
    ),
    {
      title: "Streamed title",
      description: "Streamed description",
      siteName: "Example",
      imageUrl: "https://example.com/og.png",
      video: false,
    },
  );
});

test("metadata cannot introduce executable or credential-bearing URLs", () => {
  const result = parseMetadata(
    '<meta property="og:image" content="javascript:alert(1)"><meta property="og:video" content="https://user:pass@example.com/video">',
    "https://example.com",
  );
  assert.equal(result.imageUrl, null);
  assert.equal(result.video, false);
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "http://example.com:47823",
    "https://user:pass@example.com",
  ])
    assert.throws(() => previewUrl(url));
});

test("preview connections exclude loopback, LAN, tailnet, mapped IPv4 and special-use addresses", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "100.100.100.100",
    "169.254.169.254",
    "224.0.0.1",
    "192.0.2.1",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:192.168.0.1",
    "fd7a:115c:a1e0::1",
    "fe80::1",
    "2001:db8::1",
    "64:ff9b::a00:1",
  ])
    assert.equal(publicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(publicAddress(address), true, address);
});
