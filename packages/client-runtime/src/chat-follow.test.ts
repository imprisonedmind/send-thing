import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatFollow } from "./chat-follow.ts";

test("initial history and delayed media preserve bottom following", () => {
  const follow = createChatFollow();
  follow.onScroll(0, 600, 600);
  follow.onScroll(0, 2400, 600);
  assert.equal(follow.active, true);
  follow.onScroll(1800, 2400, 600);
  follow.onScroll(1800, 3000, 600);
  assert.equal(follow.active, true);
});

test("keyboard and composer resizing do not cancel following", () => {
  const follow = createChatFollow();
  follow.onScroll(1800, 2400, 600);
  follow.onScroll(1800, 2600, 400);
  assert.equal(follow.active, true);
  follow.onScroll(2200, 2600, 400);
  follow.onScroll(2000, 2600, 600);
  assert.equal(follow.active, true);
});

test("reading older messages stays put through new messages and media layout", () => {
  const follow = createChatFollow();
  follow.onScroll(1800, 2400, 600);
  follow.onScroll(1700, 2400, 600, true);
  assert.equal(follow.active, false);
  follow.onScroll(1700, 3000, 600);
  follow.onScroll(1750, 3000, 600);
  assert.equal(follow.active, false);
  follow.onScroll(2400, 3000, 600);
  assert.equal(follow.active, true);
});

test("programmatic corrections do not masquerade as a user scrolling up", () => {
  const follow = createChatFollow();
  follow.onScroll(1800, 2400, 600);
  follow.onScroll(1700, 2400, 600);
  assert.equal(follow.active, true);
  follow.onScroll(1600, 2400, 600, true);
  assert.equal(follow.active, false);
});

test("sending resumes following even if the message arrived before the send response", () => {
  const follow = createChatFollow();
  follow.pause();
  follow.onScroll(100, 3000, 600);
  assert.equal(follow.active, false);
  follow.resume();
  follow.onScroll(100, 3000, 600);
  assert.equal(follow.active, true);
});
