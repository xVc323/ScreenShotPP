import { test } from "node:test";
import assert from "node:assert/strict";
import { History } from "./history.js";

test("commence vide, pas d'undo/redo", () => {
  const h = new History();
  assert.deepEqual(h.current(), []);
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});

test("push active l'undo et change l'état courant", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  assert.equal(h.canUndo(), true);
  assert.deepEqual(h.current(), [{ id: 1 }]);
});

test("undo puis redo parcourent l'historique", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  h.push([{ id: 1 }, { id: 2 }]);
  assert.deepEqual(h.undo(), [{ id: 1 }]);
  assert.equal(h.canRedo(), true);
  assert.deepEqual(h.redo(), [{ id: 1 }, { id: 2 }]);
});

test("push après undo tronque le redo", () => {
  const h = new History();
  h.push([{ id: 1 }]);
  h.push([{ id: 1 }, { id: 2 }]);
  h.undo();
  h.push([{ id: 1 }, { id: 3 }]);
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.current(), [{ id: 1 }, { id: 3 }]);
});

test("les snapshots sont isolés (pas d'aliasing)", () => {
  const h = new History();
  const a = [{ id: 1 }];
  h.push(a);
  a[0].id = 999;
  assert.deepEqual(h.current(), [{ id: 1 }]);
});
