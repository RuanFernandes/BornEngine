import type { SpriteFrame } from './sprite-sheet';

export type SpriteAnimationLoop = 'loop' | 'once' | 'ping-pong';

export interface SpriteKeyframe {
  readonly sprite: SpriteFrame;
  /** Duration in seconds. When omitted, the animation fps is used. */
  readonly duration?: number;
  /** Events emitted when playback enters this keyframe. */
  readonly markers?: readonly string[];
}

export interface SpriteAnimationOptions {
  readonly frames: readonly SpriteKeyframe[];
  readonly fps?: number;
  readonly loop?: SpriteAnimationLoop;
}

export interface ResolvedSpriteKeyframe {
  readonly sprite: SpriteFrame;
  readonly duration: number;
  readonly markers: readonly string[];
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isPositive(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function isArray(value: any): boolean {
  return Array.isArray(value);
}

/** Immutable playback data shared by any number of SpriteAnimator instances. */
export class SpriteAnimation {
  private resolvedFrames: ResolvedSpriteKeyframe[] = [];
  private frameError: string | null = null;
  private fpsValue = 12;
  private loopValue: SpriteAnimationLoop = 'loop';
  private durationValue = 0;

  constructor(options: SpriteAnimationOptions) {
    const settings: SpriteAnimationOptions = options === null || options === undefined
      ? { frames: [] }
      : options;
    this.fpsValue = settings.fps === undefined ? 12 : settings.fps;
    this.loopValue = settings.loop === undefined ? 'loop' : settings.loop;
    if (!isPositive(this.fpsValue)) {
      this.frameError = 'SpriteAnimation fps must be finite and positive.';
      return;
    }
    if (this.loopValue !== 'loop' && this.loopValue !== 'once' && this.loopValue !== 'ping-pong') {
      this.frameError = 'SpriteAnimation loop must be loop, once, or ping-pong.';
      return;
    }
    if (!isArray(settings.frames) || settings.frames.length === 0) {
      this.frameError = 'SpriteAnimation requires at least one keyframe.';
      return;
    }

    const defaultDuration = 1 / this.fpsValue;
    for (let index = 0; index < settings.frames.length; index++) {
      const frame = settings.frames[index];
      if (frame === null || frame === undefined || frame.sprite === null || frame.sprite === undefined) {
        this.frameError = 'SpriteAnimation keyframes require a SpriteFrame.';
        this.resolvedFrames = [];
        this.durationValue = 0;
        return;
      }
      const duration = frame.duration === undefined ? defaultDuration : frame.duration;
      if (!isPositive(duration)) {
        this.frameError = 'SpriteAnimation keyframe durations must be finite and positive.';
        this.resolvedFrames = [];
        this.durationValue = 0;
        return;
      }

      const markers: string[] = [];
      if (frame.markers !== undefined) {
        if (frame.markers === null || !isArray(frame.markers)) {
          this.frameError = 'SpriteAnimation markers must be an array of strings.';
          this.resolvedFrames = [];
          this.durationValue = 0;
          return;
        }
        for (let markerIndex = 0; markerIndex < frame.markers.length; markerIndex++) {
          const marker = frame.markers[markerIndex];
          if (typeof marker !== 'string' || marker.length === 0) {
            this.frameError = 'SpriteAnimation marker names must be non-empty strings.';
            this.resolvedFrames = [];
            this.durationValue = 0;
            return;
          }
          markers.push(marker);
        }
      }

      this.resolvedFrames.push({ sprite: frame.sprite, duration, markers });
      this.durationValue += duration;
      if (!isFiniteNumber(this.durationValue)) {
        this.frameError = 'SpriteAnimation total duration must be finite.';
        this.resolvedFrames = [];
        this.durationValue = 0;
        return;
      }
    }
  }

  get error(): string | null { return this.frameError; }
  get fps(): number { return this.fpsValue; }
  get loop(): SpriteAnimationLoop { return this.loopValue; }
  get duration(): number { return this.durationValue; }
  get frames(): readonly ResolvedSpriteKeyframe[] { return this.resolvedFrames; }
}
