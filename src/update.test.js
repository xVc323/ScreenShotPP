import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldNotify } from "./update.js";

test("auto: suppressed when available equals skipped", () => {
  assert.equal(shouldNotify("0.4", "0.4", { auto: true }), false);
});

test("auto: shown when available differs from skipped", () => {
  assert.equal(shouldNotify("0.5", "0.4", { auto: true }), true);
});

test("auto: shown when nothing skipped", () => {
  assert.equal(shouldNotify("0.4", null, { auto: true }), true);
});

test("manual: always shown even if skipped", () => {
  assert.equal(shouldNotify("0.4", "0.4", { auto: false }), true);
});

test("no available version: never shown", () => {
  assert.equal(shouldNotify(null, null, { auto: true }), false);
  assert.equal(shouldNotify(null, "0.3", { auto: false }), false);
});
