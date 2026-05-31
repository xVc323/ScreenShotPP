# README Demo GIF Exhaustive Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the deterministic Playwright README GIF so it visibly demonstrates every editing tool, custom color selection with an explicit hexadecimal value, undo/redo, `≤1MB` output sizing, and OCR while remaining strictly below 5,000,000 bytes.

**Architecture:** Keep the current browser-only demo renderer isolated under `docs/demo/`. Mirror the production overlay controls in `demo.html`, drive a deterministic timeline from `renderer.js`, expose semantic checkpoints for automated Playwright assertions, then regenerate the committed GIF with a size-enforcing FFmpeg pipeline.

**Tech Stack:** HTML/CSS, browser Canvas 2D, Node.js, Playwright 1.60.0, FFmpeg, ImageMagick.

---

## File structure

- Modify: `docs/demo/demo.html` — faithful toolbar markup and visual-only custom-color popover.
- Modify: `docs/demo/renderer.js` — deterministic 20–25 second storyline, drawing primitives, control-state renderer, cursor waypoints, and semantic checkpoints.
- Create: `docs/demo/verify.mjs` — Playwright assertions over deterministic checkpoints.
- Modify: `docs/demo/generate.sh` — run verification before capture and reject GIFs at or above 5,000,000 bytes.
- Modify: `docs/demo/README.md` — document the exhaustive storyline, validation command, and strict size budget.
- Replace: `docs/assets/screenshotpp-demo.gif` — generated README artifact.

The production overlay under `src/` remains read-only reference material.

---

### Task 1: Mirror the complete overlay controls in the deterministic demo

**Files:**
- Modify: `docs/demo/demo.html:27-68,103-137`
- Reference only: `src/overlay.html:12-60`
- Reference only: `src/overlay.css:1-75`

- [ ] **Step 1: Add faithful visual styles for the missing controls and color picker**

Add these rules beside the existing toolbar styles in `docs/demo/demo.html`:

```css
  .toolbar #thickness { width: 40px; padding: 0 5px; }
  .toolbar #undo, .toolbar #redo { min-width: 30px; }
  .toolbar #output-size { width: 80px; padding: 0 6px; }
  .toolbar select.changed { outline: 2px solid #4da3ff; }
  .toolbar button.flash { outline: 2px solid #4da3ff; }

  .cp-popover {
    position: absolute; z-index: 30; width: 212px; padding: 10px;
    background: #161b22; border: 1px solid #30363d; border-radius: 9px;
    box-shadow: 0 10px 30px rgba(0,0,0,.5); opacity: 0; transform: scale(.96);
    transform-origin: top left;
  }
  .cp-popover[hidden] { display: none; }
  .cp-sv { position: relative; height: 110px; border-radius: 5px;
    background: linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), #7c3aed; }
  .cp-sv-cursor, .cp-hue-cursor { position: absolute; border: 2px solid #fff; box-shadow: 0 0 0 1px #000; }
  .cp-sv-cursor { width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); }
  .cp-hue { position: relative; height: 12px; margin-top: 9px; border-radius: 5px;
    background: linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
  .cp-hue-cursor { top: -2px; width: 5px; height: 16px; border-radius: 3px; transform: translateX(-50%); }
  .cp-row { display: flex; gap: 8px; align-items: center; margin-top: 9px; }
  .cp-preview { width: 24px; height: 24px; border-radius: 50%; background: #7c3aed; border: 1px solid #30363d; }
  .cp-hex { flex: 1; height: 27px; padding: 0 7px; color: #e6edf3; background: #0d1117;
    border: 1px solid #30363d; border-radius: 5px; font: 13px ui-monospace, "SF Mono", Menlo, monospace; }
```

- [ ] **Step 2: Replace the abbreviated toolbar markup with the production control set**

Replace the existing toolbar block with:

```html
  <div class="toolbar" id="toolbar">
    <span class="drag-handle">⠿</span>
    <button class="tool" data-tool="select" title="Select/Move">▱</button>
    <button class="tool" data-tool="rect" title="Rectangle">▭</button>
    <button class="tool" data-tool="ellipse" title="Ellipse">◯</button>
    <button class="tool" data-tool="line" title="Line">╱</button>
    <button class="tool" data-tool="arrow" title="Arrow">↗</button>
    <button class="tool" data-tool="free" title="Pencil">✎</button>
    <button class="tool" data-tool="text" title="Text">A</button>
    <button class="tool" data-tool="bubble" title="Numbered bubble">①</button>
    <button class="tool" data-tool="mosaic" title="Mosaic blur">▦</button>
    <span class="sep"></span>
    <button class="swatch" data-color="#e5484d" style="background:#e5484d"></button>
    <button class="swatch" data-color="#4da3ff" style="background:#4da3ff"></button>
    <button class="swatch" data-color="#3fb950" style="background:#3fb950"></button>
    <button class="swatch" data-color="#f2cc60" style="background:#f2cc60"></button>
    <button class="swatch" data-color="#ffffff" style="background:#ffffff"></button>
    <button id="custom-color" class="custom-color" title="Custom color"></button>
    <select id="thickness" title="Thickness"><option>S</option><option selected>M</option><option>L</option><option>XL</option></select>
    <input id="fontsize" type="number" value="24" title="Text size" />
    <span class="sep"></span>
    <button id="undo" title="Undo">↶</button>
    <button id="redo" title="Redo">↷</button>
    <span class="sep"></span>
    <select id="output-size" title="Output size">
      <option>Full</option><option>≤5MB</option><option>≤2MB</option><option>≤1MB</option>
    </select>
    <button id="ocr-btn">OCR</button>
    <button id="copy-btn">Copy</button>
    <button id="save-btn">Save</button>
    <button id="cancel-btn">Cancel</button>
  </div>

  <div class="cp-popover" id="color-picker" hidden>
    <div class="cp-sv"><span class="cp-sv-cursor"></span></div>
    <div class="cp-hue"><span class="cp-hue-cursor"></span></div>
    <div class="cp-row"><span class="cp-preview"></span><input class="cp-hex" value="#7c3aed" readonly /></div>
  </div>
```

Keep the existing OCR panel immediately after this markup.

- [ ] **Step 3: Run structural checks**

Run:

```bash
node - <<'NODE'
const fs = require('node:fs');
const html = fs.readFileSync('docs/demo/demo.html', 'utf8');
for (const value of ['data-tool="select"','data-tool="rect"','data-tool="ellipse"','data-tool="line"','data-tool="arrow"','data-tool="free"','data-tool="text"','data-tool="bubble"','data-tool="mosaic"','id="color-picker"','≤1MB','id="undo"','id="redo"']) {
  if (!html.includes(value)) throw new Error(`missing ${value}`);
}
console.log('demo toolbar structure: OK');
NODE
git diff --check -- docs/demo/demo.html
```

Expected: `demo toolbar structure: OK` and no whitespace errors.

- [ ] **Step 4: Commit the complete visual toolbar**

```bash
git add docs/demo/demo.html
git commit \
  -m "Mirror the complete overlay surface in the deterministic demo" \
  -m "Constraint: The README walkthrough must show the real editing controls without modifying production UI." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: demo toolbar structure check; git diff --check" \
  -m "Not-tested: Timeline states are added in the next task."
```

---

### Task 2: Implement the exhaustive deterministic storyline

**Files:**
- Modify: `docs/demo/renderer.js:4-301`
- Reference only: `src/color-picker.js:1-112`
- Reference only: `src/editor/editor.js:31-541`

- [ ] **Step 1: Replace fixed annotation constants and geometry with exhaustive-demo state**

Use these constants and geometry members in `renderer.js`:

```js
const PURPLE = "#7c3aed";
const SEL_BLUE = "#168cff";
const VEIL = "rgba(0,0,0,0.45)";

// Inside build(), retain sheet and sel then add:
const rectAnn = { x: sel.x + 30, y: sel.y + 74, w: 250, h: 72 };
const ellipseAnn = { x: sel.x + 324, y: sel.y + 76, w: 170, h: 68 };
const lineAnn = { x1: sel.x + 548, y1: sel.y + 98, x2: sel.x + 760, y2: sel.y + 142 };
const arrowAnn = { x1: sel.x + 548, y1: sel.y + 214, x2: sel.x + 790, y2: sel.y + 180 };
const freeAnn = [
  [sel.x + 70, sel.y + 260], [sel.x + 110, sel.y + 235], [sel.x + 150, sel.y + 272],
  [sel.x + 195, sel.y + 238], [sel.x + 240, sel.y + 270],
];
const textAnn = { x: sel.x + 312, y: sel.y + 255, text: "Review before sharing" };
const bubbleAnn = { x: sel.x + 788, y: sel.y + 292 };
const mosAnn = { x: acct.x - 6, y: acct.y - 3, w: acct.w + 12, h: acct.h + 6 };
const movedRect = { x: rectAnn.x + 30, y: rectAnn.y + 18, w: rectAnn.w, h: rectAnn.h };

const btn = (s) => rectOf(s);
G = {
  sel, rectAnn, ellipseAnn, lineAnn, arrowAnn, freeAnn, textAnn, bubbleAnn, mosAnn, movedRect,
  btnSelect: btn('[data-tool="select"]'), btnRect: btn('[data-tool="rect"]'),
  btnEllipse: btn('[data-tool="ellipse"]'), btnLine: btn('[data-tool="line"]'),
  btnArrow: btn('[data-tool="arrow"]'), btnFree: btn('[data-tool="free"]'),
  btnText: btn('[data-tool="text"]'), btnBubble: btn('[data-tool="bubble"]'),
  btnMosaic: btn('[data-tool="mosaic"]'), btnCustom: btn('#custom-color'),
  btnUndo: btn('#undo'), btnRedo: btn('#redo'), btnOutput: btn('#output-size'), btnOcr: btn('#ocr-btn'),
};
```

- [ ] **Step 2: Replace the timeline with explicit checkpoints for every interaction**

Use this timeline:

```js
const T = {
  cursorIn: 0, selStart: 300, selEnd: 1150, settle: 1450,
  colorOpen: 1650, pickerMove: 2050, hexType: 2450, pickerClose: 3050,
  rectHi: 3250, rectStart: 3450, rectEnd: 3900,
  ellipseHi: 4100, ellipseStart: 4300, ellipseEnd: 4750,
  lineHi: 4950, lineStart: 5150, lineEnd: 5550,
  arrowHi: 5750, arrowStart: 5950, arrowEnd: 6350,
  freeHi: 6550, freeStart: 6750, freeEnd: 7350,
  textHi: 7550, textStart: 7750, textEnd: 8350,
  bubbleHi: 8550, bubble: 8800,
  mosaicHi: 9150, mosaicStart: 9350, mosaicEnd: 9850,
  selectHi: 10100, moveStart: 10300, moveEnd: 10800,
  undoHi: 11000, undo: 11200, redoHi: 11600, redo: 11800,
  outputHi: 12200, outputPick: 12400, outputHold: 13000,
  ocrHi: 13300, ocrPanel: 13600, hold: 14800,
};
```

Expose semantic checkpoints immediately after `T`:

```js
window.DEMO_CHECKPOINTS = {
  picker: T.hexType + 300,
  rectangle: T.rectEnd,
  ellipse: T.ellipseEnd,
  line: T.lineEnd,
  arrow: T.arrowEnd,
  pencil: T.freeEnd,
  text: T.textEnd,
  bubble: T.bubble + 250,
  mosaic: T.mosaicEnd,
  selectMove: T.moveEnd,
  undo: T.undo + 180,
  redo: T.redo + 180,
  output1mb: T.outputHold,
  ocr: T.hold,
};
```

The existing capture tail hold produces an approximately 16-second loop. If visual review shows that a control is unreadable, extend only that checkpoint and keep the total below 25 seconds.

- [ ] **Step 3: Add drawing helpers for the missing tool types**

Add these Canvas helpers beside `strokeRect()`:

```js
function strokeEllipse(r, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([]);
  ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
}
function strokeLine(a, color, w, arrow = false) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
  if (!arrow) return;
  const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), size = 13;
  ctx.beginPath(); ctx.moveTo(a.x2, a.y2);
  ctx.lineTo(a.x2 - size * Math.cos(angle - Math.PI / 6), a.y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(a.x2 - size * Math.cos(angle + Math.PI / 6), a.y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}
function strokeFree(points, reveal, color, w) {
  const count = Math.max(2, Math.ceil(points.length * reveal));
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
  points.slice(0, count).forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
}
function drawText(a, reveal, color) {
  ctx.fillStyle = color; ctx.font = "bold 20px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(a.text.slice(0, Math.ceil(a.text.length * reveal)), a.x, a.y);
}
```

- [ ] **Step 4: Render visual control states and annotations deterministically**

Update `window.seek(t)` so it:

1. opens `#color-picker` from `T.colorOpen` through `T.pickerClose`, animates `.cp-sv-cursor` and `.cp-hue-cursor`, and renders `.cp-hex` as `#7c3aed` after `T.hexType`;
2. highlights exactly one tool according to the current interval;
3. draws each annotation after its start time using `PURPLE`;
4. omits the moved rectangle between `T.undo` and `T.redo`, making undo and redo visible;
5. sets `#output-size.selectedIndex = 3` and adds `.changed` from `T.outputPick` onward;
6. shows the OCR panel from `T.ocrPanel` onward;
7. exposes a state summary:

```js
window.demoState = function (t) {
  const active = document.querySelector('.tool.active')?.dataset.tool || null;
  return {
    pickerOpen: !document.getElementById('color-picker').hidden,
    hex: document.querySelector('.cp-hex').value,
    active,
    output: document.getElementById('output-size').value,
    ocrVisible: Number(document.getElementById('ocr-panel').style.opacity) > 0.9,
    duration: window.DEMO_DURATION,
  };
};
```

Keep all cursor waypoints deterministic and direct the cursor to the relevant toolbar control before each drawing gesture.

- [ ] **Step 5: Run browser syntax and smoke checks**

Run:

```bash
node --check docs/demo/renderer.js
node docs/demo/capture.mjs
ls docs/demo/frames/f_*.png | wc -l
git diff --check -- docs/demo/demo.html docs/demo/renderer.js
```

Expected: JavaScript syntax passes, Playwright reports `done`, frame count is greater than 250, and no whitespace errors appear.

- [ ] **Step 6: Commit the exhaustive renderer**

```bash
git add docs/demo/demo.html docs/demo/renderer.js
git commit \
  -m "Tell the complete editing story in the README animation" \
  -m "Constraint: Every visible production tool must appear in one deterministic walkthrough." \
  -m "Rejected: Multiple GIFs | A single linear tutorial is easier to understand on the repository front page." \
  -m "Confidence: medium" \
  -m "Scope-risk: narrow" \
  -m "Tested: node syntax check; Playwright frame capture; git diff --check" \
  -m "Not-tested: Semantic checkpoint assertions and final GIF budget are added next."
```

---

### Task 3: Add semantic Playwright verification and strict GIF budget enforcement

**Files:**
- Create: `docs/demo/verify.mjs`
- Modify: `docs/demo/generate.sh:15-25`
- Modify: `docs/demo/README.md:1-25`

- [ ] **Step 1: Add semantic checkpoint assertions**

Create `docs/demo/verify.mjs`:

```js
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
assert.equal((await stateAt("output1mb")).output, "≤1MB");
assert.equal((await stateAt("ocr")).ocrVisible, true);
assert.ok((await stateAt("ocr")).duration >= 14000);
assert.ok((await stateAt("ocr")).duration <= 25000);

await browser.close();
console.log("demo semantic checkpoints: OK");
```

- [ ] **Step 2: Run verification and confirm it passes**

Run:

```bash
cd docs/demo
node verify.mjs
```

Expected: `demo semantic checkpoints: OK`.

- [ ] **Step 3: Make the generator verify semantics and enforce the README budget**

Update `docs/demo/generate.sh` after dependency installation and after GIF generation:

```bash
node verify.mjs
rm -rf frames palette.png
node capture.mjs

# existing FFmpeg commands remain here

bytes=$(stat -f%z ../assets/screenshotpp-demo.gif 2>/dev/null || stat -c%s ../assets/screenshotpp-demo.gif)
if (( bytes >= 5000000 )); then
  echo "README demo GIF is too large: $bytes bytes (must be under 5000000)" >&2
  exit 1
fi

rm -rf frames palette.png
echo "Wrote docs/assets/screenshotpp-demo.gif ($bytes bytes)"
```

- [ ] **Step 4: Document the exhaustive reproducible demo**

Update `docs/demo/README.md` to state:

```markdown
# README demo animation

`docs/assets/screenshotpp-demo.gif` is generated from a deterministic Playwright animation. It replays the full ScreenShotPP editing workflow over a sample financial sheet without recording a personal desktop.

The walkthrough shows region selection, custom color selection, explicit hexadecimal input (`#7c3aed`), all nine editing tools, undo/redo, `≤1MB` output sizing, and OCR. Save and Copy are intentionally omitted because they do not add useful visual information to the README.

## Regenerate and verify

```bash
bash docs/demo/generate.sh
```

The script installs Playwright + Chromium locally inside `docs/demo/` on first use, verifies semantic checkpoints, captures deterministic frames, assembles the GIF with FFmpeg, and rejects an artifact at or above 5,000,000 bytes.
```

Keep the existing file inventory section after this introduction.

- [ ] **Step 5: Run script and documentation checks**

Run:

```bash
bash -n docs/demo/generate.sh
cd docs/demo && node verify.mjs
cd ../.. && git diff --check -- docs/demo
```

Expected: shell syntax passes, `demo semantic checkpoints: OK`, and no whitespace errors.

- [ ] **Step 6: Commit the generator guard and semantic verifier**

```bash
git add docs/demo/verify.mjs docs/demo/generate.sh docs/demo/README.md
git commit \
  -m "Guard the README animation with semantic checks and a strict budget" \
  -m "Constraint: The richer walkthrough must remain reproducible and strictly below 5 MB." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: bash syntax; Playwright semantic checkpoints; git diff --check" \
  -m "Not-tested: Final generated GIF is committed in the next task."
```

---

### Task 4: Regenerate and visually approve the final README artifact

**Files:**
- Replace: `docs/assets/screenshotpp-demo.gif`
- Create temporarily then remove: `/tmp/screenshotpp-demo-contact-sheet.png`

- [ ] **Step 1: Generate the final GIF from scratch**

Run:

```bash
bash docs/demo/generate.sh
```

Expected: `Wrote docs/assets/screenshotpp-demo.gif (... bytes)` with a byte count below `5000000`.

- [ ] **Step 2: Verify dimensions, size, and release readiness**

Run:

```bash
identify 'docs/assets/screenshotpp-demo.gif[0]' | head -1
bytes=$(stat -f%z docs/assets/screenshotpp-demo.gif 2>/dev/null || stat -c%s docs/assets/screenshotpp-demo.gif)
test "$bytes" -lt 5000000
scripts/check-release-readiness.sh
git diff --check
```

Expected: first frame dimensions are readable at README scale, byte assertion passes, release readiness prints `release readiness: OK`, and no whitespace errors appear.

- [ ] **Step 3: Build a contact sheet covering the full storyline**

Run:

```bash
rm -rf /tmp/screenshotpp-demo-frames
mkdir -p /tmp/screenshotpp-demo-frames
magick docs/assets/screenshotpp-demo.gif -coalesce /tmp/screenshotpp-demo-frames/frame-%03d.png
frames=(/tmp/screenshotpp-demo-frames/frame-*.png)
count=${#frames[@]}
indexes=(0 $((count*1/12)) $((count*2/12)) $((count*3/12)) $((count*4/12)) $((count*5/12)) $((count*6/12)) $((count*7/12)) $((count*8/12)) $((count*9/12)) $((count*10/12)) $((count*11/12)) $((count-1)))
selected=()
for index in "${indexes[@]}"; do selected+=("${frames[$index]}"); done
magick "${selected[@]}" +append /tmp/screenshotpp-demo-contact-sheet.png
```

Inspect `/tmp/screenshotpp-demo-contact-sheet.png`. Confirm the sheet contains the picker with `#7c3aed`, distinct annotation states for all nine tools, undo/redo, `≤1MB`, and OCR.

- [ ] **Step 4: Commit only the generated GIF**

Do not stage the user's existing `.gitignore` modification.

```bash
git add docs/assets/screenshotpp-demo.gif
git commit \
  -m "Show the complete ScreenShotPP workflow on the repository front page" \
  -m "Constraint: The committed README GIF must stay strictly below 5 MB." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Tested: deterministic regeneration; GIF byte budget; visual contact sheet; release readiness; git diff --check" \
  -m "Not-tested: GitHub rendering is verified after the local commit is pushed."
```

---

### Task 5: Run final scope and repository validation

**Files:**
- Verify only: `docs/demo/demo.html`
- Verify only: `docs/demo/renderer.js`
- Verify only: `docs/demo/verify.mjs`
- Verify only: `docs/demo/generate.sh`
- Verify only: `docs/demo/README.md`
- Verify only: `docs/assets/screenshotpp-demo.gif`

- [ ] **Step 1: Run the deterministic demo validation suite**

Run:

```bash
bash -n docs/demo/generate.sh
cd docs/demo && node verify.mjs
cd ../.. && scripts/check-release-readiness.sh
git diff --check
```

Expected: semantic checkpoints and release readiness pass with no whitespace errors.

- [ ] **Step 2: Confirm the GIF size and scoped history**

Run:

```bash
bytes=$(stat -f%z docs/assets/screenshotpp-demo.gif 2>/dev/null || stat -c%s docs/assets/screenshotpp-demo.gif)
printf 'gif_bytes=%s\n' "$bytes"
test "$bytes" -lt 5000000
git status --short
git --no-pager log --oneline -6
```

Expected: GIF is below `5000000`; only the pre-existing user-owned `.gitignore` change remains unstaged; recent commits contain the spec, plan, demo source changes, verifier, generator guard, and generated GIF.

- [ ] **Step 3: Review the final diff against the design**

Run:

```bash
git diff origin/master...HEAD -- docs/superpowers/specs/2026-05-31-readme-demo-exhaustive-design.md docs/superpowers/plans/2026-05-31-readme-demo-exhaustive.md docs/demo docs/assets/screenshotpp-demo.gif --stat
git status --short
```

Expected: changes remain limited to documentation, deterministic demo assets, and the generated GIF. The user's `.gitignore` modification remains outside the demo commits.
