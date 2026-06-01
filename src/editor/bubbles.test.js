import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleNumberAt, bubbleConnectorEnd } from "./bubbles.js";

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

test("le trait s'arrête au bord du cercle, jamais sur la bulle", () => {
  // cartouche droit au-dessus (offset par défaut) → extrémité = haut du cercle
  assert.deepEqual(bubbleConnectorEnd(0, -64, 15), [0, -15]);
  // cartouche à droite → extrémité = bord droit
  assert.deepEqual(bubbleConnectorEnd(100, 0, 15), [15, 0]);
  // distance de l'extrémité au centre = rayon, quelle que soit la direction
  const [x, y] = bubbleConnectorEnd(30, 40, 15); // hypot(30,40)=50
  assert.equal(Math.round(Math.hypot(x, y)), 15);
  assert.deepEqual([x, y], [9, 12]);
});

test("offset nul → extrémité au centre (pas de division par zéro)", () => {
  assert.deepEqual(bubbleConnectorEnd(0, 0, 15), [0, 0]);
});
