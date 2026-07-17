import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCrop, displayToVideo } from "./crop.js";

test("clampCrop bounds the rect to the video and floors to integers", () => {
  assert.deepStrictEqual(
    clampCrop({ x: -5, y: 2.7, width: 2000, height: 50 }, 640, 480),
    { x: 0, y: 2, width: 640, height: 50 }
  );
});

test("displayToVideo scales display-space rect into video pixels", () => {
  // vidéo 1280x720 affichée en 640x360 → facteur 2
  assert.deepStrictEqual(
    displayToVideo({ x: 10, y: 20, width: 100, height: 50 }, 640, 360, 1280, 720),
    { x: 20, y: 40, width: 200, height: 100 }
  );
});
