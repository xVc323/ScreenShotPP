import { test } from "node:test";
import assert from "node:assert/strict";

import { fitScale } from "./fit.js";

test("content that fits is centered at scale one", () => {
  const f = fitScale([200, 100], [1000, 800]);
  assert.equal(f.scale, 1.0);
  assert.deepEqual({ width: f.width, height: f.height }, { width: 200, height: 100 });
  assert.deepEqual({ x: f.x, y: f.y }, { x: 400, y: 350 });
});

test("taller than viewport scales down to height", () => {
  // 500x1600 into 1000x800 → limited by height: scale 0.5.
  const f = fitScale([500, 1600], [1000, 800]);
  assert.equal(f.scale, 0.5);
  assert.deepEqual({ width: f.width, height: f.height }, { width: 250, height: 800 });
  assert.equal(f.x, (1000 - 250) / 2);
  assert.equal(f.y, 0);
});
