import type { Game } from '../core/game';
import { GameContext, getGameContext } from '../core/context';
import type { ContextResource } from '../core/context';
import { Texture } from '../textures/texture';
import type { ImageData } from '../textures/image-data';
import { ImageData as ImageDataResource } from '../textures/image-data';
import { RenderTexture } from '../textures/render-texture';
import { Model, Mesh } from '../models/model';
import { Material } from '../models/material';
import type { MaterialKind } from '../models/material';
import { Animation } from '../models/animation';
import { Font } from '../text/font';
import type { Sound } from '../audio/sound';
import type { Music } from '../audio/music';
import { AssetGroup } from './asset-group';
import type { AssetGroupLoader } from './asset-group';

interface ManagedAsset {
  dispose(): void;
  isDisposed?: boolean;
}

/**
 * A Game- or Scene-owned asset factory. Game.assets keeps shared assets until
 * Game shutdown; Scene.assets uses the same API and releases its assets when
 * that Scene unloads.
 */
export class AssetManager implements ContextResource {
  private readonly context: GameContext;
  private readonly textures = new Map<string, Texture>();
  private readonly texturePaths: string[] = [];
  private readonly models = new Map<string, Model>();
  private readonly modelPaths: string[] = [];
  private readonly fonts = new Map<string, Font>();
  private readonly fontKeys: string[] = [];
  private readonly sounds = new Map<string, Sound>();
  private readonly soundPaths: string[] = [];
  private readonly soundLoads = new Map<string, Promise<Sound | null>>();
  private readonly music = new Map<string, Music>();
  private readonly musicPaths: string[] = [];
  private readonly musicLoads = new Map<string, Promise<Music | null>>();
  private readonly resources: ManagedAsset[] = [];
  private readonly groups: AssetGroup[] = [];
  private disposed = false;
  private generation = 0;

  constructor(private readonly game: Game) {
    this.context = getGameContext(game);
    if (this.context.isReady) this.context.register(this);
  }

  /**
   * Loads and caches a texture by path. Repeated calls in the same scope
   * return the same Texture. Failed loads preserve their `error` for inspection.
   */
  loadTexture(path: string): Texture | null {
    if (!this.canCreate(path)) return null;
    const cached = this.getTexture(path);
    if (cached !== null) return cached;

    const texture = this.track(Texture._create(this.game, path));
    if (texture === null) return null;
    if (this.context.isReady) {
      this.textures.set(path, texture);
      this.texturePaths.push(path);
    }
    return texture;
  }

  /** Returns a cached texture without loading it, or null when not cached. */
  getTexture(path: string): Texture | null {
    if (!this.canCreate(path)) return null;
    const texture = this.textures.get(path);
    if (texture === undefined) return null;
    if (texture.isDisposed) {
      this.removeTextureEntry(path);
      return null;
    }
    return texture;
  }

  /** Disposes and removes the cached texture registered for this path. */
  releaseTexture(path: string): boolean {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return false;
    const texture = this.textures.get(path);
    if (texture === undefined) return false;
    this.removeTextureEntry(path);
    this.releaseResource(texture);
    return true;
  }

  /** Loads and caches a 3D model by path in this asset scope. */
  loadModel(path: string): Model | null {
    if (!this.canCreate(path)) return null;
    const cached = this.models.get(path);
    if (cached !== undefined && !cached.isDisposed) return cached;
    if (cached !== undefined) this.removeModelEntry(path);

    const model = this.track(Model._create(this.game, path));
    if (model === null) return null;
    if (this.context.isReady) {
      this.models.set(path, model);
      this.modelPaths.push(path);
    }
    return model;
  }

  /** Returns a model loaded by this scope without performing disk or native work. */
  getModel(path: string): Model | null {
    if (!this.canCreate(path)) return null;
    const model = this.models.get(path);
    if (model === undefined || model.isDisposed) return null;
    return model;
  }

  /** Disposes and removes the cached model registered for this path. */
  releaseModel(path: string): boolean {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return false;
    const model = this.models.get(path);
    if (model === undefined) return false;
    this.removeModelEntry(path);
    this.releaseResource(model);
    return true;
  }

  /** Disposes and removes a cached sound registered for this path. */
  releaseSound(path: string): boolean {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return false;
    const sound = this.sounds.get(path);
    if (sound === undefined) return false;
    this.removeSoundEntry(path);
    this.releaseResource(sound);
    return true;
  }

  /** Disposes and removes cached music registered for this path. */
  releaseMusic(path: string): boolean {
    if (this.disposed || this.context.isDisposed || path === null || path === undefined || path.length === 0) return false;
    const music = this.music.get(path);
    if (music === undefined) return false;
    this.removeMusicEntry(path);
    this.releaseResource(music);
    return true;
  }

  /** Loads and caches a font by path and point size. */
  loadFont(path: string, size: number): Font | null {
    if (!this.canCreate(path) || size <= 0 || size !== size || size === Infinity || size === -Infinity) return null;
    const key = this.fontKey(path, size);
    const cached = this.fonts.get(key);
    if (cached !== undefined && !cached.isDisposed) return cached;
    if (cached !== undefined) this.removeFontEntry(key);

    const font = this.track(Font._create(this.game, path, size));
    if (font === null) return null;
    if (this.context.isReady) {
      this.fonts.set(key, font);
      this.fontKeys.push(key);
    }
    return font;
  }

  /** Returns a cached font, identified by both path and point size. */
  getFont(path: string, size: number): Font | null {
    if (!this.canCreate(path)) return null;
    const key = this.fontKey(path, size);
    const font = this.fonts.get(key);
    if (font === undefined || font.isDisposed) return null;
    return font;
  }

  /** Loads and caches a sound effect by path in this asset scope. */
  loadSound(path: string): Sound | null {
    if (!this.canCreate(path)) return null;
    const cached = this.sounds.get(path);
    if (cached !== undefined && !cached.isDisposed) return cached;
    if (cached !== undefined) this.removeSoundEntry(path);
    const sound = this.track(this.game.audio.loadSound(path));
    if (sound === null) return null;
    if (this.context.isReady) {
      this.sounds.set(path, sound);
      this.soundPaths.push(path);
    }
    return sound;
  }

  /** Loads and caches streamed music by path in this asset scope. */
  loadMusic(path: string): Music | null {
    if (!this.canCreate(path)) return null;
    const cached = this.music.get(path);
    if (cached !== undefined && !cached.isDisposed) return cached;
    if (cached !== undefined) this.removeMusicEntry(path);
    const music = this.track(this.game.audio.loadMusic(path));
    if (music === null) return null;
    if (this.context.isReady) {
      this.music.set(path, music);
      this.musicPaths.push(path);
    }
    return music;
  }

  /** Creates a Texture from prepared image data or an offscreen target. */
  createTexture(source: ImageData | RenderTexture): Texture | null {
    if (this.disposed || this.context.isDisposed || source === null || source === undefined) return null;
    return this.track(Texture._create(this.game, source));
  }

  /** Creates an independent indexed mesh owned by this scope. */
  createMesh(vertices: number[], indices: number[]): Mesh | null {
    if (!this.canCreate('mesh') || vertices.length === 0 || indices.length === 0) return null;
    return this.track(Mesh._create(this.game, vertices, indices));
  }

  /** Compiles and owns a GPU material in this scope. */
  createMaterial(source: string, kind: MaterialKind = 'opaque'): Material | null {
    if (!this.canCreate('material') || source.length === 0) return null;
    return this.track(Material._create(this.game, source, kind));
  }

  /** Creates a fresh skeletal animation controller for one model instance. */
  createAnimation(path: string): Animation | null {
    if (!this.canCreate(path)) return null;
    return this.track(Animation._create(this.game, path));
  }

  /** Loads CPU-side image data that can be cropped or resized before upload. */
  createImageData(path: string): ImageData | null {
    if (!this.canCreate(path)) return null;
    return this.track(ImageDataResource._create(this.game, path));
  }

  /** Creates an offscreen render target owned by this scope. */
  createRenderTexture(width: number, height: number): RenderTexture | null {
    if (!this.canCreate('render texture') || width <= 0 || height <= 0) return null;
    return this.track(RenderTexture._create(this.game, width, height));
  }

  /** Disposes a specific resource created by this manager. */
  release(resource: ManagedAsset): boolean {
    return this.releaseResource(resource);
  }

  /** Number of cached, non-disposed Texture instances in this scope. */
  get textureCount(): number {
    this.removeDisposedTextures();
    return this.texturePaths.length;
  }

  /** Number of live resources created by this manager. */
  get resourceCount(): number {
    this.removeDisposedResources();
    return this.resources.length;
  }

  /** Create a named preload group backed by this scope's texture cache. */
  createGroup(name = ''): AssetGroup | null {
    if (this.disposed || this.context.isDisposed) return null;
    const loader: AssetGroupLoader = {
      loadTexture: (path) => this.loadTexture(path),
      loadSound: (path) => this.loadGroupSound(path),
      loadMusic: (path) => this.loadGroupMusic(path),
      removeGroup: (group) => this.removeGroup(group),
    };
    const group = new AssetGroup(name, loader, this.context);
    this.groups.push(group);
    return group;
  }

  /** Disposes all resources while keeping this manager available for reuse. */
  clear(): void {
    if (this.disposed) return;
    this.clearGroups();
    this.clearCaches();
    this.disposeResources();
  }

  get isDisposed(): boolean { return this.disposed; }

  /** Releases all resources and prevents further creation. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearGroups();
    this.clearCaches();
    this.disposeResources();
    this.context.unregister(this);
  }

  private canCreate(key: string): boolean {
    return !this.disposed && !this.context.isDisposed && key !== null && key !== undefined && key.length > 0;
  }

  private loadGroupSound(path: string): Promise<Sound | null> {
    if (!this.canCreate(path)) return Promise.resolve(null);
    const cached = this.sounds.get(path);
    if (cached !== undefined && !cached.isDisposed) return Promise.resolve(cached);
    if (cached !== undefined) this.removeSoundEntry(path);
    const pending = this.soundLoads.get(path);
    if (pending !== undefined) return pending;

    const generation = this.generation;
    let loading: Promise<Sound | null>;
    loading = this.game.audio.loadSoundAsync(path).then(
      (sound) => {
        if (this.disposed || this.context.isDisposed || generation !== this.generation) {
          sound.dispose();
          return null;
        }
        const tracked = this.track(sound);
        if (tracked === null) return null;
        if (this.context.isReady) {
          this.sounds.set(path, sound);
          this.soundPaths.push(path);
        }
        return sound;
      },
      (_error) => null,
    ).then((sound) => {
      if (this.soundLoads.get(path) === loading) this.soundLoads.delete(path);
      return sound;
    });
    this.soundLoads.set(path, loading);
    return loading;
  }

  private loadGroupMusic(path: string): Promise<Music | null> {
    if (!this.canCreate(path)) return Promise.resolve(null);
    const cached = this.music.get(path);
    if (cached !== undefined && !cached.isDisposed) return Promise.resolve(cached);
    if (cached !== undefined) this.removeMusicEntry(path);
    const pending = this.musicLoads.get(path);
    if (pending !== undefined) return pending;

    const generation = this.generation;
    let loading: Promise<Music | null>;
    loading = this.game.audio.loadMusicAsync(path).then(
      (music) => {
        if (this.disposed || this.context.isDisposed || generation !== this.generation) {
          music.dispose();
          return null;
        }
        const tracked = this.track(music);
        if (tracked === null) return null;
        if (this.context.isReady) {
          this.music.set(path, music);
          this.musicPaths.push(path);
        }
        return music;
      },
      (_error) => null,
    ).then((music) => {
      if (this.musicLoads.get(path) === loading) this.musicLoads.delete(path);
      return music;
    });
    this.musicLoads.set(path, loading);
    return loading;
  }

  private track<T extends ManagedAsset>(resource: T): T | null {
    if (this.disposed || this.context.isDisposed) {
      resource.dispose();
      return null;
    }
    if (this.context.isReady) this.context.register(this);
    this.resources.push(resource);
    return resource;
  }

  private releaseResource(resource: ManagedAsset): boolean {
    let index = this.resources.indexOf(resource);
    if (index < 0) return false;
    this.resources.splice(index, 1);
    for (index = this.texturePaths.length - 1; index >= 0; index--) {
      const path = this.texturePaths[index];
      if (this.textures.get(path) === resource) this.removeTextureEntry(path);
    }
    for (index = this.modelPaths.length - 1; index >= 0; index--) {
      const path = this.modelPaths[index];
      if (this.models.get(path) === resource) this.removeModelEntry(path);
    }
    for (index = this.fontKeys.length - 1; index >= 0; index--) {
      const key = this.fontKeys[index];
      if (this.fonts.get(key) === resource) this.removeFontEntry(key);
    }
    for (index = this.soundPaths.length - 1; index >= 0; index--) {
      const path = this.soundPaths[index];
      if (this.sounds.get(path) === resource) this.removeSoundEntry(path);
    }
    for (index = this.musicPaths.length - 1; index >= 0; index--) {
      const path = this.musicPaths[index];
      if (this.music.get(path) === resource) this.removeMusicEntry(path);
    }
    if (resource.isDisposed !== true) resource.dispose();
    return true;
  }

  private disposeResources(): void {
    while (this.resources.length > 0) {
      const resource = this.resources.pop();
      if (resource !== undefined && resource.isDisposed !== true) resource.dispose();
    }
  }

  private removeDisposedResources(): void {
    let index = 0;
    while (index < this.resources.length) {
      if (this.resources[index].isDisposed === true) this.resources.splice(index, 1);
      else index++;
    }
  }

  private removeDisposedTextures(): void {
    let index = 0;
    while (index < this.texturePaths.length) {
      const path = this.texturePaths[index];
      const texture = this.textures.get(path);
      if (texture === undefined || texture.isDisposed) this.removeTextureEntry(path);
      else index++;
    }
  }

  private removeTextureEntry(path: string): void {
    this.textures.delete(path);
    const index = this.texturePaths.lastIndexOf(path);
    if (index >= 0) this.texturePaths.splice(index, 1);
  }

  private removeModelEntry(path: string): void {
    this.models.delete(path);
    const index = this.modelPaths.lastIndexOf(path);
    if (index >= 0) this.modelPaths.splice(index, 1);
  }

  private removeFontEntry(key: string): void {
    this.fonts.delete(key);
    const index = this.fontKeys.lastIndexOf(key);
    if (index >= 0) this.fontKeys.splice(index, 1);
  }

  private removeSoundEntry(path: string): void {
    this.sounds.delete(path);
    const index = this.soundPaths.lastIndexOf(path);
    if (index >= 0) this.soundPaths.splice(index, 1);
  }

  private removeMusicEntry(path: string): void {
    this.music.delete(path);
    const index = this.musicPaths.lastIndexOf(path);
    if (index >= 0) this.musicPaths.splice(index, 1);
  }

  private fontKey(path: string, size: number): string {
    return path + '#' + size;
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

  private clearCaches(): void {
    this.generation++;
    this.textures.clear();
    this.texturePaths.length = 0;
    this.models.clear();
    this.modelPaths.length = 0;
    this.fonts.clear();
    this.fontKeys.length = 0;
    this.sounds.clear();
    this.soundPaths.length = 0;
    this.soundLoads.clear();
    this.music.clear();
    this.musicPaths.length = 0;
    this.musicLoads.clear();
  }
}

/** Same resource factories as AssetManager, with a Scene-controlled lifetime. */
export class SceneAssetManager extends AssetManager {}
