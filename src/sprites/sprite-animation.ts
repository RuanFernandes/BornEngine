import type { SpriteFrame } from './sprite-sheet';

export type SpriteAnimationLoop = 'loop' | 'once' | 'ping-pong';

export interface SpriteKeyframe {
  readonly sprite: SpriteFrame;
  /** Duration in seconds. When omitted, the animation fps is used. */
  readonly duration?: number;
  /** Events emitted when playback enters this keyframe. */
  readonly markers?: readonly string[];
}

/** Per-direction keyframes. Directions follow Graal `dir` order: 0 up, 1 left, 2 down, 3 right. */
export interface SpriteAnimationDirectionalFrames {
  readonly up: readonly SpriteKeyframe[];
  readonly left: readonly SpriteKeyframe[];
  readonly down: readonly SpriteKeyframe[];
  readonly right: readonly SpriteKeyframe[];
}

export interface SpriteAnimationOptions {
  /** Keyframes of a non-directional clip. Mutually exclusive with directions. */
  readonly frames?: readonly SpriteKeyframe[];
  /** Keyframes per direction. SpriteAnimator.dir selects the variant that plays. */
  readonly directions?: SpriteAnimationDirectionalFrames;
  readonly fps?: number;
  readonly loop?: SpriteAnimationLoop;
}

export interface ResolvedSpriteKeyframe {
  readonly sprite: SpriteFrame;
  readonly duration: number;
  readonly markers: readonly string[];
}

/** Common timing data used by SpriteAnimator for concrete and layered clips. */
export interface SpriteAnimationPlaybackFrame {
  readonly duration: number;
  readonly markers: readonly string[];
}

/** A clip whose frames can be advanced by one SpriteAnimator playhead. */
export interface SpriteAnimationPlaybackClip {
  readonly fps: number;
  readonly loop: SpriteAnimationLoop;
  readonly duration: number;
  readonly error: string | null;
  readonly frames: readonly SpriteAnimationPlaybackFrame[];
  /** Variants indexed by dir (0 up, 1 left, 2 down, 3 right); null when the clip has no directions. */
  readonly directions: readonly SpriteAnimationPlaybackClip[] | null;
}

const DIRECTION_NAMES = ['up', 'left', 'down', 'right'];

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
  private directionClips: SpriteAnimation[] | null = null;

  constructor(options: SpriteAnimationOptions) {
    const settings: SpriteAnimationOptions = options === null || options === undefined ? { frames: [] } : options;
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
    if (settings.directions !== undefined) {
      this.buildDirections(settings);
      return;
    }
    if (settings.frames === undefined || !isArray(settings.frames) || settings.frames.length === 0) {
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

  get error(): string | null {
    return this.frameError;
  }
  get fps(): number {
    return this.fpsValue;
  }
  get loop(): SpriteAnimationLoop {
    return this.loopValue;
  }
  get duration(): number {
    return this.durationValue;
  }
  get frames(): readonly ResolvedSpriteKeyframe[] {
    return this.resolvedFrames;
  }
  /** Variants indexed by dir; frames mirror the down (dir 2) variant. */
  get directions(): readonly SpriteAnimation[] | null {
    return this.directionClips;
  }

  private buildDirections(settings: SpriteAnimationOptions): void {
    const directions = settings.directions;
    if (settings.frames !== undefined) {
      this.frameError = 'SpriteAnimation cannot define both frames and directions.';
      return;
    }
    if (directions === null || directions === undefined || typeof directions !== 'object') {
      this.frameError = 'SpriteAnimation directions must define up, left, down, and right keyframes.';
      return;
    }
    const lists = [directions.up, directions.left, directions.down, directions.right];
    const clips: SpriteAnimation[] = [];
    for (let dir = 0; dir < lists.length; dir++) {
      const clip = new SpriteAnimation({ frames: lists[dir], fps: this.fpsValue, loop: this.loopValue });
      if (clip.error !== null) {
        this.frameError = 'SpriteAnimation direction ' + DIRECTION_NAMES[dir] + ': ' + clip.error;
        return;
      }
      clips.push(clip);
    }
    const defaultClip = clips[2];
    this.directionClips = clips;
    this.resolvedFrames = defaultClip.resolvedFrames;
    this.durationValue = defaultClip.durationValue;
  }
}
