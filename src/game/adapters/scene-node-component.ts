import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';
import type { SceneNode } from '../../scene/scene-node';
import type { Model } from '../../models/model';
import type { Color } from '../../core/types';
import type { GameContext } from '../../core/context';

export interface SceneNodeComponentOptions {
  ownership?: 'borrowed' | 'owned';
}

/** Synchronizes a renderer node with a gameplay object's transform. */
export class SceneNodeComponent extends GameComponent {
  readonly node: SceneNode;
  readonly ownership: 'borrowed' | 'owned';

  constructor(node: SceneNode, options: SceneNodeComponentOptions = {}) {
    super();
    this.node = node;
    this.ownership = options.ownership || 'borrowed';
  }

  setVisible(visible: boolean): this {
    if (!this.destroyed) this.node.setVisible(visible);
    return this;
  }

  setColor(color: Color): this {
    if (!this.destroyed) this.node.setColor(color);
    return this;
  }

  setPbr(roughness: number, metalness: number): this {
    if (!this.destroyed) this.node.setPbr(roughness, metalness);
    return this;
  }

  setTextureSlot(slot: number): this {
    if (!this.destroyed) this.node.setTextureSlot(slot);
    return this;
  }

  attachModel(model: Model, meshIndex = 0): this {
    if (!this.destroyed) this.node.attachModel(model, meshIndex);
    return this;
  }

  _canAttachTo(context: GameContext): boolean { return context.owns(this.node); }

  _syncRuntimeAfterPhase(): void {
    const owner: GameObject | null = this.gameObject;
    if (owner === null || this.destroyed || !this.node.isLoaded) return;
    const parent = owner.parent;
    const parentAdapter = parent === null ? null : parent.getComponent(SceneNodeComponent);
    if (parentAdapter !== null && !parentAdapter.destroyed && parentAdapter.node.isLoaded) {
      this.node.setParent(parentAdapter.node);
      this.node.setTransform(owner.transform.localMatrix);
    } else {
      this.node.setParent(null);
      this.node.setTransform(owner.transform.worldMatrix);
    }
  }

  onDestroy(): void {
    if (this.ownership === 'owned') this.node.dispose();
    else this.node.setParent(null);
  }
}
