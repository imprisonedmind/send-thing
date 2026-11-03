import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetadata, previewUrl, publicAddress } from "./link-preview.ts";

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
