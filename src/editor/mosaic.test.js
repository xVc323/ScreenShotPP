import { test } from "node:test";
import assert from "node:assert/strict";
import { mosaicCrop } from "./mosaic.js";

test("crop en pixels source à partir du descripteur et de l'échelle", () => {
  const d = { x: 10, y: 20, width: 30, height: 40, cropX: 20, cropY: 40 };
  assert.deepEqual(mosaicCrop(d, 2), { x: 20, y: 40, width: 60, height: 80 });
});

test("échelle 1 : crop = dimensions du descripteur", () => {
  const d = { x: 5, y: 6, width: 7, height: 8, cropX: 5, cropY: 6 };
  assert.deepEqual(mosaicCrop(d, 1), { x: 5, y: 6, width: 7, height: 8 });
});

test("dimensions arrondies", () => {
  const d = { x: 0, y: 0, width: 10.4, height: 10.6, cropX: 3.2, cropY: 3.8 };
  assert.deepEqual(mosaicCrop(d, 1.5), { x: 3, y: 4, width: 16, height: 16 });
});
