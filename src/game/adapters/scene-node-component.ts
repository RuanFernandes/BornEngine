import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';
import type { SceneNode } from '../../scene/scene-node';
import type { Mesh, Model } from '../../models/model';
import type { Color } from '../../core/types';
import type { GameContext } from '../../core/context';

/** Options for a SceneNodeComponent. */
export interface SceneNodeComponentOptions {
  /** 'owned' disposes the node when the component is destroyed; 'borrowed' (default) only detaches it from its parent. */
  ownership?: 'borrowed' | 'owned';
}

/** Synchronizes a renderer node with a gameplay object's transform. */
export class SceneNodeComponent extends GameComponent {
  /** The renderer node kept in sync with the owner's transform. */
  readonly node: SceneNode;
  /** Whether the component disposes the node on destroy. */
  readonly ownership: 'borrowed' | 'owned';

  /** Creates a component for the given node. After each update the node follows the owner's transform, parented to the parent object's node when it has one. */
  constructor(node: SceneNode, options: SceneNodeComponentOptions = {}) {
    super();
    this.node = node;
    this.ownership = options.ownership || 'borrowed';
  }

  /** Shows or hides the node. */
  setVisible(visible: boolean): this {
    if (!this.destroyed) this.node.setVisible(visible);
    return this;
  }

  /** Sets the node's color. */
  setColor(color: Color): this {
    if (!this.destroyed) this.node.setColor(color);
    return this;
  }

  /** Sets the node's PBR roughness and metalness. */
  setPbr(roughness: number, metalness: number): this {
    if (!this.destroyed) this.node.setPbr(roughness, metalness);
    return this;
  }

  /** Selects the texture slot used by the node. */
  setTextureSlot(slot: number): this {
    if (!this.destroyed) this.node.setTextureSlot(slot);
    return this;
  }

  /**
   * Attaches a model mesh to the node.
   * @param meshIndex Index of the mesh to use.
   */
  attachModel(model: Model | Mesh, meshIndex = 0): this {
    if (!this.destroyed) this.node.attachModel(model, meshIndex);
    return this;
  }

  _canAttachTo(context: GameContext): boolean {
    return context.owns(this.node);
  }

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

  /** Releases the node: detaches it when borrowed, or detaches its children and disposes it when owned. */
  onDestroy(): void {
    if (this.ownership === 'borrowed') {
      this.node.setParent(null);
      return;
    }
    const children = this.node.children;
    for (let index = 0; index < children.length; index++) children[index].setParent(null);
    this.node.dispose();
  }
}
