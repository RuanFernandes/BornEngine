import type { GameContext } from '../core/context';
import type { SpriteAnimationPlaybackClip } from './sprite-animation';

/** Internal rendering contract shared by sprite and layered animation targets. */
export interface SpriteAnimationTarget {
  readonly error: string | null;
  _canPlayClip(clip: SpriteAnimationPlaybackClip): boolean;
  _startClipFrame(clip: SpriteAnimationPlaybackClip, frameIndex: number, fade: number): boolean;
  _selectClipFrame(clip: SpriteAnimationPlaybackClip, frameIndex: number, cancelCrossfade?: boolean): boolean;
  _advanceCrossfade(deltaTime: number): void;
  _canAttachTo(context: GameContext): boolean;
  _canAttachClipTo(clip: SpriteAnimationPlaybackClip, context: GameContext): boolean;
}
