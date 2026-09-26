import { GameContext, ContextResource } from '../core/context';
import type { Game } from '../core/game';
import * as operations from './internal';
import type { Model } from '../models/model';
import type { BoundingBox, Color, Mat4, Vec3 } from '../core/types';

export interface SceneNodeOptions {
  name?: string;
}

/** A retained renderer node with private native identity and game ownership. */
export class SceneNode implements ContextResource {
  readonly error: string | null;
  readonly name: string;
  private handleValue = 0;
  private disposed = false;
  private parentValue: SceneNode | null = null;
  private childrenValue: SceneNode[] = [];

  private readonly context: GameContext;

  constructor(owner: Game, options?: SceneNodeOptions);
  constructor(owner: Game, options: SceneNodeOptions = {}, adoptedHandle?: number) {
    this.context = owner.context;
    const context = this.context;
    this.name = options.name || '';
    if (!context.isReady || context.isDisposed) {
      this.error = 'The Game must be ready before creating scene nodes.';
      return;
    }
    this.handleValue = adoptedHandle === undefined ? operations.createSceneNode() : adoptedHandle;
    this.error = this.handleValue === 0 ? 'Unable to create scene node.' : null;
    if (this.handleValue !== 0) context.register(this);
  }

  /** @internal Wraps a node created by the world loader without exposing its identity. */
  private static adoptNative(owner: Game, handle: number, name = ''): SceneNode {
    return new SceneNode(owner, { name }, handle);
  }

  /** @internal Restores a parent relationship already established by native operations. */
  private static adoptParentLink(child: SceneNode, parent: SceneNode): void {
    if (child.parentValue !== null) child.parentValue.removeChild(child);
    child.parentValue = parent;
    if (parent.childrenValue.indexOf(child) < 0) parent.childrenValue.push(child);
  }

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }
  get parent(): SceneNode | null { return this.parentValue; }
  get children(): SceneNode[] { return this.childrenValue.slice(); }

  setVisible(visible: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeVisible(this.handleValue, visible);
    return true;
  }

  setCastShadow(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeCastShadow(this.handleValue, enabled);
    return true;
  }

  setReceiveShadow(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeReceiveShadow(this.handleValue, enabled);
    return true;
  }

  setGiOnly(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeGiOnly(this.handleValue, enabled);
    return true;
  }

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

  setTransform(matrix: Mat4): boolean {
    if (!this.isLoaded || matrix.length !== 16) return false;
    operations.setSceneNodeTransform(this.handleValue, matrix);
    return true;
  }

  setTrs(position: Vec3, yaw = 0, scale = 1): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeTrs(this.handleValue, position.x, position.y, position.z, yaw, scale);
    return true;
  }

  updateGeometry(vertices: number[], indices: number[]): boolean {
    if (!this.isLoaded || vertices.length < 12 || indices.length === 0) return false;
    operations.updateSceneNodeGeometry(this.handleValue, vertices, indices);
    return true;
  }

  setLodGeometry(level: number, vertices: number[], indices: number[], maxCoverage: number): boolean {
    if (!this.isLoaded || level < 0 || vertices.length < 12 || indices.length === 0) return false;
    operations.setSceneNodeLod(this.handleValue, level, vertices, indices, maxCoverage);
    return true;
  }

  attachModel(model: Model, meshIndex = 0): boolean {
    if (!this.isLoaded || !this.context.owns(model) || !model.isLoaded) return false;
    operations.attachModelToNode(this.handleValue, (model as any).handleValue, meshIndex);
    return true;
  }

  attachModelLod(model: Model, meshIndex: number, level: number, maxCoverage: number): boolean {
    if (!this.isLoaded || !this.context.owns(model) || !model.isLoaded) return false;
    operations.attachModelLodToNode(this.handleValue, { handle: (model as any).handleValue }, meshIndex, level, maxCoverage);
    return true;
  }

  setColor(color: Color): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeColor(this.handleValue, color.r, color.g, color.b, color.a);
    return true;
  }

  setPbr(roughness: number, metalness: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodePbr(this.handleValue, roughness, metalness);
    return true;
  }

  setTextureSlot(slot: number): boolean {
    if (!this.isLoaded || slot < 0) return false;
    operations.setSceneNodeTexture(this.handleValue, slot);
    return true;
  }

  setWaterMaterial(waveAmplitude: number, waveSpeed: number, color: Color): boolean {
    if (!this.isLoaded) return false;
    operations.setSceneNodeWaterMaterial(this.handleValue, waveAmplitude, waveSpeed,
      color.r, color.g, color.b, color.a);
    return true;
  }

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

  subtractBox(bounds: BoundingBox): boolean {
    if (!this.isLoaded) return false;
    operations.subtractBox(this.handleValue, bounds.min.x, bounds.min.y, bounds.min.z,
      bounds.max.x, bounds.max.y, bounds.max.z);
    return true;
  }

  getTransform(): Mat4 | null { return this.isLoaded ? operations.getSceneNodeTransform(this.handleValue) : null; }
  getBounds(): BoundingBox | null { return this.isLoaded ? operations.getSceneNodeBounds(this.handleValue) : null; }
  setUserData(value: number): boolean { if (!this.isLoaded) return false; operations.setSceneNodeUserData(this.handleValue, value); return true; }
  getUserData(): number { return this.isLoaded ? operations.getSceneNodeUserData(this.handleValue) : 0; }

  /** @internal Used to map a native pick result back to a class instance. */
  private matchesNativeHandle(handle: number): boolean { return this.isLoaded && this.handleValue === handle; }

  dispose(): void {
    if (this.disposed) return;
    for (let index = this.childrenValue.length - 1; index >= 0; index--) this.childrenValue[index].dispose();
    this.childrenValue.length = 0;
    if (this.parentValue !== null) this.parentValue.removeChild(this);
    this.parentValue = null;
    if (this.handleValue !== 0) operations.destroySceneNode(this.handleValue);
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }

  private removeChild(child: SceneNode): void {
    const index = this.childrenValue.indexOf(child);
    if (index >= 0) this.childrenValue.splice(index, 1);
  }
}
