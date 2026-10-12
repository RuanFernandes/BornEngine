import { GameContext, ContextResource, getGameContext } from '../core/context';
import type { Game } from '../core/game';
import * as operations from './internal';

/** Opaque staged music load. Commit it to a context-owned Music when ready. */
export class StagedMusic implements ContextResource {
  /** Discriminator identifying this resource as staged music. */
  readonly resourceKind = 'staged-music';
  private consumed = false;

  private constructor(
    private readonly game: Game,
    readonly path: string,
    private handleValue: number,
  ) {
    getGameContext(game).register(this);
  }

  /** Stages one music file asynchronously on `game`. */
  static async stage(game: Game, path: string): Promise<StagedMusic> {
    const context = getGameContext(game);
    const handle = !context.isReady || context.isDisposed ? 0 : await operations.stageMusicAsync(path);
    return new StagedMusic(game, path, handle);
  }

  /** Stages several music files at once, returning one StagedMusic per path in the same order. */
  static stageMany(game: Game, paths: string[]): StagedMusic[] {
    const context = getGameContext(game);
    const handles = !context.isReady || context.isDisposed ? [] : operations.stageSounds(paths);
    const staged: StagedMusic[] = [];
    for (let index = 0; index < paths.length; index++) {
      staged.push(new StagedMusic(game, paths[index], handles[index] || 0));
    }
    return staged;
  }

  /** True while the staged data can still be committed. */
  get isReady(): boolean {
    return !this.consumed && this.handleValue !== 0 && this.context.isReady;
  }
  /** Converts the staged data into a Music. The staged object cannot be committed again. */
  commit(): Music {
    return Music._create(this.game, this);
  }

  private get context(): GameContext {
    return getGameContext(this.game);
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: invoked as (source as any).takeForCommit(context) from the Music constructor
  private takeForCommit(context: GameContext): number {
    if (this.consumed || context !== this.context || !context.isReady) return 0;
    const handle = this.handleValue;
    this.handleValue = 0;
    this.consumed = true;
    context.unregister(this);
    return handle;
  }

  /** Discards the staged data. Safe to call repeatedly. */
  dispose(): void {
    if (this.consumed) return;
    // The current ABI does not expose a staged-music cancellation operation.
    this.handleValue = 0;
    this.consumed = true;
    this.context.unregister(this);
  }
}

/** Streamed music resource owned by an asset scope. */
export class Music implements ContextResource {
  /** Load failure message, or null when the music loaded. */
  readonly error: string | null;
  /** Path the music was loaded from. */
  readonly path: string;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Audio resources are created by AudioSystem or an asset scope. */
  static _create(game: Game, source: string | StagedMusic): Music {
    return new Music(game, source);
  }

  private constructor(
    private readonly game: Game,
    source: string | StagedMusic,
  ) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed) {
      this.path = typeof source === 'string' ? source : source.path;
      this.error = 'The Game must be ready before loading music.';
      return;
    }

    if (typeof source === 'string') {
      this.path = source;
      this.handleValue = operations.loadMusicRaw(source);
    } else {
      this.path = source.path;
      if (source.resourceKind !== 'staged-music') {
        this.error = 'Unsupported music source.';
        return;
      }
      const stagedHandle = (source as any).takeForCommit(context);
      if (stagedHandle === 0) {
        this.error = 'Staged music is no longer available.';
        return;
      }
      this.handleValue = operations.commitMusic(stagedHandle).handle;
    }

    this.error = this.handleValue === 0 ? 'Unable to load music: ' + this.path : null;
    context.register(this);
  }

  /** True while the music is usable: loaded, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the music has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** True while the track is playing. */
  get isPlaying(): boolean {
    return this.isLoaded && operations.isMusicPlayingRaw(this.handleValue);
  }

  /** Starts playback. Returns false if the music is not loaded. */
  play(): boolean {
    if (!this.isLoaded) return false;
    operations.playMusicRaw(this.handleValue);
    return true;
  }
  /** Stops playback. Returns false if the music is not loaded. */
  stop(): boolean {
    if (!this.isLoaded) return false;
    operations.stopMusicRaw(this.handleValue);
    return true;
  }
  /**
   * Feeds the audio stream. AudioSystem calls this every frame for tracked music. Returns false if the music is not loaded.
   */
  update(): boolean {
    if (!this.isLoaded) return false;
    operations.updateMusicStreamRaw(this.handleValue);
    return true;
  }
  /** Sets the track volume. Returns false if the music is not loaded. */
  setVolume(volume: number): boolean {
    if (!this.isLoaded) return false;
    operations.setMusicVolumeRaw(this.handleValue, volume);
    return true;
  }

  /** Stops and unloads the music. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) {
      operations.stopMusicRaw(this.handleValue);
      operations.unloadMusicRaw(this.handleValue);
    }
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
    this.game.audio.untrackMusic(this);
  }
}
