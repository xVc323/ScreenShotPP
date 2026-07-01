# TODO — ScreenShotPP improvements

Sorted by priority / effort. Each item keeps its open technical question where one exists.

## High priority (stability / blockers)

- [x] **Fix the Windows capture crash (0xc0000409, WGC FFI)** — shipped in v0.2.2
      Root cause: `windows-capture` panicked when driven from the main GUI thread
      (it already owns a DispatcherQueue / COM apartment), and the panic crossed the
      FFI boundary, aborting the process. Fixed by running WGC capture on a dedicated
      thread, with `catch_unwind` turning any residual panic into an `Err`
      (`capture_win.rs`).
  - [ ] Remaining: a regression test for the dedicated-thread / panic-isolation
        path. The pure `frame_to_rgba` part is unit-tested; the thread + panic
        behavior is OS integration and hard to cover reliably.
- [ ] **Sign the Windows binary** (SignPath Foundation application)
      Removes the SmartScreen warning and unblocks real-world adoption.
      Note: the existing `windows-x86_64` signature in the release workflow is the
      Tauri updater signature (update integrity), not Authenticode code signing.
      Blocked on an external dependency: the SignPath application can only be filed
      after the first public release.

## Planned features

- [x] **Delayed capture / timer** — shipped in v0.3.0, Windows fixes in v0.3.1
      Dedicated configurable shortcut (default `⌘⇧3` / `Ctrl⇧3`) starts a
      cursor-following, click-through countdown (configurable delay, configurable
      cancel key), then captures and opens the editing overlay. Windows follow-ups
      in v0.3.1: fixed a global-shortcut re-entrancy freeze, a missing countdown
      window capability (number stuck at 3), and a stray window shadow.

- [ ] **Capture a window that extends beyond the monitor bounds**
      Impl: capture the active window via `xcap::Window` instead of cropping the
      monitor, so the off-screen part is included.
      Open question: multi-monitor + mixed-DPI behavior for this mode.

- [ ] **Video / short GIF recording**
      Large feature (competes with ShareX / CleanShot).
      Open questions: encoder (bundled ffmpeg? OS API?), binary size, continuous
      capture performance, output format (mp4 / gif / animated webp).

- [ ] **Capture history**
      Persist each copied/saved capture to a dedicated folder plus an index, with a
      small gallery window to re-copy or re-open.
      Open questions: storage location, size limit, automatic pruning.

- [ ] **Highlighter** — small
      Semi-transparent yellow rectangle using `globalCompositeOperation = 'multiply'`
      in the Konva editor. Content under the stroke stays readable.

## Large / long-term

- [ ] **Native Rust UI (drop the webview)**
      Today the UI is HTML/CSS/JS in a Tauri webview, which costs ~110-120 MB RAM.
      Goal: a fully native Rust GUI for a much lighter footprint.
      Scope: this is close to a full rewrite, and cross-platform native GUI is the
      hard part. The Konva-based annotation editor (overlay, shapes, text, bubbles,
      mosaic, transformer) would need reimplementing in the chosen toolkit.
      Candidate toolkits: `egui` (immediate-mode, easiest for a canvas/annotation
      tool), `iced`, or `slint`. The pure logic already extracted into
      `screenshotpp-core` (geometry, countdown, settings) would carry over unchanged.
      Open questions: which toolkit; transparent always-on-top overlay + per-monitor
      sizing parity with the current window; text input/IME; tray integration;
      effort vs. payoff.

## Out of scope (decided 2026-06-30)

- Arbitrary / background window picker — impossible on a frozen image, and
  per-window capture is too heavy for the benefit.
- Gaussian blur — adds almost nothing over the existing mosaic redaction.
- "Auto" step counter — already provided by the existing numbered bubbles.
- Grid snapping for shapes — low value for a fast capture workflow.
- SVG / vector export — not needed.

## Quality (non-feature)

- [x] Extract pure logic into a GUI-free `screenshotpp-core` crate — geometry,
      countdown, and settings now unit-test locally without the Tauri toolchain
      (`cargo test -p screenshotpp-core`).
- [x] Split CI into a fast pure-logic job (~45 s) and the full platform builds;
      Windows uses the D: drive for cargo.
- [ ] Integration tests for the overlay (`overlay.js`, `editor.js` are uncovered).
      Runtime bugs (e.g. the v0.3.1 Windows freeze) slip past CI because it only
      runs `cargo test --lib` / node logic tests — a real gap.
- [ ] Split `editor/editor.js` (706 lines) by tool.
- [ ] Improve permission / OCR error messages.
