import { test } from "node:test";
import assert from "node:assert/strict";

class FakeNode {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.handlers = new Map();
  }

  add() {}
  draw() {}
  destroyChildren() {}
  clip() {}
  on(name, handler) { this.handlers.set(name, handler); }
}

class FakeStage extends FakeNode {
  constructor(attrs) {
    super(attrs);
    globalThis.stage = this;
  }

  getPointerPosition() { return this.pointer; }
  emit(name) { this.handlers.get(name)?.({ evt: { button: 0 } }); }
}

class FakeTransformer extends FakeNode {}

globalThis.window = {
  innerWidth: 100,
  innerHeight: 80,
  Konva: {
    Stage: FakeStage,
    Layer: FakeNode,
    Group: FakeNode,
    Transformer: FakeTransformer,
    Rect: FakeNode,
    Image: FakeNode,
  },
  addEventListener() {},
  removeEventListener() {},
};

const { createEditor } = await import("./editor.js");

test("selectionPhysicalRect renvoie null sans sélection puis arrondit selon l'échelle", () => {
  const editor = createEditor({ container: "stage", scale: 2.5 });
  assert.equal(editor.selectionPhysicalRect(), null);

  stage.pointer = { x: 2.2, y: 3.4 };
  stage.emit("pointerdown");
  stage.pointer = { x: 8.2, y: 9.8 };
  stage.emit("pointermove");
  stage.emit("pointerup");

  assert.deepEqual(editor.selectionPhysicalRect(), { x: 6, y: 9, width: 15, height: 16 });
});

test("initialSelection initialise directement la sélection", () => {
  const editor = createEditor({
    container: "stage",
    scale: 2,
    initialSelection: { x: 10, y: 12, width: 30, height: 20 },
  });

  assert.equal(editor.hasSelection(), true);
  assert.deepEqual(editor.selectionPhysicalRect(), { x: 20, y: 24, width: 60, height: 40 });
});

test("autoSelections prévisualise au survol de la bande haute puis verrouille au clic", () => {
  const moves = [];
  const done = [];
  const editor = createEditor({
    container: "stage",
    scale: 2,
    autoSelections: [{
      selection: { x: 10, y: 12, width: 50, height: 40 },
      activation: { x: 10, y: 12, width: 50, height: 8 },
    }],
    onSelectMove: ({ rect }) => moves.push(rect ? { ...rect } : null),
    onSelectionDone: (selection) => done.push({ ...selection }),
  });

  stage.pointer = { x: 20, y: 14 };
  stage.emit("pointermove");
  assert.equal(editor.hasSelection(), false);
  assert.deepEqual(moves.at(-1), { x: 10, y: 12, width: 50, height: 40 });

  stage.pointer = { x: 20, y: 30 };
  stage.emit("pointermove");
  assert.equal(editor.hasSelection(), false);
  assert.equal(moves.at(-1), null);

  stage.pointer = { x: 20, y: 14 };
  stage.emit("pointermove");
  stage.emit("pointerdown");
  assert.equal(editor.hasSelection(), true);
  assert.deepEqual(done.at(-1), { x: 10, y: 12, width: 50, height: 40 });
  assert.deepEqual(editor.selectionPhysicalRect(), { x: 20, y: 24, width: 100, height: 80 });
});
