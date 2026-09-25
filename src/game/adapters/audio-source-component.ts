import { playSound3DEx, voiceSetPosition, voiceStop } from '../../audio';
import type { Sound } from '../../core/types';
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
  private voice = 0;

  constructor(sound: Sound, options: AudioSourceComponentOptions = {}) {
    super();
    this.sound = sound;
    this.looping = options.looping === undefined ? false : options.looping;
    this.refDist = options.refDist === undefined ? 1 : options.refDist;
    this.maxDist = options.maxDist === undefined ? 0 : options.maxDist;
    this.rolloff = options.rolloff === undefined ? 1 : options.rolloff;
  }

  play(): boolean {
    this.stop();
    if (this.destroyed) return false;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return false;
    const position = owner.transform.worldPosition;
    this.voice = playSound3DEx(
      this.sound,
      position.x,
      position.y,
      position.z,
      this.looping,
      this.refDist,
      this.maxDist,
      this.rolloff,
    );
    return this.voice !== 0;
  }

  stop(): void {
    if (this.voice === 0) return;
    voiceStop(this.voice);
    this.voice = 0;
  }

  _syncRuntimeAfterPhase(): void {
    if (this.voice === 0 || this.destroyed) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const position = owner.transform.worldPosition;
    voiceSetPosition(this.voice, position.x, position.y, position.z);
  }

  onDestroy(): void {
    this.stop();
  }
}
