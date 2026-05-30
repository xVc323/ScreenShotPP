import { test } from "node:test";
import assert from "node:assert/strict";
import { clampHex, hsvToRgb, hsvToHex, hexToHsv } from "./color.js";

test("clampHex normalise les formes valides", () => {
  assert.equal(clampHex("#abc"), "#aabbcc");
  assert.equal(clampHex("ABCDEF"), "#abcdef");
  assert.equal(clampHex("#A1B2C3"), "#a1b2c3");
});

test("clampHex rejette l'invalide", () => {
  assert.equal(clampHex("xyz"), null);
  assert.equal(clampHex("#12"), null);
  assert.equal(clampHex(""), null);
});

test("hsvToHex sur les couleurs primaires", () => {
  assert.equal(hsvToHex(0, 1, 1), "#ff0000");
  assert.equal(hsvToHex(120, 1, 1), "#00ff00");
  assert.equal(hsvToHex(240, 1, 1), "#0000ff");
  assert.equal(hsvToHex(0, 0, 1), "#ffffff");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
});

test("hsvToRgb borne les valeurs 0-255", () => {
  const [r, g, b] = hsvToRgb(60, 1, 1);
  assert.deepEqual([r, g, b], [255, 255, 0]);
});

test("hexToHsv puis hsvToHex font un aller-retour fidèle", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#123456", "#abcdef", "#000000", "#ffffff"]) {
    const { h, s, v } = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
});

test("hexToHsv renvoie null sur entrée invalide", () => {
  assert.equal(hexToHsv("nope"), null);
});
