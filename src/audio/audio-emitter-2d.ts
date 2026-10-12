import type { GameContext } from '../core/context';
import type { Vec3 } from '../core/types';
import type { Sound, SoundVoice, SpatialPlaybackOptions } from './sound';
import { AudioListener2D } from './audio-listener-2d';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';

/** Playback options for an AudioEmitter2D; same fields as SpatialPlaybackOptions. */
export interface AudioEmitter2DOptions extends SpatialPlaybackOptions {}

/** Spatial playback component for GameObjects positioned in the XY world plane. */
export class AudioEmitter2D extends GameComponent {
  /** Sound this emitter plays. */
  readonly sound: Sound;
  /** Listener the emitter is heard from. It must belong to the same Game as the emitter. */
  readonly listener: AudioListener2D;
  /** Whether playback repeats until stopped. Defaults to false. */
  readonly looping: boolean;
  /** Distance range that plays at full volume. Defaults to 1. */
  readonly refDist: number;
  /** Distance past which the voice is culled; 0 means never. Defaults to 0. */
  readonly maxDist: number;
  /** How quickly volume falls past `refDist`; 1 is the physical inverse law. Defaults to 1. */
  readonly rolloff: number;
  private voice: SoundVoice | null = null;

  /** Creates an emitter for `sound` heard through `listener`. */
  constructor(sound: Sound, listener: AudioListener2D, options: AudioEmitter2DOptions = {}) {
    super();
    this.sound = sound;
    this.listener = listener;
    this.looping = options.looping === undefined ? false : options.looping;
    this.refDist = options.refDist === undefined ? 1 : options.refDist;
    this.maxDist = options.maxDist === undefined ? 0 : options.maxDist;
    this.rolloff = options.rolloff === undefined ? 1 : options.rolloff;
  }

  /** True while this emitter has an active voice. */
  get isPlaying(): boolean {
    return this.voice !== null && this.voice.isActive;
  }

  _canAttachTo(context: GameContext): boolean {
    return this.sound._belongsToContext(context) && this.listener._belongsToContext(context);
  }

  /** Start one controllable voice at the owning object's current XY position. */
  play(): boolean {
    this.stop();
    if (this.destroyed || !this.isActiveAndEnabled || !this.sound.isLoaded || this.listener.isDisposed) return false;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return false;
    const position: Vec3 = owner.transform.worldPosition;
    this.voice = this.sound.play3D(
      { x: position.x, y: 0, z: position.y },
      {
        looping: this.looping,
        refDist: this.refDist,
        maxDist: this.maxDist,
        rolloff: this.rolloff,
      },
    );
    return this.voice !== null && this.voice.isActive;
  }

  /** Stop only this emitter's voice; repeated calls are safe. */
  stop(): void {
    if (this.voice === null) return;
    this.voice.stop();
    this.voice = null;
  }

  _syncRuntimeAfterPhase(): void {
    if (this.voice === null) return;
    if (!this.isActiveAndEnabled || !this.voice.isActive) {
      this.stop();
      return;
    }
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) {
      this.stop();
      return;
    }
    const position = owner.transform.worldPosition;
    this.voice.setPosition({ x: position.x, y: 0, z: position.y });
  }

  /** Stops playback when the component is destroyed. */
  onDestroy(): void {
    this.stop();
  }
}
