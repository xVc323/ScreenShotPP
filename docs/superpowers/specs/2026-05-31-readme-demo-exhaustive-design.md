# README demo GIF — Exhaustive walkthrough design

- **Date:** 2026-05-31
- **Status:** Approved design
- **Scope:** README product demo only. No application behavior changes.
- **Existing generator:** `docs/demo/` deterministic Playwright renderer and frame capture pipeline.

## 1. Goal

Replace the current README GIF with a deterministic, exhaustive ScreenShotPP walkthrough that demonstrates the complete editing surface clearly while remaining below 1 MB.

The demo must use the existing Playwright-based generator rather than recording the desktop application manually. This keeps regeneration reproducible and avoids exposing personal desktop content.

## 2. Storyline

The animation follows one linear tutorial over the existing sample financial sheet:

1. select a capture region;
2. open the custom color picker;
3. move the picker controls to show arbitrary color selection;
4. type an explicit hexadecimal value, `#7c3aed`;
5. use each of the nine editing tools in a visible, meaningful way:
   - select / move;
   - rectangle;
   - ellipse;
   - line;
   - arrow;
   - pencil;
   - text;
   - numbered bubble;
   - mosaic blur;
6. show undo and redo briefly;
7. switch output size from `Full` to `≤1MB`;
8. open the OCR panel and end with the recognized text visible.

`Save` and `Copy` are intentionally excluded: they do not add useful visual information to the README demo.

## 3. Visual principles

- Preserve the current 1280×720 sample financial sheet and faithful overlay styling.
- Keep the cursor visible and move it through deterministic waypoints.
- Highlight active controls so each interaction remains understandable at README scale.
- Use the custom purple `#7c3aed` for annotations created after color selection.
- Avoid excessive overlap: each tool receives a distinct target area.
- Hold key states briefly: picker with hex value, undo/redo, `≤1MB`, and OCR panel.
- Target a 20–25 second loop.

## 4. Implementation boundaries

Changes are limited to the deterministic demo assets:

- `docs/demo/demo.html`
- `docs/demo/renderer.js`
- `docs/demo/README.md`
- optionally `docs/demo/generate.sh` if encoding tuning is required
- generated `docs/assets/screenshotpp-demo.gif`

The real overlay under `src/` is reference-only and must not be modified.

## 5. Rendering and size constraint

`docs/demo/capture.mjs` continues to seek deterministic timeline timestamps and capture PNG frames with Playwright. `docs/demo/generate.sh` assembles the frames using FFmpeg palette generation and palette application.

The final GIF must be strictly smaller than 1,000,000 bytes. If the first render exceeds that threshold, reduce encoding cost in this order while preserving clarity:

1. lower frame rate modestly;
2. reduce output width modestly;
3. shorten transitional movements and holds;
4. tune palette/dithering only if required.

The generator must fail when the generated GIF is at least 1,000,000 bytes so the size constraint remains enforceable.

## 6. Validation

A completed demo passes when:

- `bash docs/demo/generate.sh` regenerates the GIF from scratch;
- `docs/assets/screenshotpp-demo.gif` is strictly below 1,000,000 bytes;
- a contact sheet sampled across the timeline visibly confirms all nine tools, the picker, the hexadecimal input, undo/redo, `≤1MB`, and OCR;
- `scripts/check-release-readiness.sh` passes;
- `git diff --check` passes;
- no unrelated user changes are included in the demo commit.
