import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto("file://" + join(here, "demo.html"));
await page.waitForFunction("window.__demoReady === true", null, { timeout: 15000 });

const checkpoints = await page.evaluate(() => window.DEMO_CHECKPOINTS);
const stateAt = async (name) => page.evaluate((time) => { window.seek(time); return window.demoState(time); }, checkpoints[name]);

const picker = await stateAt("picker");
assert.equal(picker.pickerOpen, true);
assert.equal(picker.hex, "#7c3aed");
for (const [checkpoint, tool] of Object.entries({ rectangle: "rect", ellipse: "ellipse", line: "line", arrow: "arrow", pencil: "free", text: "text", bubble: "bubble", mosaic: "mosaic", selectMove: "select" })) {
  assert.equal((await stateAt(checkpoint)).active, tool, `${checkpoint} should activate ${tool}`);
}
const move = await stateAt("selectMove");
assert.equal(move.rectMoved, true);
const undo = await stateAt("undo");
assert.equal(undo.undoFlash, true);
assert.equal(undo.rectMoved, false);
const redo = await stateAt("redo");
assert.equal(redo.redoFlash, true);
assert.equal(redo.rectMoved, true);
assert.equal((await stateAt("output1mb")).output, "≤1MB");
const ocr = await stateAt("ocr");
assert.equal(ocr.ocrVisible, true);
assert.ok(ocr.duration >= 20000);
assert.ok(ocr.duration <= 25000);

await browser.close();
console.log("demo semantic checkpoints: OK");
