import { test } from "node:test";
import assert from "node:assert/strict";
import { messageLinks, firstLink, visibleMessageLinks } from "./links.ts";

test("link extraction preserves message text and trims prose punctuation", () => {
  const text =
    "See (https://example.com/wiki/Example_(test)). Then https://example.org/?a=1&b=2!";
  const parts = messageLinks(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(
    parts.filter((part) => part.url).map((part) => part.url),
    ["https://example.com/wiki/Example_(test)", "https://example.org/?a=1&b=2"],
  );
  assert.equal(firstLink(text), "https://example.com/wiki/Example_(test)");
});

test("credentials and non-web schemes are never link-preview targets", () => {
  assert.equal(
    firstLink(
      "file:///secret javascript:alert(1) https://user:pass@example.com/",
    ),
    undefined,
  );
  assert.equal(
    firstLink("HTTPS://EXAMPLE.COM/post"),
    "https://example.com/post",
  );
});

test("a preview hides only its URL, preserving captions and other links", () => {
  const text = "See https://example.com/post\nAnother: https://example.org/";
  assert.equal(
    visibleMessageLinks(text, "https://example.com/post")
      .map((part) => part.text)
      .join(""),
    "See \nAnother: https://example.org/",
  );
  assert.equal(
    visibleMessageLinks(text)
      .map((part) => part.text)
      .join(""),
    text,
  );
  assert.equal(
    visibleMessageLinks(
      "https://example.com/post",
      "https://example.com/post",
    ).some((part) => part.text.trim()),
    false,
  );
});
