import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';
import type { Model } from '../../core/types';
import {
  attachModelToNode,
  createSceneNode,
  destroySceneNode,
  setSceneNodeColor,
  setSceneNodeParent,
  setSceneNodeTransform,
  setSceneNodePbr,
  setSceneNodeTexture,
  setSceneNodeVisible,
} from '../../scene';
import type { SceneNodeHandle } from '../../scene';

export interface SceneNodeComponentOptions {
  ownership?: 'borrowed' | 'owned';
}

/** Wraps an existing renderer scene node without creating one implicitly. */
export class SceneNodeComponent extends GameComponent {
  readonly handle: SceneNodeHandle;
  readonly ownership: 'borrowed' | 'owned';

  constructor(handle: SceneNodeHandle, options: SceneNodeComponentOptions = {}) {
    super();
    this.handle = handle;
    this.ownership = options.ownership || 'borrowed';
  }

  static create(): SceneNodeComponent | null {
    const handle = createSceneNode();
    if (handle === 0) return null;
    return new SceneNodeComponent(handle, { ownership: 'owned' });
  }

  setVisible(visible: boolean): this {
    if (!this.destroyed) setSceneNodeVisible(this.handle, visible);
    return this;
  }

  setColor(r: number, g: number, b: number, a: number = 255): this {
    if (!this.destroyed) setSceneNodeColor(this.handle, r, g, b, a);
    return this;
  }

  setPbr(roughness: number, metalness: number): this {
    if (!this.destroyed) setSceneNodePbr(this.handle, roughness, metalness);
    return this;
  }

  setTexture(textureIndex: number): this {
    if (!this.destroyed) setSceneNodeTexture(this.handle, textureIndex);
    return this;
  }

  attachModel(model: Model, meshIndex: number = 0): this {
    if (!this.destroyed) attachModelToNode(this.handle, model.handle, meshIndex);
    return this;
  }

  _syncRuntimeAfterPhase(): void {
    const owner: GameObject | null = this.gameObject;
    if (owner === null || this.destroyed) return;
    const parent = owner.parent;
    const parentAdapter = parent === null
      ? null
      : parent.getComponent(SceneNodeComponent);
    if (parentAdapter !== null && !parentAdapter.destroyed) {
      setSceneNodeParent(this.handle, parentAdapter.handle);
      setSceneNodeTransform(this.handle, owner.transform.localMatrix);
    } else {
      setSceneNodeParent(this.handle, 0);
      setSceneNodeTransform(this.handle, owner.transform.worldMatrix);
    }
  }

  onDestroy(): void {
    const owner: GameObject | null = this.gameObject;
    if (owner !== null) {
      setSceneNodeParent(this.handle, 0);
      setSceneNodeTransform(this.handle, owner.transform.worldMatrix);
    }
    if (this.ownership === 'owned') destroySceneNode(this.handle);
  }
}
