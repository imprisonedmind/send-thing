import { test } from "node:test";
import assert from "node:assert/strict";
import { structuredData, serializeStructuredData } from "./structured-data.ts";
import { questions, title, description } from "./site-content.ts";

test("structured answers match the visible content and refer to the canonical site", () => {
  const url = new URL("https://send-thing.lukestephens.co.za/");
  const image = new URL("/social/send-thing-og.jpg", url);
  const { "@graph": graph } = structuredData(url, title, description, image);
  assert.equal(
    graph.find((item) => item["@type"] === "WebPage")?.url,
    url.href,
  );
  const faq = graph.find((item) => item["@type"] === "FAQPage");
  assert.deepEqual(
    faq?.mainEntity,
    questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  );
  const app = graph.find((item) => item["@type"] === "SoftwareApplication");
  assert.equal(app?.operatingSystem?.includes("iOS"), false);
  assert.equal("aggregateRating" in app!, false);
});

test("structured data cannot close its script element through content", () => {
  const content = { description: "</script><script>alert(1)</script>" };
  const serialized = serializeStructuredData(content);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), content);
});
