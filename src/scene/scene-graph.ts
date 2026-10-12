import { GameContext, ContextResource, getGameContext } from '../core/context';
import type { Game } from '../core/game';
import * as operations from './internal';
import { SceneNode, SceneNodeOptions } from './scene-node';
import { matchesSceneNodeHandle } from './ownership';
import { setAmbientLight } from '../models/internal';
import type { Color, Vector2DLike, Vec3 } from '../core/types';

/**
 * Result of picking a single scene node: whether anything was hit, the node, the distance, and the hit point and surface normal.
 */
export interface ScenePickHit {
  hit: boolean;
  node: SceneNode | null;
  distance: number;
  point: Vec3;
  normal: Vec3;
}

/** One entry of a multi-hit pick: the node hit and its distance from the camera. */
export interface ScenePickEntry {
  node: SceneNode | null;
  distance: number;
}

/** Retained 3D scene graph service owned by a Game. */
export class SceneGraph implements ContextResource {
  private nodes: SceneNode[] = [];
  private frameSubscriptions: FrameSubscription[] = [];
  private disposed = false;
  private readonly context: GameContext;

  /** Creates the scene graph for the given game. Use `game.sceneGraph` instead of constructing one. */
  constructor(private readonly game: Game) {
    this.context = getGameContext(game);
    this.context.register(this);
  }

  /** True while the owning game is ready and neither the game nor this scene graph has been disposed. */
  get isReady(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed;
  }
  /** Number of nodes currently registered in the graph. */
  get nodeCount(): number {
    return this.nodes.length;
  }
  /** Returns a copy of the list of registered nodes. */
  getNodes(): SceneNode[] {
    return this.nodes.slice();
  }

  /** Creates a new scene node owned by this graph's game. */
  createNode(options: SceneNodeOptions = {}): SceneNode {
    return new SceneNode(this.game, options);
  }

  /**
   * Registers a loaded node owned by the same game. Returns false if the graph is not ready, the node is foreign, or the node is not loaded.
   */
  add(node: SceneNode): boolean {
    if (!this.isReady || !this.context.owns(node) || !node.isLoaded) return false;
    if (this.nodes.indexOf(node) < 0) this.nodes.push(node);
    return true;
  }

  /** Unregisters the node, optionally disposing it. Returns false if the node was not registered. */
  remove(node: SceneNode, dispose = false): boolean {
    const index = this.nodes.indexOf(node);
    if (index < 0) return false;
    this.nodes.splice(index, 1);
    if (dispose) node.dispose();
    return true;
  }

  /** Returns the first loaded node with the given name, or null. */
  findByName(name: string): SceneNode | null {
    for (let index = 0; index < this.nodes.length; index++) {
      if (this.nodes[index].name === name && this.nodes[index].isLoaded) return this.nodes[index];
    }
    return null;
  }

  /**
   * Casts a ray through the screen position and returns the nearest scene node hit. `hit` is false when nothing is hit.
   */
  pick(screenPosition: Vector2DLike): ScenePickHit {
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

  /** Returns all nodes under the screen position sorted by distance, closest first, up to `maxResults`. */
  pickAll(screenPosition: Vector2DLike, maxResults = 8): ScenePickEntry[] {
    if (!this.isReady || maxResults <= 0) return [];
    const hits = operations.pickSceneAll(screenPosition.x, screenPosition.y, maxResults);
    const result: ScenePickEntry[] = [];
    for (let index = 0; index < hits.length; index++) {
      result.push({ node: this.findByNativeHandle(hits[index].handle), distance: hits[index].distance });
    }
    return result;
  }

  /**
   * Projects a world-space point to screen coordinates. `visible` is false when the point is behind the camera. Returns null when not ready.
   */
  projectToScreen(position: Vec3): { x: number; y: number; visible: boolean } | null {
    if (!this.isReady) return null;
    return operations.projectToScreen(position.x, position.y, position.z);
  }

  /** Adds a directional light. `color` channels are 0-255. Returns false if the graph is not ready. */
  addDirectionalLight(direction: Vec3, color: Color, intensity: number): boolean {
    if (!this.isReady) return false;
    operations.addDirectionalLight(
      direction.x,
      direction.y,
      direction.z,
      color.r / 255,
      color.g / 255,
      color.b / 255,
      intensity,
    );
    return true;
  }

  /** Sets the ambient light color (0-255 per channel) and intensity. Returns false if the graph is not ready. */
  setAmbientLight(color: Color, intensity: number): boolean {
    if (!this.isReady) return false;
    setAmbientLight(color, intensity);
    return true;
  }

  /**
   * Adds a point light at `position` that reaches up to `range`. `color` channels are 0-255. Returns false if the graph is not ready.
   */
  addPointLight(position: Vec3, range: number, color: Color, intensity: number): boolean {
    if (!this.isReady) return false;
    operations.addPointLight(
      position.x,
      position.y,
      position.z,
      range,
      color.r / 255,
      color.g / 255,
      color.b / 255,
      intensity,
    );
    return true;
  }

  /** Turns shadow rendering on or off. Returns false if the graph is not ready. */
  setShadowsEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    if (enabled) operations.enableShadows();
    else operations.disableShadows();
    return true;
  }

  /**
   * Writes the shadow map depth texture to a grayscale PNG at `path` for debugging. Returns false if the graph is not ready.
   */
  dumpShadowMap(path: string): boolean {
    if (!this.isReady) return false;
    operations.dumpShadowMap(path);
    return true;
  }
  /** Turns the post-processing pipeline (outlines, SSAO) on or off. Returns false if the graph is not ready. */
  setPostProcessingEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    if (enabled) operations.enablePostFx();
    else operations.disablePostFx();
    return true;
  }
  /**
   * Sets the node drawn with the selection outline, or clears it with null. Returns false if the node is not loaded or not owned by this game.
   */
  setSelected(node: SceneNode | null): boolean {
    if (!this.isReady || (node !== null && (!this.context.owns(node) || !node.isLoaded))) return false;
    operations.setPostFxSelected(node === null ? 0 : (node as any).handleValue);
    return true;
  }
  /**
   * Sets the node drawn with the hover outline, or clears it with null. Returns false if the node is not loaded or not owned by this game.
   */
  setHovered(node: SceneNode | null): boolean {
    if (!this.isReady || (node !== null && (!this.context.owns(node) || !node.isLoaded))) return false;
    operations.setPostFxHovered(node === null ? 0 : (node as any).handleValue);
    return true;
  }
  /** Sets the selection outline color (0-255 per channel). Returns false if the graph is not ready. */
  setOutlineColor(color: Color): boolean {
    if (!this.isReady) return false;
    operations.setOutlineColor(color.r, color.g, color.b, color.a);
    return true;
  }
  /** Sets the outline thickness in pixels. Returns false if the graph is not ready or `thickness` is negative. */
  setOutlineThickness(thickness: number): boolean {
    if (!this.isReady || thickness < 0) return false;
    operations.setOutlineThickness(thickness);
    return true;
  }

  /**
   * Registers a callback that runs every frame with the delta time in seconds; lower `priority` values run first. Returns null if the graph is not ready.
   */
  onFrame(callback: (deltaTime: number) => void, priority = 0): FrameSubscription | null {
    if (!this.isReady) return null;
    const subscription = new FrameSubscription(this.game, priority, callback);
    if (!subscription.isActive) return null;
    this.frameSubscriptions.push(subscription);
    return subscription;
  }

  private findByNativeHandle(handle: number): SceneNode | null {
    for (let index = 0; index < this.nodes.length; index++) {
      if (matchesSceneNodeHandle(this.nodes[index], handle)) return this.nodes[index];
    }
    return null;
  }

  /** Cancels frame subscriptions and disposes every node. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    for (let index = this.frameSubscriptions.length - 1; index >= 0; index--) this.frameSubscriptions[index].dispose();
    this.frameSubscriptions.length = 0;
    const nodes = this.nodes.slice();
    this.nodes.length = 0;
    for (let index = nodes.length - 1; index >= 0; index--) nodes[index].dispose();
    this.disposed = true;
    this.context.unregister(this);
  }
}

/** Disposable registration for a retained scene frame callback. */
export class FrameSubscription implements ContextResource {
  private callbackId = 0;
  private active = false;
  private readonly context: GameContext;

  /**
   * Registers `callback` to run every frame, ordered by `priority`. Check `isActive` to see whether registration succeeded. Prefer `SceneGraph.onFrame()`.
   */
  constructor(game: Game, priority: number, callback: (deltaTime: number) => void) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed) return;
    this.callbackId = operations.registerFrameCallback(priority, callback);
    this.active = true;
    if (!context.register(this)) {
      operations.unregisterFrameCallback(this.callbackId);
      this.active = false;
    }
  }

  /** True while the callback is registered and the game is still running. */
  get isActive(): boolean {
    return this.active && this.context.isReady && !this.context.isDisposed;
  }

  /** Unregisters the callback. Safe to call more than once. */
  dispose(): void {
    if (!this.active) return;
    operations.unregisterFrameCallback(this.callbackId);
    this.callbackId = 0;
    this.active = false;
    this.context.unregister(this);
  }
}
