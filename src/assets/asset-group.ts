import type { GameContext } from '../core/context';
import type { Texture } from '../textures/texture';
import type { Sound } from '../audio/sound';
import type { Music } from '../audio/music';

/** Kind of asset an AssetGroup entry loads. */
export type AssetGroupKind = 'texture' | 'sound' | 'music';
/** Lifecycle state of an AssetGroup. */
export type AssetGroupState = 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled' | 'disposed';
/** Load state of a single AssetGroup entry. */
export type AssetGroupEntryState = 'pending' | 'ready' | 'failed' | 'cancelled';
/** Any asset an AssetGroup entry can resolve to. */
export type AssetGroupAsset = Texture | Sound | Music;

/** Snapshot of one AssetGroup entry, including its outcome once settled. */
export interface AssetGroupEntryResult {
  /** Kind of asset this entry loads. */
  kind: AssetGroupKind;
  /** Asset path as passed when the entry was added. */
  path: string;
  /** Current load state of the entry. */
  state: AssetGroupEntryState;
  /** Loaded asset, or null while pending or when the load failed or was cancelled. */
  result: AssetGroupAsset | null;
  /** Failure or cancellation message, or null otherwise. */
  error: string | null;
}

/** @internal Loading operations supplied by the owning AssetManager. */
export interface AssetGroupLoader {
  loadTexture(path: string): Texture | null;
  loadSound(path: string): Promise<Sound | null>;
  loadMusic(path: string): Promise<Music | null>;
  removeGroup(group: AssetGroup): void;
}

interface AssetGroupEntry extends AssetGroupEntryResult {
  settled: boolean;
}

function loaded(resource: AssetGroupAsset | null): boolean {
  return resource !== null && (resource as any).isLoaded === true;
}

function resourceError(resource: AssetGroupAsset | null): string {
  if (resource === null) return 'Asset could not be loaded.';
  const error = (resource as any).error;
  return typeof error === 'string' && error.length > 0 ? error : 'Asset could not be loaded.';
}

/**
 * A named preload batch. Entry resources remain owned by its AssetManager;
 * disposing this group only releases its result references.
 */
export class AssetGroup {
  private entriesValue: AssetGroupEntry[] = [];
  private currentState: AssetGroupState = 'idle';
  private completedCount = 0;
  private pendingLoad: Promise<AssetGroupState> | null = null;
  private resolvePendingLoad: ((state: AssetGroupState) => void) | null = null;
  private disposed = false;

  /** Creates a group named `name`. Create groups with `AssetManager.createGroup()` instead of calling this directly. */
  constructor(
    readonly name: string,
    private readonly loader: AssetGroupLoader,
    private readonly context: GameContext,
  ) {
    if (context.isReady && !context.isDisposed) context.register(this);
  }

  /** Current lifecycle state of the group. */
  get state(): AssetGroupState {
    return this.currentState;
  }
  /** True once the group has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** Number of entries added to the group. */
  get entryCount(): number {
    return this.entriesValue.length;
  }
  /** Fraction of entries finished, 0..1. Includes failed and cancelled entries. */
  get progress(): number {
    if (this.entriesValue.length === 0) return this.currentState === 'idle' ? 0 : 1;
    return this.completedCount / this.entriesValue.length;
  }
  /** Snapshot of every entry and its current state. */
  get entries(): readonly AssetGroupEntryResult[] {
    const snapshot: AssetGroupEntryResult[] = [];
    for (let index = 0; index < this.entriesValue.length; index++) {
      const entry = this.entriesValue[index];
      snapshot.push({
        kind: entry.kind,
        path: entry.path,
        state: entry.state,
        result: entry.result,
        error: entry.error,
      });
    }
    return snapshot;
  }

  /**
   * Adds a texture to preload. Returns false if the group is no longer idle, the path is empty, or the entry is a duplicate.
   */
  addTexture(path: string): boolean {
    return this.add('texture', path);
  }
  /**
   * Adds a sound to preload. Returns false if the group is no longer idle, the path is empty, or the entry is a duplicate.
   */
  addSound(path: string): boolean {
    return this.add('sound', path);
  }
  /**
   * Adds a music track to preload. Returns false if the group is no longer idle, the path is empty, or the entry is a duplicate.
   */
  addMusic(path: string): boolean {
    return this.add('music', path);
  }

  /** Start all entries once. Individual failures remain available in `entries`. */
  load(): Promise<AssetGroupState> {
    if (this.pendingLoad !== null) return this.pendingLoad;
    if (this.currentState === 'cancelled' || this.disposed) {
      return Promise.resolve(this.currentState);
    }

    if (this.context.isReady && !this.context.isDisposed) this.context.register(this);

    this.currentState = 'loading';
    if (this.entriesValue.length === 0) {
      this.currentState = 'ready';
      this.pendingLoad = Promise.resolve(this.currentState);
      return this.pendingLoad;
    }

    this.pendingLoad = new Promise((resolve) => {
      this.resolvePendingLoad = resolve;
    });
    for (let index = 0; index < this.entriesValue.length; index++) {
      this.loadEntry(this.entriesValue[index]);
    }
    return this.pendingLoad;
  }

  /** Mark unresolved work cancelled; loaded resources stay owned by the AssetManager. */
  cancel(): void {
    if (this.currentState !== 'idle' && this.currentState !== 'loading') return;
    this.currentState = 'cancelled';
    for (let index = 0; index < this.entriesValue.length; index++) {
      const entry = this.entriesValue[index];
      if (entry.settled) continue;
      entry.settled = true;
      entry.state = 'cancelled';
      entry.error = 'Asset loading was cancelled.';
      this.completedCount++;
    }
    this.resolveLoad();
  }

  /** Cancels unfinished loading and releases the group. Loaded assets stay owned by the AssetManager. */
  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.currentState = 'disposed';
    this.entriesValue.length = 0;
    this.context.unregister(this);
    this.loader.removeGroup(this);
  }

  private add(kind: AssetGroupKind, path: string): boolean {
    if (this.disposed || this.currentState !== 'idle' || typeof path !== 'string' || path.length === 0) return false;
    for (let index = 0; index < this.entriesValue.length; index++) {
      const entry = this.entriesValue[index];
      if (entry.kind === kind && entry.path === path) return false;
    }
    this.entriesValue.push({
      kind,
      path,
      state: 'pending',
      result: null,
      error: null,
      settled: false,
    });
    return true;
  }

  private loadEntry(entry: AssetGroupEntry): void {
    if (entry.kind === 'texture') {
      let resource: Texture | null = null;
      try {
        resource = this.loader.loadTexture(entry.path);
      } catch (_error) {
        resource = null;
      }
      this.settleEntry(entry, resource);
      return;
    }

    let loading: Promise<Sound | Music | null>;
    try {
      loading = entry.kind === 'sound' ? this.loader.loadSound(entry.path) : this.loader.loadMusic(entry.path);
    } catch (_error) {
      this.settleEntry(entry, null);
      return;
    }

    loading.then(
      (resource) => this.settleEntry(entry, resource),
      (_error) => this.settleEntry(entry, null),
    );
  }

  private settleEntry(entry: AssetGroupEntry, resource: AssetGroupAsset | null): void {
    if (entry.settled || this.disposed || this.currentState === 'cancelled') return;
    entry.settled = true;
    entry.result = resource;
    if (loaded(resource)) {
      entry.state = 'ready';
    } else {
      entry.state = 'failed';
      entry.error = resourceError(resource);
    }
    this.completedCount++;
    if (this.completedCount === this.entriesValue.length) {
      let hasFailure = false;
      for (let index = 0; index < this.entriesValue.length; index++) {
        if (this.entriesValue[index].state === 'failed') hasFailure = true;
      }
      this.currentState = hasFailure ? 'failed' : 'ready';
      this.resolveLoad();
    }
  }

  private resolveLoad(): void {
    const resolve = this.resolvePendingLoad;
    this.resolvePendingLoad = null;
    if (resolve !== null) resolve(this.currentState);
  }
}
