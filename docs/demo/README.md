# README demo animation

`docs/assets/screenshotpp-demo.gif` is generated from a deterministic browser
animation that replays the ScreenShotPP workflow over a sample financial sheet.
It reuses the real overlay UI (toolbar from `overlay.css`, selection veil, shapes,
numbered bubbles, mosaic and OCR panel styled like the live app), so the GIF stays
faithful without screen-recording the app by hand.

## Files

- `demo.html` — the sample "captured screen" (a financial statement) plus the
  ScreenShotPP overlay UI markup.
- `renderer.js` — a deterministic renderer exposing `window.seek(t_ms)`; it draws
  the selection, rectangle, mosaic, numbered bubbles, connected label and cursor
  on a canvas and toggles the toolbar / OCR panel based on a fixed timeline.
- `capture.mjs` — Playwright script that loads the page off-screen and screenshots
  one PNG per frame by seeking the timeline (no real-time flakiness).
- `generate.sh` — runs the capture then assembles the optimized GIF with ffmpeg.

## Regenerate

```bash
bash docs/demo/generate.sh
```

First run installs Playwright + Chromium locally inside `docs/demo/`. The script
writes `docs/assets/screenshotpp-demo.gif` (960px wide, ~0.5 MB) and cleans up its
intermediate frames. `node_modules/` and frame artifacts are git-ignored.

To change the storyline, edit the timeline constants (`T`) and target geometry in
`renderer.js`.
