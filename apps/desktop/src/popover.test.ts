import { test } from "node:test";
import assert from "node:assert/strict";
import { popoverBounds } from "./popover.ts";

test("a menu-bar popover stays compact and centered below its icon", () => {
  assert.deepEqual(
    popoverBounds(
      { x: 900, y: 0, width: 24, height: 24 },
      { x: 0, y: 24, width: 1440, height: 876 },
    ),
    { x: 697, y: 32, width: 430, height: 640 },
  );
});

test("a popover near the menu bar's right edge stays on its display", () => {
  const bounds = popoverBounds(
    { x: 1424, y: 0, width: 16, height: 24 },
    { x: 0, y: 24, width: 1440, height: 876 },
  );
  assert.equal(bounds.x + bounds.width, 1432);
  assert.equal(bounds.y, 32);
});

test("bottom and side taskbars anchor the popover inside the work area", () => {
  const area = { x: 0, y: 0, width: 1440, height: 860 };
  const bottom = popoverBounds(
    { x: 1300, y: 860, width: 24, height: 40 },
    area,
  );
  assert.equal(bottom.y + bottom.height, 852);
  const left = popoverBounds(
    { x: 0, y: 800, width: 40, height: 24 },
    { ...area, x: 40, width: 1400 },
  );
  assert.equal(left.x, 48);
});

test("a short secondary display uses its own origin and available height", () => {
  const bounds = popoverBounds(
    { x: -300, y: -200, width: 24, height: 24 },
    { x: -1024, y: -176, width: 1024, height: 560 },
  );
  assert.deepEqual(bounds, { x: -503, y: -168, width: 430, height: 544 });
});
