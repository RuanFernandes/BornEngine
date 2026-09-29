import type { Game } from '../core/game';
import { GameContext, getGameContext } from '../core/context';
import type { ContextResource } from '../core/context';
import { Texture } from '../textures/texture';
import { AssetGroup } from './asset-group';
import type { AssetGroupLoader } from './asset-group';

/** Game-owned cache for textures loaded from asset paths. */
export class AssetManager implements ContextResource {
  private readonly context: GameContext;
  private readonly textures = new Map<string, Texture>();
  private readonly paths: string[] = [];
  private readonly groups: AssetGroup[] = [];
  private disposed = false;

  constructor(private readonly game: Game) {
    this.context = getGameContext(game);
    if (this.context.isReady) this.context.register(this);
  }

  /**
   * Loads a texture once per path and returns the cached instance on later calls.
   * A native load failure is returned as a Texture so its `error` and `isLoaded`
   * fields remain available. Returns null after this manager or its Game is disposed.
   */
  loadTexture(path: string): Texture | null {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return null;

    const cached = this.getTexture(path);
    if (cached !== null) return cached;

    // Embedded Games can be constructed before their native surface is attached.
    // Return Texture's readiness error without caching it, allowing a later retry.
    if (!this.context.isReady) return new Texture(this.game, path);

    this.context.register(this);
    const texture = new Texture(this.game, path);
    this.textures.set(path, texture);
    this.paths.push(path);
    return texture;
  }

  /** Returns a cached texture without loading it, or null when it is not cached. */
  getTexture(path: string): Texture | null {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return null;

    const texture = this.textures.get(path);
    if (texture === undefined) return null;
    if (texture.isDisposed) {
      this.removeEntry(path);
      return null;
    }
    return texture;
  }

  /** Disposes and removes the texture registered for this path. */
  releaseTexture(path: string): boolean {
    if (this.disposed || path === null || path === undefined || path.length === 0) return false;

    const texture = this.textures.get(path);
    if (texture === undefined) return false;
    this.removeEntry(path);
    if (!texture.isDisposed) texture.dispose();
    return true;
  }

  /** Number of cached, non-disposed Texture instances, including failed loads. */
  get textureCount(): number {
    this.removeDisposedEntries();
    return this.paths.length;
  }

  /** Create a named preload group owned by this Game's AssetManager. */
  createGroup(name = ''): AssetGroup | null {
    if (this.disposed || this.context.isDisposed) return null;
    const loader: AssetGroupLoader = {
      loadTexture: (path) => this.loadTexture(path),
      loadSound: (path) => this.game.audio.loadSharedSound(path),
      loadMusic: (path) => this.game.audio.loadSharedMusic(path),
      removeGroup: (group) => this.removeGroup(group),
    };
    const group = new AssetGroup(name, loader, this.context);
    this.groups.push(group);
    return group;
  }

  /** Disposes all cached textures while keeping this manager available for reuse. */
  clear(): void {
    if (this.disposed) return;
    this.clearGroups();
    this.clearEntries();
  }

  get isDisposed(): boolean { return this.disposed; }

  /** Releases every cached texture and prevents further loads. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearGroups();
    this.clearEntries();
    this.context.unregister(this);
  }

  private removeDisposedEntries(): void {
    let index = 0;
    while (index < this.paths.length) {
      const path = this.paths[index];
      const texture = this.textures.get(path);
      if (texture === undefined || texture.isDisposed) this.removeEntry(path);
      else index++;
    }
  }

  private removeGroup(group: AssetGroup): void {
    const index = this.groups.indexOf(group);
    if (index >= 0) this.groups.splice(index, 1);
  }

  private clearGroups(): void {
    while (this.groups.length > 0) {
      const group = this.groups.pop();
      if (group !== undefined) group.dispose();
    }
  }

  private removeEntry(path: string): void {
    this.textures.delete(path);
    const index = this.paths.lastIndexOf(path);
    if (index >= 0) this.paths.splice(index, 1);
  }

  private clearEntries(): void {
    while (this.paths.length > 0) {
      const path = this.paths.pop();
      if (path === undefined) continue;
      const texture = this.textures.get(path);
      this.textures.delete(path);
      if (texture !== undefined && !texture.isDisposed) texture.dispose();
    }
  }
}
