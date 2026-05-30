import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditableTarget, shouldCloseOcrPanel } from "./editable-target.js";

test("détecte les champs qui doivent conserver leurs raccourcis clavier", () => {
  assert.equal(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableTarget({ isContentEditable: true }), true);
});

test("détecte les descendants d'une zone contenteditable", () => {
  assert.equal(isEditableTarget({ closest: (selector) => selector === "[contenteditable='true']" }), true);
});

test("laisse les raccourcis globaux actifs hors édition", () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget({ tagName: "BUTTON" }), false);
});

test("Escape ferme le panneau OCR ouvert quel que soit l'élément focalisé", () => {
  assert.equal(shouldCloseOcrPanel({ key: "Escape", target: { tagName: "BUTTON" } }, false), true);
  assert.equal(shouldCloseOcrPanel({ key: "Escape", target: { tagName: "TEXTAREA" } }, false), true);
  assert.equal(shouldCloseOcrPanel({ key: "Escape" }, true), false);
  assert.equal(shouldCloseOcrPanel({ key: "Enter" }, false), false);
});
