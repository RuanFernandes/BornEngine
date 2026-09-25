import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';
import {
  destroySceneNode,
  setSceneNodeParent,
  setSceneNodeTransform,
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
