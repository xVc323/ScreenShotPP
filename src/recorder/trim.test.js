import { test } from "node:test";
import assert from "node:assert/strict";
import { clampTrim, effectiveDuration } from "./trim.js";

test("clampTrim keeps start before end with a minimum gap", () => {
  assert.deepStrictEqual(clampTrim(5, 4, 10), { start: 4, end: 4.1 });
  assert.deepStrictEqual(clampTrim(-1, 20, 10), { start: 0, end: 10 });
  assert.deepStrictEqual(clampTrim(2, 8, 10), { start: 2, end: 8 });
});

test("effectiveDuration accounts for speed", () => {
  assert.strictEqual(effectiveDuration(2, 8, 2), 3);
  assert.strictEqual(effectiveDuration(0, 10, 1), 10);
});
