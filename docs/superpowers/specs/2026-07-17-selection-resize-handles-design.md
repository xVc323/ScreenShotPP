# Selection resize handles design

## Goal

Allow users to adjust a capture area after it has been selected by dragging any of its four sides. A small white circular handle centered on each side makes the interaction discoverable.

## Interaction

- Show four handles after a selection is locked: top, right, bottom, and left.
- Keep the handles visible regardless of the active annotation tool.
- Dragging a handle moves only its associated side; the opposite side remains fixed.
- Clamp each side to the viewport and preserve the editor's existing minimum selection size of 2 CSS pixels.
- Allow the resized selection to exclude or cut existing annotations. The existing selection clip controls what remains visible and exported.
- Releasing a handle finalizes the selection and repositions the toolbar through the existing selection callback.

## Architecture

Implement the handles as dedicated Konva nodes in the selection veil layer. This keeps pointer coordinates, rendering, hit testing, scaling, and lifecycle in the same canvas system as the existing selection rectangle.

The veil layer becomes listening-capable. Its shade rectangles and selection border remain non-listening; only the four handle nodes accept pointer input. Each handle has a white circular visual centered on a selection side and a sufficiently large hit target for reliable dragging.

The editor tracks the active side while a handle is being dragged. Pointer movement derives a new rectangle from the original opposite edge and the clamped pointer coordinate. Every update applies the rectangle to:

1. the current selection state;
2. the annotation group's clip;
3. the veil, border, and handle positions.

On pointer release, the editor clears the resize state and invokes `onSelectionDone` with a copy of the final rectangle. Existing consumers then reposition the toolbar. `selectionPhysicalRect()` and export need no separate data path because they already read the current selection.

## Boundaries and conflicts

Handle pointer events must not start annotation drawing, select an annotation, or trigger the initial selection flow. Event propagation from a handle is consumed before the stage-level tool behavior runs.

The annotation transformer remains separate. Selection handles are not transformer anchors and must remain visible even when a non-selection annotation tool is active.

The automatic window-selection path and `initialSelection` path both use the same locked-selection rendering, so both receive handles without special cases.

## Failure and cancellation behavior

- Pointer cancellation ends the resize gesture without leaving a stuck active handle. The last valid clamped rectangle remains selected.
- A missing pointer position leaves the current selection unchanged.
- Bounds and minimum-size clamping prevent inverted or degenerate rectangles.
- Destroying the editor removes the stage and existing global pointer listeners as before.

## Verification

Extend the editor's Konva test doubles to exercise listening nodes and pointer events. Add behavior tests covering:

- all four handles moving their corresponding edge while preserving the opposite edge;
- viewport and 2 px minimum-size bounds;
- `onSelectionDone` receiving the final resized rectangle;
- `selectionPhysicalRect()` reflecting the resized selection and scale;
- the selection clip updating when annotations may be cut;
- existing free selection and automatic window-selection behavior remaining unchanged.

Smoke-test the overlay by drawing a selection, dragging each side, switching annotation tools, and exporting the adjusted area.
