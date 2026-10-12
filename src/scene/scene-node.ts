import { GameContext, ContextResource, getGameContext } from '../core/context';
import type { Game } from '../core/game';
import type { SceneGraph } from './scene-graph';
import * as operations from './internal';
import type { Mesh, Model } from '../models/model';
import type { BoundingBox, Color, Mat4, Vec3 } from '../core/types';

/** Options for creating a scene node. */
export interface SceneNodeOptions {
  name?: string;
}

/** A retained renderer node with private native identity and game ownership. */
export class SceneNode implements ContextResource {
  /** Reason the node could not be created, or null when creation succeeded. */
  readonly error: string | null;
  /** Name given at creation, or an empty string. Used by `SceneGraph.findByName`. */
  readonly name: string;
  private handleValue = 0;
  private disposed = false;
  private parentValue: SceneNode | null = null;
  private childrenValue: SceneNode[] = [];

  private readonly context: GameContext;
  private readonly sceneGraph: SceneGraph;

  /** Creates a node and registers it with the game's scene graph. Check `error` after construction. */
  constructor(owner: Game, options?: SceneNodeOptions);
  /** @internal */
  constructor(owner: Game, options: SceneNodeOptions, adoptedHandle: number);
  constructor(owner: Game, options: SceneNodeOptions = {}, adoptedHandle?: number) {
    this.context = getGameContext(owner);
    this.sceneGraph = owner.sceneGraph;
    const context = this.context;
    this.name = options.name || '';
    if (!context.isReady || context.isDisposed) {
      this.error = 'The Game must be ready before creating scene nodes.';
      return;
    }
    this.handleValue = adoptedHandle === undefined ? operations.createSceneNode() : adoptedHandle;
    this.error = this.handleValue === 0 ? 'Unable to create scene node.' : null;
    if (this.handleValue !== 0) {
      context.register(this);
      this.sceneGraph.add(this);
    }
  }

  /** @internal Wraps a node created by the world loader without exposing its identity. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: invoked as (SceneNode as any).adoptNative(...) from src/scene/ownership.ts
  private static adoptNative(owner: Game, handle: number, name = ''): SceneNode {
    return new SceneNode(owner, { name }, handle);
  }

  /** @internal Restores a parent relationship already established by native operations. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: invoked as (SceneNode as any).adoptParentLink(...) from src/scene/ownership.ts
  private static adoptParentLink(child: SceneNode, parent: SceneNode): void {
    if (child.parentValue !== null) child.parentValue.removeChild(child);
    child.parentValue = parent;
    if (parent.childrenValue.indexOf(child) < 0) parent.childrenValue.push(child);
  }

  /** True while the node exists natively and neither it nor its game has been disposed. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the node has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** Parent node, or null for a root node. */
  get parent(): SceneNode | null {
    return this.parentValue;
  }
  /** Returns a copy of the list of child nodes. */
  get children(): SceneNode[] {
    return this.childrenValue.slice();
  }

  /** Shows or hides the node. Returns false if the node is not loaded. */
  setVisible(visible: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeVisible(this.handleValue, visible);
    return true;
  }

  /** Sets whether the node casts shadows. Returns false if the node is not loaded. */
  setCastShadow(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeCastShadow(this.handleValue, enabled);
    return true;
  }

  /** Sets whether the node receives shadows. Returns false if the node is not loaded. */
  setReceiveShadow(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeReceiveShadow(this.handleValue, enabled);
    return true;
  }

  /**
   * Marks the node as contributing only to global illumination bounce light. Returns false if the node is not loaded.
   */
  setGiOnly(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeGiOnly(this.handleValue, enabled);
    return true;
  }

  /**
   * Reparents the node, or detaches it with null. Returns false if the node is not loaded, the parent is foreign or not loaded, or the change would create a cycle.
   */
  setParent(parent: SceneNode | null): boolean {
    if (!this.isLoaded) return false;
    if (parent !== null && (!this.context.owns(parent) || !parent.isLoaded)) return false;
    let ancestor = parent;
    while (ancestor !== null) {
      if (ancestor === this) return false;
      ancestor = ancestor.parentValue;
    }

    operations.setSceneNodeParent(this.handleValue, parent === null ? 0 : parent.handleValue);
    if (this.parentValue !== null) this.parentValue.removeChild(this);
    this.parentValue = parent;
    if (parent !== null && parent.childrenValue.indexOf(this) < 0) parent.childrenValue.push(this);
    return true;
  }

  /**
   * Sets the node's transform from a 16-element matrix. Returns false if the node is not loaded or the matrix length is not 16.
   */
  setTransform(matrix: Mat4): boolean {
    if (!this.isLoaded || matrix.length !== 16) return false;
    operations.setSceneNodeTransform(this.handleValue, matrix);
    return true;
  }

  /**
   * Places the node at `position` with a rotation around the Y axis (`yaw`, in radians) and a uniform `scale`. Returns false if the node is not loaded.
   */
  setTrs(position: Vec3, yaw = 0, scale = 1): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeTrs(this.handleValue, position.x, position.y, position.z, yaw, scale);
    return true;
  }

  /**
   * Replaces the node's mesh. Each vertex is 12 numbers: position, normal, color RGBA, and UV; `indices` lists triangles. Returns false if the node is not loaded, there are fewer than 12 vertex values, or `indices` is empty.
   */
  updateGeometry(vertices: number[], indices: number[]): boolean {
    if (!this.isLoaded || vertices.length < 12 || indices.length === 0) return false;
    operations.updateSceneNodeGeometry(this.handleValue, vertices, indices);
    return true;
  }

  /**
   * Sets a reduced-detail mesh for LOD `level` (0 is the first coarser variant). It is used when the node covers less than `maxCoverage` (0..1) of the viewport; vertex layout matches `updateGeometry`.
   */
  setLodGeometry(level: number, vertices: number[], indices: number[], maxCoverage: number): boolean {
    if (!this.isLoaded || level < 0 || vertices.length < 12 || indices.length === 0) return false;
    operations.setSceneNodeLod(this.handleValue, level, vertices, indices, maxCoverage);
    return true;
  }

  /**
   * Uses a mesh from a loaded model as the node's geometry. Returns false if the node or model is not loaded or the model belongs to another game.
   */
  attachModel(model: Model | Mesh, meshIndex = 0): boolean {
    if (!this.isLoaded || !this.context.owns(model) || !model.isLoaded) return false;
    operations.attachModelToNode(this.handleValue, (model as any).handleValue, meshIndex);
    return true;
  }

  /**
   * Attaches a model mesh as a reduced-detail variant for LOD `level`, used when the node covers less than `maxCoverage` (0..1) of the viewport.
   */
  attachModelLod(model: Model | Mesh, meshIndex: number, level: number, maxCoverage: number): boolean {
    if (!this.isLoaded || !this.context.owns(model) || !model.isLoaded) return false;
    operations.attachModelLodToNode(
      this.handleValue,
      { handle: (model as any).handleValue },
      meshIndex,
      level,
      maxCoverage,
    );
    return true;
  }

  /** Sets the node's color (0-255 per channel). Returns false if the node is not loaded. */
  setColor(color: Color): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeColor(this.handleValue, color.r, color.g, color.b, color.a);
    return true;
  }

  /** Sets the node's PBR roughness and metalness. Returns false if the node is not loaded. */
  setPbr(roughness: number, metalness: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodePbr(this.handleValue, roughness, metalness);
    return true;
  }

  /**
   * Sets the texture slot used by the node's material; 0 is the default white texture. Returns false if the node is not loaded or `slot` is negative.
   */
  setTextureSlot(slot: number): boolean {
    if (!this.isLoaded || slot < 0) return false;
    operations.setSceneNodeTexture(this.handleValue, slot);
    return true;
  }

  /**
   * Applies a translucent water-like material with the given tint (0-255 per channel). The wave parameters are stored but do not animate yet. Returns false if the node is not loaded.
   */
  setWaterMaterial(waveAmplitude: number, waveSpeed: number, color: Color): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeWaterMaterial(
      this.handleValue,
      waveAmplitude,
      waveSpeed,
      color.r,
      color.g,
      color.b,
      color.a,
    );
    return true;
  }

  /**
   * Sets the node's geometry to the polygon's XZ outline extruded along Y from 0 to `depth`. Returns false if the node is not loaded or there are fewer than 3 points.
   */
  extrudePolygon(points: Vec3[], depth: number): boolean {
    if (!this.isLoaded || points.length < 3) return false;
    const polygon: number[] = [];
    for (let index = 0; index < points.length; index++) {
      polygon.push(points[index].x);
      polygon.push(points[index].z);
    }
    operations.extrudePolygon(this.handleValue, polygon, depth);
    return true;
  }

  /**
   * Removes triangles of the node's geometry that lie fully inside the box, for simple cutouts such as doorways. Returns false if the node is not loaded.
   */
  subtractBox(bounds: BoundingBox): boolean {
    if (!this.isLoaded) return false;
    operations.subtractBox(
      this.handleValue,
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
    );
    return true;
  }

  /** Returns the node's transform matrix, or null if the node is not loaded. */
  getTransform(): Mat4 | null {
    return this.isLoaded ? operations.getSceneNodeTransform(this.handleValue) : null;
  }
  /** Returns the node's bounding box, or null if the node is not loaded. */
  getBounds(): BoundingBox | null {
    return this.isLoaded ? operations.getSceneNodeBounds(this.handleValue) : null;
  }
  /** Attaches an integer to the node, for example an entity id. Returns false if the node is not loaded. */
  setUserData(value: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeUserData(this.handleValue, value);
    return true;
  }
  /** Integer attached with `setUserData`, or 0. */
  getUserData(): number {
    return this.isLoaded ? operations.getSceneNodeUserData(this.handleValue) : 0;
  }

  /** @internal Used to map a native pick result back to a class instance. */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: invoked as (node as any).matchesNativeHandle(...) from src/scene/ownership.ts
  private matchesNativeHandle(handle: number): boolean {
    return this.isLoaded && this.handleValue === handle;
  }

  /** Disposes the node and all its children and removes it from the scene graph. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    for (let index = this.childrenValue.length - 1; index >= 0; index--) this.childrenValue[index].dispose();
    this.childrenValue.length = 0;
    if (this.parentValue !== null) this.parentValue.removeChild(this);
    this.parentValue = null;
    if (this.handleValue !== 0) operations.destroySceneNode(this.handleValue);
    this.handleValue = 0;
    this.disposed = true;
    this.sceneGraph.remove(this);
    this.context.unregister(this);
  }

  private removeChild(child: SceneNode): void {
    const index = this.childrenValue.indexOf(child);
    if (index >= 0) this.childrenValue.splice(index, 1);
  }
}
