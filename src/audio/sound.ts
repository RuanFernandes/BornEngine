import { GameContext, ContextResource, getGameContext } from '../core/context';
import type { Game } from '../core/game';
import * as operations from './internal';
import type { Vec3 } from '../core/types';

/** Options for Sound.play. */
export interface SoundPlayOptions {
  /** Volume for this playback. */
  volume?: number;
  /** Playback-rate multiplier for this playback, clamped to 0.25..4. */
  pitch?: number;
}

/** Options for 3D sound playback. */
export interface SpatialPlaybackOptions {
  /** Whether playback repeats until stopped. Defaults to false. */
  looping?: boolean;
  /** Distance range that plays at full volume. Defaults to 1. */
  refDist?: number;
  /** Distance past which the voice is culled; 0 means never. Defaults to 0. */
  maxDist?: number;
  /** How quickly volume falls past `refDist`; 1 is the physical inverse law. Defaults to 1. */
  rolloff?: number;
}

/** Handle to one playing instance of a sound, used to move, adjust or stop it. */
export interface SoundVoice {
  /** True while the voice is still playing and its sound is loaded. */
  readonly isActive: boolean;
  /** Moves the voice in 3D space. Returns false if the voice is no longer active. */
  setPosition(position: Vec3): boolean;
  /**
   * Sets the voice volume, multiplied with the sound and bus volume. Returns false if the voice is no longer active.
   */
  setVolume(volume: number): boolean;
  /** Sets the playback-rate multiplier, clamped to 0.25..4. Returns false if the voice is no longer active. */
  setPitch(pitch: number): boolean;
  /**
   * Sets a low-pass cutoff in Hz for this voice only; 0 disables it. Returns false if the voice is no longer active.
   */
  setLowpass(cutoffHz: number): boolean;
  /** Stops the voice. Safe to call repeatedly. */
  stop(): void;
  /** Stops the voice; equivalent to `stop()`. */
  dispose(): void;
}

/** Opaque staged sound load. Commit it to a context-owned Sound when ready. */
export class StagedSound implements ContextResource {
  /** Discriminator identifying this resource as a staged sound. */
  readonly resourceKind = 'staged-sound';
  private consumed = false;

  private constructor(
    private readonly game: Game,
    readonly path: string,
    private handleValue: number,
  ) {
    getGameContext(game).register(this);
  }

  /** Stages one sound file asynchronously on `game`. */
  static async stage(game: Game, path: string): Promise<StagedSound> {
    const context = getGameContext(game);
    const handle = !context.isReady || context.isDisposed ? 0 : await operations.stageSoundAsync(path);
    return new StagedSound(game, path, handle);
  }

  /** Stages several sound files at once, returning one StagedSound per path in the same order. */
  static stageMany(game: Game, paths: string[]): StagedSound[] {
    const context = getGameContext(game);
    const handles = !context.isReady || context.isDisposed ? [] : operations.stageSounds(paths);
    const staged: StagedSound[] = [];
    for (let index = 0; index < paths.length; index++) {
      staged.push(new StagedSound(game, paths[index], handles[index] || 0));
    }
    return staged;
  }

  /** True while the staged data can still be committed. */
  get isReady(): boolean {
    return !this.consumed && this.handleValue !== 0 && this.context.isReady;
  }

  /** Converts the staged data into a Sound. The staged object cannot be committed again. */
  commit(): Sound {
    return Sound._create(this.game, this);
  }

  private get context(): GameContext {
    return getGameContext(this.game);
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: invoked as (source as any).takeForCommit(context) from the Sound constructor
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
    // The current ABI does not expose a staged-sound cancellation operation.
    this.handleValue = 0;
    this.consumed = true;
    this.context.unregister(this);
  }
}

/** Sound asset with playback and mixer controls, owned by an asset scope. */
export class Sound implements ContextResource {
  /** Load failure message, or null when the sound loaded. */
  readonly error: string | null;
  /** Path the sound was loaded from. */
  readonly path: string;
  private handleValue = 0;
  private disposed = false;
  private voices: AudioVoice[] = [];
  private readonly context: GameContext;

  /** @internal Audio resources are created by AudioSystem or an asset scope. */
  static _create(game: Game, source: string | StagedSound): Sound {
    return new Sound(game, source);
  }

  private constructor(
    private readonly game: Game,
    source: string | StagedSound,
  ) {
    this.context = getGameContext(game);
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

  /** True while the sound is usable: loaded, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the sound has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  _belongsToContext(context: GameContext): boolean {
    return this.context === context;
  }

  /** Plays the sound, optionally with a volume and pitch. Returns false if the sound is not loaded. */
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

  /**
   * Plays the sound at a 3D position. Returns a voice to control it, or null if the sound is not loaded or no voice could be created.
   */
  play3D(position: Vec3, options: SpatialPlaybackOptions = {}): SoundVoice | null {
    if (!this.isLoaded) return null;
    const voiceHandle = operations.playSound3DEx(
      this.toNativeSound(),
      position.x,
      position.y,
      position.z,
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

  /** Stops every playing instance of this sound. Returns false if the sound is not loaded. */
  stop(): boolean {
    if (!this.isLoaded) return false;
    operations.stopSound(this.toNativeSound());
    for (let index = this.voices.length - 1; index >= 0; index--) this.voices[index].stop();
    return true;
  }

  /** Sets the base volume of the sound. Returns false if the sound is not loaded. */
  setVolume(volume: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSoundVolume(this.toNativeSound(), volume);
    return true;
  }
  /** Routes the sound to a mix bus (`BUS_SFX`, `BUS_MUSIC` or `BUS_UI`). Returns false if the sound is not loaded. */
  setBus(bus: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSoundBus(this.toNativeSound(), bus);
    return true;
  }
  /** Sets how much of the sound feeds the reverb, 0..1. Returns false if the sound is not loaded. */
  setReverbSend(send: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSoundReverbSend(this.toNativeSound(), send);
    return true;
  }
  /** Sets a low-pass cutoff in Hz for the whole sound; 0 disables it. Returns false if the sound is not loaded. */
  setLowpass(cutoffHz: number): boolean {
    if (!this.isLoaded) return false;
    operations.setSoundLowpass(this.toNativeSound(), cutoffHz);
    return true;
  }

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

  private toNativeSound(): { handle: number } {
    return { handle: this.handleValue };
  }

  /** Stops and unloads the sound. Safe to call repeatedly. */
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
    this.game.audio.untrackSound(this);
  }
}

/** Controllable playback instance returned for spatial or varied playback. */
class AudioVoice implements SoundVoice {
  private handleValue: number;

  constructor(
    private readonly sound: Sound,
    handle: number,
  ) {
    this.handleValue = handle;
  }

  get isActive(): boolean {
    return this.handleValue !== 0 && this.sound.isLoaded;
  }
  setPosition(position: Vec3): boolean {
    if (!this.isActive) return false;
    operations.voiceSetPosition(this.handleValue, position.x, position.y, position.z);
    return true;
  }
  setVolume(volume: number): boolean {
    if (!this.isActive) return false;
    operations.voiceSetVolume(this.handleValue, volume);
    return true;
  }
  setPitch(pitch: number): boolean {
    if (!this.isActive) return false;
    operations.voiceSetPitch(this.handleValue, pitch);
    return true;
  }
  setLowpass(cutoffHz: number): boolean {
    if (!this.isActive) return false;
    operations.voiceSetLowpass(this.handleValue, cutoffHz);
    return true;
  }

  stop(): void {
    if (this.handleValue === 0) return;
    operations.voiceStop(this.handleValue);
    this.handleValue = 0;
    this.sound.removeVoice(this);
  }

  dispose(): void {
    this.stop();
  }
}
