import { test } from "node:test";
import assert from "node:assert/strict";
import { keyEventToAccelerator } from "./accelerator.js";

test("Cmd+Shift+2", () => {
  assert.equal(
    keyEventToAccelerator({ metaKey: true, shiftKey: true, key: "2", code: "Digit2" }),
    "CmdOrCtrl+Shift+2"
  );
});

test("Ctrl+A", () => {
  assert.equal(keyEventToAccelerator({ ctrlKey: true, key: "a", code: "KeyA" }), "Ctrl+A");
});

test("modificateurs seuls → null", () => {
  assert.equal(keyEventToAccelerator({ shiftKey: true, key: "Shift", code: "ShiftLeft" }), null);
});

test("Alt+F5", () => {
  assert.equal(keyEventToAccelerator({ altKey: true, key: "F5", code: "F5" }), "Alt+F5");
});
