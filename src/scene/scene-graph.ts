import { GameContext, ContextResource } from '../core/context';
import * as operations from './internal';
import { SceneNode, SceneNodeOptions } from './scene-node';
import type { Color, Vec2, Vec3 } from '../core/types';

export interface ScenePickHit {
  hit: boolean;
  node: SceneNode | null;
  distance: number;
  point: Vec3;
  normal: Vec3;
}

export interface ScenePickEntry {
  node: SceneNode | null;
  distance: number;
}

/** Retained 3D scene graph service owned by a Game. */
export class SceneGraph {
  private nodes: SceneNode[] = [];
  private frameSubscriptions: FrameSubscription[] = [];
  private disposed = false;

  constructor(private readonly context: GameContext) {}

  get isReady(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed; }
  get nodeCount(): number { return this.nodes.length; }
  getNodes(): SceneNode[] { return this.nodes.slice(); }

  createNode(options: SceneNodeOptions = {}): SceneNode {
    const node = new SceneNode(this.context, options);
    this.nodes.push(node);
    return node;
  }

  add(node: SceneNode): boolean {
    if (!this.isReady || !this.context.owns(node) || !node.isLoaded) return false;
    if (this.nodes.indexOf(node) < 0) this.nodes.push(node);
    return true;
  }

  remove(node: SceneNode, dispose = false): boolean {
    const index = this.nodes.indexOf(node);
    if (index < 0) return false;
    this.nodes.splice(index, 1);
    if (dispose) node.dispose();
    return true;
  }

  findByName(name: string): SceneNode | null {
    for (let index = 0; index < this.nodes.length; index++) {
      if (this.nodes[index].name === name && this.nodes[index].isLoaded) return this.nodes[index];
    }
    return null;
  }

  pick(screenPosition: Vec2): ScenePickHit {
    const empty: ScenePickHit = {
      hit: false,
      node: null,
      distance: 0,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 },
    };
    if (!this.isReady) return empty;
    const hit = operations.pickScene(screenPosition.x, screenPosition.y);
    if (!hit.hit) return empty;
    return {
      hit: true,
      node: this.findByNativeHandle(hit.handle),
      distance: hit.distance,
      point: hit.point,
      normal: hit.normal,
    };
  }

  pickAll(screenPosition: Vec2, maxResults = 8): ScenePickEntry[] {
    if (!this.isReady || maxResults <= 0) return [];
    const hits = operations.pickSceneAll(screenPosition.x, screenPosition.y, maxResults);
    const result: ScenePickEntry[] = [];
    for (let index = 0; index < hits.length; index++) {
      result.push({ node: this.findByNativeHandle(hits[index].handle), distance: hits[index].distance });
    }
    return result;
  }

  projectToScreen(position: Vec3): { x: number; y: number; visible: boolean } | null {
    if (!this.isReady) return null;
    return operations.projectToScreen(position.x, position.y, position.z);
  }

  addDirectionalLight(direction: Vec3, color: Color, intensity: number): boolean {
    if (!this.isReady) return false;
    operations.addDirectionalLight(direction.x, direction.y, direction.z,
      color.r / 255, color.g / 255, color.b / 255, intensity);
    return true;
  }

  addPointLight(position: Vec3, range: number, color: Color, intensity: number): boolean {
    if (!this.isReady) return false;
    operations.addPointLight(position.x, position.y, position.z, range,
      color.r / 255, color.g / 255, color.b / 255, intensity);
    return true;
  }

  setShadowsEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    if (enabled) operations.enableShadows(); else operations.disableShadows();
    return true;
  }

  dumpShadowMap(path: string): boolean { if (!this.isReady) return false; operations.dumpShadowMap(path); return true; }
  setPostProcessingEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    if (enabled) operations.enablePostFx(); else operations.disablePostFx();
    return true;
  }
  setSelected(node: SceneNode | null): boolean {
    if (!this.isReady || (node !== null && (!this.context.owns(node) || !node.isLoaded))) return false;
    operations.setPostFxSelected(node === null ? 0 : (node as any).handleValue);
    return true;
  }
  setHovered(node: SceneNode | null): boolean {
    if (!this.isReady || (node !== null && (!this.context.owns(node) || !node.isLoaded))) return false;
    operations.setPostFxHovered(node === null ? 0 : (node as any).handleValue);
    return true;
  }
  setOutlineColor(color: Color): boolean {
    if (!this.isReady) return false;
    operations.setOutlineColor(color.r, color.g, color.b, color.a);
    return true;
  }
  setOutlineThickness(thickness: number): boolean {
    if (!this.isReady || thickness < 0) return false;
    operations.setOutlineThickness(thickness);
    return true;
  }

  onFrame(callback: (deltaTime: number) => void, priority = 0): FrameSubscription | null {
    if (!this.isReady) return null;
    const subscription = new FrameSubscription(this.context, priority, callback);
    if (!subscription.isActive) return null;
    this.frameSubscriptions.push(subscription);
    return subscription;
  }

  private findByNativeHandle(handle: number): SceneNode | null {
    for (let index = 0; index < this.nodes.length; index++) {
      if (this.nodes[index].matchesNativeHandle(handle)) return this.nodes[index];
    }
    return null;
  }

  dispose(): void {
    if (this.disposed) return;
    for (let index = this.frameSubscriptions.length - 1; index >= 0; index--) this.frameSubscriptions[index].dispose();
    this.frameSubscriptions.length = 0;
    for (let index = this.nodes.length - 1; index >= 0; index--) this.nodes[index].dispose();
    this.nodes.length = 0;
    this.disposed = true;
  }
}

/** Disposable registration for a retained scene frame callback. */
export class FrameSubscription implements ContextResource {
  private callbackId = 0;
  private active = false;

  constructor(private readonly context: GameContext, priority: number, callback: (deltaTime: number) => void) {
    if (!context.isReady || context.isDisposed) return;
    this.callbackId = operations.registerFrameCallback(priority, callback);
    this.active = true;
    if (!context.register(this)) {
      operations.unregisterFrameCallback(this.callbackId);
      this.active = false;
    }
  }

  get isActive(): boolean { return this.active && this.context.isReady && !this.context.isDisposed; }

  dispose(): void {
    if (!this.active) return;
    operations.unregisterFrameCallback(this.callbackId);
    this.callbackId = 0;
    this.active = false;
    this.context.unregister(this);
  }
}
