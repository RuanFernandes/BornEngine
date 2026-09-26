import type { Vec3 } from '../../core/types';
import type { Sound, SoundVoice } from '../../audio/sound';
import type { GameContext } from '../../core/context';
import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';

export interface AudioSourceComponentOptions {
  looping?: boolean;
  refDist?: number;
  maxDist?: number;
  rolloff?: number;
}

/** Plays a shared Sound asset through a voice owned by this component. */
export class AudioSourceComponent extends GameComponent {
  readonly sound: Sound;
  readonly looping: boolean;
  readonly refDist: number;
  readonly maxDist: number;
  readonly rolloff: number;
  private voice: SoundVoice | null = null;

  constructor(sound: Sound, options: AudioSourceComponentOptions = {}) {
    super();
    this.sound = sound;
    this.looping = options.looping === undefined ? false : options.looping;
    this.refDist = options.refDist === undefined ? 1 : options.refDist;
    this.maxDist = options.maxDist === undefined ? 0 : options.maxDist;
    this.rolloff = options.rolloff === undefined ? 1 : options.rolloff;
  }

  _canAttachTo(context: GameContext): boolean { return this.sound._belongsToContext(context); }

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

  onDestroy(): void { this.stop(); }
}
