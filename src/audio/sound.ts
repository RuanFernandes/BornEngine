import { GameContext, ContextResource } from '../core/context';
import type { Game } from '../core/game';
import * as operations from './internal';
import type { Vec3 } from '../core/types';

export interface SoundPlayOptions {
  volume?: number;
  pitch?: number;
}

export interface SpatialPlaybackOptions {
  looping?: boolean;
  refDist?: number;
  maxDist?: number;
  rolloff?: number;
}

export interface SoundVoice {
  readonly isActive: boolean;
  setPosition(position: Vec3): boolean;
  setVolume(volume: number): boolean;
  setPitch(pitch: number): boolean;
  setLowpass(cutoffHz: number): boolean;
  stop(): void;
  dispose(): void;
}

/** Opaque staged sound load. Commit it to a context-owned Sound when ready. */
export class StagedSound implements ContextResource {
  readonly resourceKind = 'staged-sound';
  private consumed = false;

  private constructor(
    private readonly game: Game,
    readonly path: string,
    private handleValue: number,
  ) {
    game.context.register(this);
  }

  static async stage(game: Game, path: string): Promise<StagedSound> {
    const context = game.context;
    const handle = !context.isReady || context.isDisposed ? 0 : await operations.stageSoundAsync(path);
    return new StagedSound(game, path, handle);
  }

  static stageMany(game: Game, paths: string[]): StagedSound[] {
    const context = game.context;
    const handles = !context.isReady || context.isDisposed
      ? []
      : operations.stageSounds(paths);
    const staged: StagedSound[] = [];
    for (let index = 0; index < paths.length; index++) {
      staged.push(new StagedSound(game, paths[index], handles[index] || 0));
    }
    return staged;
  }

  get isReady(): boolean { return !this.consumed && this.handleValue !== 0 && this.context.isReady; }

  commit(): Sound { return new Sound(this.game, this); }

  private get context(): GameContext { return this.game.context; }

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
    // The current ABI does not expose a staged-sound cancellation operation.
    this.handleValue = 0;
    this.consumed = true;
    this.context.unregister(this);
  }
}

/** Game-owned sound asset with playback and mixer controls. */
export class Sound implements ContextResource {
  readonly error: string | null;
  readonly path: string;
  private handleValue = 0;
  private disposed = false;
  private voices: AudioVoice[] = [];
  private readonly context: GameContext;

  constructor(private readonly game: Game, source: string | StagedSound) {
    this.context = game.context;
    const context = this.context;
    let loaded: { handle: number } = { handle: 0 };
    if (!context.isReady || context.isDisposed) {
      this.path = typeof source === 'string' ? source : source.path;
      this.error = 'The Game must be ready before loading sounds.';
      return;
    }

    if (typeof source === 'string') {
      this.path = source;
      loaded = operations.loadSound(source);
    } else {
      this.path = source.path;
      if (source.resourceKind !== 'staged-sound') {
        this.error = 'Unsupported sound source.';
        return;
      }
      const stagedHandle = (source as any).takeForCommit(context);
      if (stagedHandle === 0) {
        this.error = 'Staged sound is no longer available.';
        return;
      }
      loaded = operations.commitSound(stagedHandle);
    }

    this.handleValue = loaded.handle;
    this.error = this.handleValue === 0 ? 'Unable to load sound: ' + this.path : null;
    context.register(this);
  }

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }
  _belongsToContext(context: GameContext): boolean { return this.context === context; }

  play(options: SoundPlayOptions = {}): boolean {
    if (!this.isLoaded) return false;
    const voiceHandle = operations.playSoundEx(this.toNativeSound());
    if (voiceHandle === 0) {
      operations.playSound(this.toNativeSound());
      return true;
    }
    const voice = this.trackVoice(voiceHandle);
    if (options.volume !== undefined) voice.setVolume(options.volume);
    if (options.pitch !== undefined) voice.setPitch(options.pitch);
    return true;
  }

  play3D(position: Vec3, options: SpatialPlaybackOptions = {}): SoundVoice | null {
    if (!this.isLoaded) return null;
    const voiceHandle = operations.playSound3DEx(
      this.toNativeSound(), position.x, position.y, position.z,
      options.looping === undefined ? false : options.looping,
      options.refDist === undefined ? 1 : options.refDist,
      options.maxDist === undefined ? 0 : options.maxDist,
      options.rolloff === undefined ? 1 : options.rolloff,
    );
    if (voiceHandle === 0) {
      operations.playSound3D(this.toNativeSound(), position.x, position.y, position.z);
      return null;
    }
    return this.trackVoice(voiceHandle);
  }

  stop(): boolean {
    if (!this.isLoaded) return false;
    operations.stopSound(this.toNativeSound());
    for (let index = this.voices.length - 1; index >= 0; index--) this.voices[index].stop();
    return true;
  }

  setVolume(volume: number): boolean { if (!this.isLoaded) return false; operations.setSoundVolume(this.toNativeSound(), volume); return true; }
  setBus(bus: number): boolean { if (!this.isLoaded) return false; operations.setSoundBus(this.toNativeSound(), bus); return true; }
  setReverbSend(send: number): boolean { if (!this.isLoaded) return false; operations.setSoundReverbSend(this.toNativeSound(), send); return true; }
  setLowpass(cutoffHz: number): boolean { if (!this.isLoaded) return false; operations.setSoundLowpass(this.toNativeSound(), cutoffHz); return true; }

  private trackVoice(handle: number): AudioVoice {
    const voice = new AudioVoice(this, handle);
    this.voices.push(voice);
    return voice;
  }

  /** @internal */
  removeVoice(voice: SoundVoice): void {
    const index = this.voices.lastIndexOf(voice as AudioVoice);
    if (index >= 0) this.voices.splice(index, 1);
  }

  private toNativeSound(): { handle: number } { return { handle: this.handleValue }; }

  dispose(): void {
    if (this.disposed) return;
    for (let index = this.voices.length - 1; index >= 0; index--) this.voices[index].dispose();
    this.voices.length = 0;
    if (this.handleValue !== 0) {
      operations.stopSound(this.toNativeSound());
      operations.unloadSound(this.toNativeSound());
    }
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}

/** Controllable playback instance returned for spatial or varied playback. */
class AudioVoice implements SoundVoice {
  private handleValue: number;

  constructor(private readonly sound: Sound, handle: number) { this.handleValue = handle; }

  get isActive(): boolean { return this.handleValue !== 0 && this.sound.isLoaded; }
  setPosition(position: Vec3): boolean {
    if (!this.isActive) return false;
    operations.voiceSetPosition(this.handleValue, position.x, position.y, position.z);
    return true;
  }
  setVolume(volume: number): boolean { if (!this.isActive) return false; operations.voiceSetVolume(this.handleValue, volume); return true; }
  setPitch(pitch: number): boolean { if (!this.isActive) return false; operations.voiceSetPitch(this.handleValue, pitch); return true; }
  setLowpass(cutoffHz: number): boolean { if (!this.isActive) return false; operations.voiceSetLowpass(this.handleValue, cutoffHz); return true; }

  stop(): void {
    if (this.handleValue === 0) return;
    operations.voiceStop(this.handleValue);
    this.handleValue = 0;
    this.sound.removeVoice(this);
  }

  dispose(): void { this.stop(); }
}
