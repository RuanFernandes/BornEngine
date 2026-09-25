import { GameObject } from './game-object';

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) {
    values[current] = values[current + 1];
  }
  values.pop();
}

export class GameScene {
  private sceneObjects: GameObject[] = [];
  private nextAttachmentGeneration = 1;

  get objects(): readonly GameObject[] {
    return this.sceneObjects.slice();
  }

  add<T extends GameObject>(object: T): T | null {
    if (object.destroyed || object.scene !== null || object.parent !== null ||
        !this._canAttachSubtree(object)) {
      return null;
    }
    return this._attachSubtree(object) ? object : null;
  }

  remove(object: GameObject): boolean {
    if (object.scene !== this) return false;
    if (object.parent !== null && !object.parent.removeChild(object)) return false;

    const subtree = this._collectSubtree(object);
    for (let index = this.sceneObjects.length - 1; index >= 0; index--) {
      if (subtree.indexOf(this.sceneObjects[index]) >= 0) {
        removeAt(this.sceneObjects, index);
      }
    }
    for (let index = 0; index < subtree.length; index++) {
      subtree[index]._setScene(null);
    }
    return true;
  }

  /** @internal Validates a detached subtree before an atomic scene attachment. */
  _canAttachSubtree(root: GameObject): boolean {
    const subtree = this._collectSubtree(root);
    for (let index = 0; index < subtree.length; index++) {
      if (subtree[index].destroyed || subtree[index].scene !== null) return false;
    }
    return true;
  }

  /** @internal Attaches a detached subtree in parent-first insertion order. */
  _attachSubtree(root: GameObject): boolean {
    if (!this._canAttachSubtree(root)) return false;
    const subtree = this._collectSubtree(root);
    for (let index = 0; index < subtree.length; index++) {
      const object = subtree[index];
      object._setScene(this);
      object._setAttachmentGeneration(this.nextAttachmentGeneration++);
      this.sceneObjects.push(object);
    }
    return true;
  }

  private _collectSubtree(root: GameObject): GameObject[] {
    const result: GameObject[] = [];
    const visit = (object: GameObject): void => {
      result.push(object);
      const children = object._childrenSnapshot();
      for (let index = 0; index < children.length; index++) {
        visit(children[index]);
      }
    };
    visit(root);
    return result;
  }
}
