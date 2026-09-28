import type { GameContext } from '../core/context';
import { GameComponent } from '../game/game-component';
import { SpriteAnimation } from './sprite-animation';
import type { SpriteFrame } from './sprite-sheet';
import { SpriteRenderer } from './sprite-renderer';

export type SpriteNumberComparison = 'eq' | 'gt' | 'gte' | 'lt' | 'lte';

export type SpriteTransitionCondition =
  | { readonly type: 'callback'; readonly test: (animator: SpriteAnimator) => boolean }
  | { readonly type: 'bool'; readonly name: string; readonly value: boolean }
  | { readonly type: 'number'; readonly name: string; readonly operator: SpriteNumberComparison; readonly value: number }
  | { readonly type: 'trigger'; readonly name: string };

export interface SpriteAnimationTransition {
  readonly to: string;
  /** Conditions combine with AND. An empty condition list is always eligible. */
  readonly conditions?: readonly SpriteTransitionCondition[];
  /** Optional crossfade duration in seconds. */
  readonly fade?: number;
}

export interface SpriteAnimatorState {
  readonly name: string;
  readonly clip: string;
  /** Transitions are tested in declaration order. */
  readonly transitions?: readonly SpriteAnimationTransition[];
}

export interface SpriteAnimatorOptions {
  readonly clips: Readonly<Record<string, SpriteAnimation>>;
  readonly states?: readonly SpriteAnimatorState[];
  readonly initialState?: string;
}

export interface SpritePlayOptions {
  readonly restart?: boolean;
  readonly fade?: number;
}

export type SpriteMarkerCallback = (marker: string, clip: string, frameIndex: number) => void;
export type SpriteCompleteCallback = (clip: string) => void;
export type SpriteStateChangedCallback = (next: string, previous: string) => void;

interface StoredState {
  name: string;
  clip: string;
  transitions: SpriteAnimationTransition[];
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isNonNegative(value: number): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function isValidName(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isArray(value: any): boolean {
  return Array.isArray(value);
}

function validCondition(condition: SpriteTransitionCondition): boolean {
  if (condition === null || condition === undefined) return false;
  if (condition.type === 'callback') return typeof condition.test === 'function';
  if (condition.type === 'bool') return isValidName(condition.name) && typeof condition.value === 'boolean';
  if (condition.type === 'number') {
    return isValidName(condition.name) && isFiniteNumber(condition.value) &&
      (condition.operator === 'eq' || condition.operator === 'gt' || condition.operator === 'gte' ||
        condition.operator === 'lt' || condition.operator === 'lte');
  }
  if (condition.type === 'trigger') return isValidName(condition.name);
  return false;
}

/** Plays shared SpriteAnimation clips on one SpriteRenderer and evaluates an optional state machine. */
export class SpriteAnimator extends GameComponent {
  onMarker: SpriteMarkerCallback | null = null;
  onComplete: SpriteCompleteCallback | null = null;
  onStateChanged: SpriteStateChangedCallback | null = null;

  private readonly spriteRenderer: SpriteRenderer;
  private clipNames: string[] = [];
  private clips: SpriteAnimation[] = [];
  private states: StoredState[] = [];
  private boolNames: string[] = [];
  private boolValues: boolean[] = [];
  private numberNames: string[] = [];
  private numberValues: number[] = [];
  private triggerNames: string[] = [];
  private triggerValues: boolean[] = [];
  private currentAnimationValue: SpriteAnimation | null = null;
  private currentClipNameValue: string | null = null;
  private currentStateValue: string | null = null;
  private frameIndexValue = 0;
  private frameElapsed = 0;
  private pingPongDirection = 1;
  private speedValue = 1;
  private playingValue = false;
  private pausedValue = false;
  private stoppedValue = false;
  private completionSent = false;
  private pendingInitialMarkers = false;
  private playbackRevision = 0;
  private animationError: string | null = null;

  constructor(renderer: SpriteRenderer, options: SpriteAnimatorOptions) {
    super();
    const settings: SpriteAnimatorOptions = options === null || options === undefined
      ? { clips: {} }
      : options;
    this.spriteRenderer = renderer;

    if (renderer === null || renderer === undefined || renderer.error !== null || renderer.frame === null) {
      this.animationError = renderer === null || renderer === undefined
        ? 'SpriteAnimator requires a SpriteRenderer.'
        : renderer.error || 'SpriteAnimator requires a SpriteRenderer with a valid frame.';
      return;
    }
    if (settings.clips === null || settings.clips === undefined || typeof settings.clips !== 'object') {
      this.animationError = 'SpriteAnimator clips must be a name-to-animation object.';
      return;
    }

    const names = Object.keys(settings.clips);
    if (names.length === 0) {
      this.animationError = 'SpriteAnimator requires at least one clip.';
      return;
    }
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      const clip = settings.clips[name];
      if (!isValidName(name) || clip === null || clip === undefined ||
          !(clip instanceof SpriteAnimation) ||
          !isArray(clip.frames) || clip.error !== null || clip.frames.length === 0) {
        this.animationError = 'SpriteAnimator received an invalid clip: ' + name;
        this.clipNames = [];
        this.clips = [];
        return;
      }
      this.clipNames.push(name);
      this.clips.push(clip);
    }

    if (settings.states !== undefined && settings.states !== null) {
      if (!isArray(settings.states)) {
        this.animationError = 'SpriteAnimator states must be an array.';
        return;
      }
      for (let index = 0; index < settings.states.length; index++) {
        const state = settings.states[index];
        if (state === null || state === undefined || !isValidName(state.name) ||
            !isValidName(state.clip) || this.findClip(state.clip) === null ||
            this.findState(state.name) !== null) {
          this.animationError = 'SpriteAnimator state definitions must have unique names and valid clips.';
          this.states = [];
          return;
        }
        const transitions = state.transitions === undefined ? [] : state.transitions;
        if (transitions === null || !isArray(transitions)) {
          this.animationError = 'SpriteAnimator state transitions must be an array.';
          this.states = [];
          return;
        }
        for (let transitionIndex = 0; transitionIndex < transitions.length; transitionIndex++) {
          const transition = transitions[transitionIndex];
          if (transition === null || transition === undefined || !isValidName(transition.to) ||
              !isNonNegative(transition.fade === undefined ? 0 : transition.fade)) {
            this.animationError = 'SpriteAnimator transitions require a valid destination and fade.';
            this.states = [];
            return;
          }
          const conditions = transition.conditions === undefined ? [] : transition.conditions;
          if (conditions === null || !isArray(conditions)) {
            this.animationError = 'SpriteAnimator transition conditions must be an array.';
            this.states = [];
            return;
          }
          for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex++) {
            if (!validCondition(conditions[conditionIndex])) {
              this.animationError = 'SpriteAnimator transition condition is invalid.';
              this.states = [];
              return;
            }
          }
        }
        this.states.push({ name: state.name, clip: state.clip, transitions: transitions.slice() });
      }
      for (let stateIndex = 0; stateIndex < this.states.length; stateIndex++) {
        const transitions = this.states[stateIndex].transitions;
        for (let transitionIndex = 0; transitionIndex < transitions.length; transitionIndex++) {
          if (this.findState(transitions[transitionIndex].to) === null) {
            this.animationError = 'SpriteAnimator transition targets an unknown state: ' + transitions[transitionIndex].to;
            this.states = [];
            return;
          }
        }
      }
    }

    if (settings.initialState !== undefined) {
      const initialState = this.findState(settings.initialState);
      if (initialState === null) {
        this.animationError = 'SpriteAnimator initialState is unknown: ' + settings.initialState;
        return;
      }
      this.startState(initialState, 0, false);
    }
  }

  get error(): string | null { return this.animationError; }
  get currentClip(): string | null { return this.currentClipNameValue; }
  get currentAnimation(): SpriteAnimation | null { return this.currentAnimationValue; }
  get currentState(): string | null { return this.currentStateValue; }
  get currentFrameIndex(): number { return this.frameIndexValue; }
  get isPlaying(): boolean { return this.playingValue; }
  get isPaused(): boolean { return this.pausedValue; }
  get speed(): number { return this.speedValue; }

  get currentTime(): number {
    const animation = this.currentAnimationValue;
    if (animation === null) return 0;
    let time = 0;
    if (animation.loop === 'ping-pong' && this.pingPongDirection < 0) {
      time = animation.duration;
      for (let index = this.frameIndexValue + 1; index < animation.frames.length - 1; index++) {
        time += animation.frames[index].duration;
      }
      return time + this.frameElapsed;
    }
    for (let index = 0; index < this.frameIndexValue; index++) time += animation.frames[index].duration;
    return time + this.frameElapsed;
  }

  get normalizedTime(): number {
    const animation = this.currentAnimationValue;
    if (animation === null || animation.duration <= 0) return 0;
    const duration = animation.loop === 'ping-pong'
      ? this.pingPongCycleDuration(animation)
      : animation.duration;
    if (duration <= 0) return 0;
    const time = this.currentTime / duration;
    return Math.max(0, Math.min(1, time));
  }

  /** Plays a clip. The current clip only restarts when restart is true. */
  play(name: string, options: SpritePlayOptions = {}): boolean {
    const settings: SpritePlayOptions = options === null || options === undefined ? {} : options;
    const fade = settings.fade === undefined ? 0 : settings.fade;
    if (!isNonNegative(fade)) {
      this.animationError = 'SpriteAnimator fade must be finite and non-negative.';
      return false;
    }
    const animation = this.findClip(name);
    if (animation === null) {
      this.animationError = 'SpriteAnimator clip not found: ' + name;
      return false;
    }
    if (this.currentClipNameValue === name && settings.restart !== true) {
      this.animationError = null;
      return true;
    }
    if (!this.startClip(name, animation, fade)) return false;
    this.currentStateValue = null;
    this.animationError = null;
    this.stoppedValue = false;
    this.flushInitialMarkers();
    return true;
  }

  /** Pauses the playhead and any active crossfade. */
  pause(): boolean {
    if (!this.playingValue || this.pausedValue) return false;
    this.pausedValue = true;
    this.playbackRevision++;
    return true;
  }

  resume(): boolean {
    if (!this.playingValue || !this.pausedValue) return false;
    this.pausedValue = false;
    this.playbackRevision++;
    return true;
  }

  /** Stops playback and resets the current clip to its first frame. */
  stop(): boolean {
    const animation = this.currentAnimationValue;
    if (animation === null) return false;
    this.playbackRevision++;
    this.playingValue = false;
    this.pausedValue = false;
    this.stoppedValue = true;
    this.frameIndexValue = 0;
    this.frameElapsed = 0;
    this.pingPongDirection = 1;
    this.completionSent = false;
    this.pendingInitialMarkers = false;
    this.spriteRenderer.setFrame(animation.frames[0].sprite);
    return true;
  }

  /** Seeks in seconds. Markers are silent unless emitMarkers is true. */
  seek(timeSeconds: number, emitMarkers = false): boolean {
    const animation = this.currentAnimationValue;
    if (animation === null || !isNonNegative(timeSeconds)) {
      this.animationError = 'SpriteAnimator seek time must be finite and non-negative.';
      return false;
    }

    let targetTime = timeSeconds;
    if (animation.loop === 'loop' && animation.duration > 0) {
      targetTime = targetTime % animation.duration;
    } else if (animation.loop === 'ping-pong') {
      const cycleDuration = this.pingPongCycleDuration(animation);
      if (cycleDuration > 0) targetTime = targetTime % cycleDuration;
    }

    const wasPlaying = this.playingValue;
    const wasPaused = this.pausedValue;
    const wasStopped = this.stoppedValue;
    this.playbackRevision++;
    const revision = this.playbackRevision;
    this.frameIndexValue = 0;
    this.frameElapsed = 0;
    this.pingPongDirection = 1;
    this.completionSent = false;
    this.pendingInitialMarkers = false;
    this.spriteRenderer.setFrame(animation.frames[0].sprite);
    this.playingValue = true;
    this.pausedValue = false;
    if (targetTime > 0) this.advanceTime(targetTime, emitMarkers, false);
    if (this.playbackRevision !== revision) return true;
    if (animation.loop === 'once' && timeSeconds >= animation.duration) {
      this.frameIndexValue = animation.frames.length - 1;
      this.frameElapsed = animation.frames[this.frameIndexValue].duration;
      this.spriteRenderer._setAnimationFrame(animation.frames[this.frameIndexValue].sprite);
      this.playingValue = false;
      this.completionSent = true;
    } else {
      this.playingValue = wasPlaying;
    }
    this.pausedValue = wasPaused;
    this.stoppedValue = wasStopped;
    this.animationError = null;
    return true;
  }

  setSpeed(value: number): boolean {
    if (!isNonNegative(value)) {
      this.animationError = 'SpriteAnimator speed must be finite and non-negative.';
      return false;
    }
    this.speedValue = value;
    this.animationError = null;
    return true;
  }

  setBool(name: string, value: boolean): boolean {
    if (!isValidName(name) || typeof value !== 'boolean') {
      this.animationError = 'SpriteAnimator bool parameters require a name and boolean value.';
      return false;
    }
    const index = this.boolNames.indexOf(name);
    if (index >= 0) this.boolValues[index] = value;
    else {
      this.boolNames.push(name);
      this.boolValues.push(value);
    }
    this.animationError = null;
    return true;
  }

  getBool(name: string): boolean {
    const index = this.boolNames.indexOf(name);
    return index < 0 ? false : this.boolValues[index];
  }

  setNumber(name: string, value: number): boolean {
    if (!isValidName(name) || !isFiniteNumber(value)) {
      this.animationError = 'SpriteAnimator number parameters require a name and finite value.';
      return false;
    }
    const index = this.numberNames.indexOf(name);
    if (index >= 0) this.numberValues[index] = value;
    else {
      this.numberNames.push(name);
      this.numberValues.push(value);
    }
    this.animationError = null;
    return true;
  }

  getNumber(name: string): number {
    const index = this.numberNames.indexOf(name);
    return index < 0 ? 0 : this.numberValues[index];
  }

  setTrigger(name: string): boolean {
    if (!isValidName(name)) {
      this.animationError = 'SpriteAnimator trigger names must be non-empty strings.';
      return false;
    }
    const index = this.triggerNames.indexOf(name);
    if (index >= 0) this.triggerValues[index] = true;
    else {
      this.triggerNames.push(name);
      this.triggerValues.push(true);
    }
    this.animationError = null;
    return true;
  }

  resetTrigger(name: string): boolean {
    if (!isValidName(name)) return false;
    const index = this.triggerNames.indexOf(name);
    if (index >= 0) this.triggerValues[index] = false;
    return true;
  }

  hasTrigger(name: string): boolean {
    const index = this.triggerNames.indexOf(name);
    return index >= 0 && this.triggerValues[index];
  }

  /** Switches directly to a named state. */
  setState(name: string, fade = 0): boolean {
    const state = this.findState(name);
    if (state === null || !isNonNegative(fade)) {
      this.animationError = 'SpriteAnimator state or fade is invalid.';
      return false;
    }
    return this.startState(state, fade, true);
  }

  update(deltaTime: number): void {
    if (this.currentAnimationValue === null) return;
    const markerRevision = this.playbackRevision;
    this.flushInitialMarkers();
    if (this.playbackRevision !== markerRevision || this.pausedValue) return;

    if (isFiniteNumber(deltaTime) && deltaTime > 0) {
      this.spriteRenderer._advanceCrossfade(deltaTime);
      if (this.playingValue && this.speedValue > 0) {
        this.advanceTime(deltaTime * this.speedValue, true, true);
      }
    }

    if (!this.pausedValue && this.currentStateValue !== null && !this.stoppedValue) {
      this.evaluateTransitions();
    }
  }

  /** @internal Keeps this animator with the Game that owns its renderer's texture. */
  _canAttachTo(context: GameContext): boolean {
    if (!this.spriteRenderer._canAttachTo(context)) return false;
    for (let clipIndex = 0; clipIndex < this.clips.length; clipIndex++) {
      const frames = this.clips[clipIndex].frames;
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
        if (!frames[frameIndex].sprite.sheet._canAttachTo(context)) return false;
      }
    }
    return true;
  }

  private findClip(name: string): SpriteAnimation | null {
    for (let index = 0; index < this.clipNames.length; index++) {
      if (this.clipNames[index] === name) return this.clips[index];
    }
    return null;
  }

  private findState(name: string): StoredState | null {
    for (let index = 0; index < this.states.length; index++) {
      if (this.states[index].name === name) return this.states[index];
    }
    return null;
  }

  private startClip(name: string, animation: SpriteAnimation, fade: number): boolean {
    const firstFrame = animation.frames[0].sprite;
    if (!this.spriteRenderer._transitionTo(firstFrame, fade)) {
      this.animationError = this.spriteRenderer.error || 'SpriteAnimator could not select the clip frame.';
      return false;
    }
    this.playbackRevision++;
    this.currentAnimationValue = animation;
    this.currentClipNameValue = name;
    this.frameIndexValue = 0;
    this.frameElapsed = 0;
    this.pingPongDirection = 1;
    this.playingValue = true;
    this.pausedValue = false;
    this.completionSent = false;
    this.pendingInitialMarkers = true;
    return true;
  }

  private startState(state: StoredState, fade: number, notify: boolean): boolean {
    const animation = this.findClip(state.clip);
    if (animation === null) {
      this.animationError = 'SpriteAnimator state clip not found: ' + state.clip;
      return false;
    }
    const previous = this.currentStateValue;
    if (!this.startClip(state.clip, animation, fade)) return false;
    this.currentStateValue = state.name;
    this.stoppedValue = false;
    this.animationError = null;
    const revision = this.playbackRevision;
    if (notify && previous !== null && previous !== state.name && this.onStateChanged !== null) {
      this.onStateChanged(state.name, previous);
    }
    if (notify && this.playbackRevision === revision) this.flushInitialMarkers();
    return true;
  }

  private flushInitialMarkers(): void {
    if (!this.pendingInitialMarkers || this.currentAnimationValue === null) return;
    this.pendingInitialMarkers = false;
    this.dispatchFrameMarkers(this.currentAnimationValue, this.frameIndexValue);
  }

  private dispatchFrameMarkers(animation: SpriteAnimation, frameIndex: number): void {
    const callback = this.onMarker;
    if (callback === null) return;
    const markers = animation.frames[frameIndex].markers;
    const clipName = this.currentClipNameValue || '';
    const revision = this.playbackRevision;
    for (let index = 0; index < markers.length; index++) {
      callback(markers[index], clipName, frameIndex);
      if (this.playbackRevision !== revision) return;
    }
  }

  private advanceTime(seconds: number, emitMarkers: boolean, emitCompletion: boolean): void {
    const animation = this.currentAnimationValue;
    if (animation === null || !this.playingValue || !isFiniteNumber(seconds) || seconds <= 0) return;
    const revision = this.playbackRevision;
    let remaining = seconds;
    while (remaining > 0 && this.playingValue) {
      if (this.playbackRevision !== revision) return;
      const frame = animation.frames[this.frameIndexValue];
      const timeToBoundary = frame.duration - this.frameElapsed;
      if (remaining < timeToBoundary) {
        this.frameElapsed += remaining;
        remaining = 0;
        break;
      }
      remaining -= timeToBoundary;
      this.frameElapsed = 0;

      if (animation.loop === 'once' && this.frameIndexValue === animation.frames.length - 1) {
        this.frameElapsed = frame.duration;
        this.playingValue = false;
        if (!this.completionSent) {
          this.completionSent = true;
          if (emitCompletion && this.onComplete !== null) this.onComplete(this.currentClipNameValue || '');
        }
        if (this.playbackRevision !== revision) return;
        break;
      }

      this.advanceFrameIndex(animation);
      if (!this.spriteRenderer._setAnimationFrame(animation.frames[this.frameIndexValue].sprite)) {
        this.animationError = this.spriteRenderer.error || 'SpriteAnimator could not select the next frame.';
      }
      if (emitMarkers) this.dispatchFrameMarkers(animation, this.frameIndexValue);
      if (this.playbackRevision !== revision) return;
    }
  }

  private advanceFrameIndex(animation: SpriteAnimation): void {
    const count = animation.frames.length;
    if (count <= 1 || animation.loop === 'loop') {
      this.frameIndexValue = (this.frameIndexValue + 1) % count;
      return;
    }
    if (this.pingPongDirection > 0) {
      if (this.frameIndexValue >= count - 1) {
        if (count <= 2) {
          this.pingPongDirection = 1;
          this.frameIndexValue = 0;
        } else {
          this.pingPongDirection = -1;
          this.frameIndexValue = count - 2;
        }
      } else {
        this.frameIndexValue++;
      }
      return;
    }
    if (this.frameIndexValue <= 1) {
      this.pingPongDirection = 1;
      this.frameIndexValue = 0;
    } else {
      this.frameIndexValue--;
    }
  }

  private pingPongCycleDuration(animation: SpriteAnimation): number {
    if (animation.frames.length <= 1) return animation.duration;
    return animation.duration * 2 - animation.frames[0].duration -
      animation.frames[animation.frames.length - 1].duration;
  }

  private evaluateTransitions(): void {
    const state = this.findState(this.currentStateValue || '');
    if (state === null) return;
    for (let transitionIndex = 0; transitionIndex < state.transitions.length; transitionIndex++) {
      const transition = state.transitions[transitionIndex];
      const conditions = transition.conditions === undefined ? [] : transition.conditions;
      let matched = true;
      for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex++) {
        if (!this.conditionMatches(conditions[conditionIndex])) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      const target = this.findState(transition.to);
      if (target === null || !this.startState(target, transition.fade === undefined ? 0 : transition.fade, true)) return;
      for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex++) {
        const condition = conditions[conditionIndex];
        if (condition.type === 'trigger') this.resetTrigger(condition.name);
      }
      return;
    }
  }

  private conditionMatches(condition: SpriteTransitionCondition): boolean {
    if (condition.type === 'callback') return condition.test(this);
    if (condition.type === 'bool') return this.getBool(condition.name) === condition.value;
    if (condition.type === 'trigger') return this.hasTrigger(condition.name);
    const actual = this.getNumber(condition.name);
    if (condition.operator === 'eq') return actual === condition.value;
    if (condition.operator === 'gt') return actual > condition.value;
    if (condition.operator === 'gte') return actual >= condition.value;
    if (condition.operator === 'lt') return actual < condition.value;
    return actual <= condition.value;
  }
}
