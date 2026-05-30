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
