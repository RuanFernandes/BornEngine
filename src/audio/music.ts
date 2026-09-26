import { GameContext, ContextResource } from '../core/context';
import * as operations from './internal';

/** Opaque staged music load. Commit it to a context-owned Music when ready. */
export class StagedMusic implements ContextResource {
  readonly resourceKind = 'staged-music';
  private consumed = false;

  private constructor(
    private readonly context: GameContext,
    readonly path: string,
    private handleValue: number,
  ) {
    context.register(this);
  }

  static async stage(context: GameContext, path: string): Promise<StagedMusic> {
    const handle = !context.isReady || context.isDisposed ? 0 : await operations.stageMusicAsync(path);
    return new StagedMusic(context, path, handle);
  }

  static stageMany(context: GameContext, paths: string[]): StagedMusic[] {
    const handles = !context.isReady || context.isDisposed
      ? []
      : operations.stageSounds(paths);
    const staged: StagedMusic[] = [];
    for (let index = 0; index < paths.length; index++) {
      staged.push(new StagedMusic(context, paths[index], handles[index] || 0));
    }
    return staged;
  }

  get isReady(): boolean { return !this.consumed && this.handleValue !== 0 && this.context.isReady; }
  commit(): Music { return new Music(this.context, this); }

  private takeForCommit(context: GameContext): number {
    if (this.consumed || context !== this.context || !context.isReady) return 0;
    const handle = this.handleValue;
    this.handleValue = 0;
    this.consumed = true;
    context.unregister(this);
    return handle;
  }

  dispose(): void {
    if (this.consumed) return;
    // The current ABI does not expose a staged-music cancellation operation.
    this.handleValue = 0;
    this.consumed = true;
    this.context.unregister(this);
  }
}

/** Game-owned streamed music resource. */
export class Music implements ContextResource {
  readonly error: string | null;
  readonly path: string;
  private handleValue = 0;
  private disposed = false;

  constructor(private readonly context: GameContext, source: string | StagedMusic) {
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

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }
  get isPlaying(): boolean { return this.isLoaded && operations.isMusicPlayingRaw(this.handleValue); }

  play(): boolean { if (!this.isLoaded) return false; operations.playMusicRaw(this.handleValue); return true; }
  stop(): boolean { if (!this.isLoaded) return false; operations.stopMusicRaw(this.handleValue); return true; }
  update(): boolean { if (!this.isLoaded) return false; operations.updateMusicStreamRaw(this.handleValue); return true; }
  setVolume(volume: number): boolean { if (!this.isLoaded) return false; operations.setMusicVolumeRaw(this.handleValue, volume); return true; }

  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) {
      operations.stopMusicRaw(this.handleValue);
      operations.unloadMusicRaw(this.handleValue);
    }
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
