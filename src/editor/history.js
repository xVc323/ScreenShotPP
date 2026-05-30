/** Pile d'undo/redo de snapshots (tableaux de descripteurs de formes). */
export class History {
  constructor() {
    this.stack = [[]]; // état initial : aucune annotation
    this.index = 0;
  }
  current() {
    return structuredClone(this.stack[this.index]);
  }
  push(snapshot) {
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(structuredClone(snapshot));
    this.index = this.stack.length - 1;
  }
  canUndo() {
    return this.index > 0;
  }
  canRedo() {
    return this.index < this.stack.length - 1;
  }
  undo() {
    if (this.canUndo()) this.index -= 1;
    return this.current();
  }
  redo() {
    if (this.canRedo()) this.index += 1;
    return this.current();
  }
}
