import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByteRange } from "./range.ts";

test("video clients can read bounded, open-ended and suffix ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange("bytes=50-", 100), { start: 50, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=90-999", 100), { start: 90, end: 99 });
});
test("unsatisfiable or multipart ranges are rejected", () => {
  for (const range of [
    "bytes=100-",
    "bytes=3-2",
    "bytes=-0",
    "bytes=0-1,4-5",
    "bytes=-",
    "items=1-2",
  ])
    assert.equal(parseByteRange(range, 100), null);
  assert.equal(parseByteRange("bytes=0-", 0), null);
});
