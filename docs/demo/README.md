# README demo animation

`docs/assets/screenshotpp-demo.gif` is generated from a deterministic Playwright animation. It replays the full ScreenShotPP editing workflow over a sample financial sheet without recording a personal desktop.

The walkthrough shows region selection, custom color selection, explicit hexadecimal input (`#7c3aed`), all nine editing tools, undo/redo, `≤1MB` output sizing, and OCR. Save and Copy are intentionally omitted because they do not add useful visual information to the README.

## Files

- `demo.html` — the sample "captured screen" (a financial statement) plus faithful visual markup for the ScreenShotPP overlay UI.
- `renderer.js` — a deterministic renderer exposing `window.seek(t_ms)` and semantic checkpoints; it draws the editing storyline on a canvas and toggles toolbar, picker, output-size, and OCR states.
- `verify.mjs` — Playwright assertions for picker, hex value, all nine tools, undo/redo, `≤1MB`, OCR, and timeline duration.
- `capture.mjs` — Playwright script that loads the page off-screen and screenshots one PNG per frame by seeking the timeline without real-time flakiness.
- `generate.sh` — verifies checkpoints, captures frames, assembles the GIF with FFmpeg, and atomically replaces the README asset only when it is below 5 MB.

## Regenerate and verify

```bash
bash docs/demo/generate.sh
```

The first run installs Playwright + Chromium locally inside `docs/demo/`. The script rejects a generated artifact at or above 5,000,000 bytes. `node_modules/`, package files, and frame artifacts are git-ignored.

To change the storyline, edit the timeline constants (`T`) and target geometry in `renderer.js`.
