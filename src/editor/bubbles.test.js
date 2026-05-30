import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleNumberAt } from "./bubbles.js";

const A = [
  { type: "rect" },
  { type: "bubble" },
  { type: "arrow" },
  { type: "bubble" },
  { type: "bubble" },
];

test("rang 1-based parmi les bulles", () => {
  assert.equal(bubbleNumberAt(A, 1), 1);
  assert.equal(bubbleNumberAt(A, 3), 2);
  assert.equal(bubbleNumberAt(A, 4), 3);
});

test("null si l'index n'est pas une bulle", () => {
  assert.equal(bubbleNumberAt(A, 0), null);
  assert.equal(bubbleNumberAt(A, 2), null);
});

test("renumérotation après suppression simulée", () => {
  const B = A.filter((_, i) => i !== 1); // retire la 1re bulle → [rect, arrow, bubble, bubble]
  assert.equal(bubbleNumberAt(B, 2), 1);
  assert.equal(bubbleNumberAt(B, 3), 2);
});
