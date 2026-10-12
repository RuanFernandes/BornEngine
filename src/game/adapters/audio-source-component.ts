import type { Vec3 } from '../../core/types';
import type { Sound, SoundVoice } from '../../audio/sound';
import type { GameContext } from '../../core/context';
import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';

/** Playback options for an AudioSourceComponent. */
export interface AudioSourceComponentOptions {
  /** Repeat the sound until stopped. Defaults to false. */
  looping?: boolean;
  /** Distance at which the sound plays at full volume. Defaults to 1. */
  refDist?: number;
  /** Distance beyond which attenuation stops. Defaults to 0. */
  maxDist?: number;
  /** How quickly volume falls off with distance. Defaults to 1. */
  rolloff?: number;
}

/** Plays a shared Sound asset through a voice owned by this component. */
export class AudioSourceComponent extends GameComponent {
  /** The sound this component plays. */
  readonly sound: Sound;
  /** Whether playback repeats. */
  readonly looping: boolean;
  /** Reference distance for 3D attenuation. */
  readonly refDist: number;
  /** Maximum distance for 3D attenuation. */
  readonly maxDist: number;
  /** Rolloff factor for 3D attenuation. */
  readonly rolloff: number;
  private voice: SoundVoice | null = null;

  /** Creates a source for the given sound; call play() to start it. */
  constructor(sound: Sound, options: AudioSourceComponentOptions = {}) {
    super();
    this.sound = sound;
    this.looping = options.looping === undefined ? false : options.looping;
    this.refDist = options.refDist === undefined ? 1 : options.refDist;
    this.maxDist = options.maxDist === undefined ? 0 : options.maxDist;
    this.rolloff = options.rolloff === undefined ? 1 : options.rolloff;
  }

  _canAttachTo(context: GameContext): boolean {
    return this.sound._belongsToContext(context);
  }

  /**
   * Starts the sound at the owner's world position, restarting it if already playing. The voice follows the object after each update.
   * @returns false when the component is destroyed, unattached, or the sound is not loaded.
   */
  play(): boolean {
    this.stop();
    if (this.destroyed || !this.sound.isLoaded) return false;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return false;
    const position: Vec3 = owner.transform.worldPosition;
    this.voice = this.sound.play3D(position, {
      looping: this.looping,
      refDist: this.refDist,
      maxDist: this.maxDist,
      rolloff: this.rolloff,
    });
    // A null voice means the backend used its fire-and-forget fallback.
    return this.sound.isLoaded;
  }

  /** Stops the sound if it is playing. */
  stop(): void {
    if (this.voice === null) return;
    this.voice.stop();
    this.voice = null;
  }

  _syncRuntimeAfterPhase(): void {
    if (this.voice === null || !this.voice.isActive || this.destroyed) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    this.voice.setPosition(owner.transform.worldPosition);
  }

  /** Stops the sound when the component is destroyed. */
  onDestroy(): void {
    this.stop();
  }
}
