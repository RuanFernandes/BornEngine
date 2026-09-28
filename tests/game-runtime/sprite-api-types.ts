import { SpriteAnimation, SpriteAnimator, SpriteRenderer, SpriteSheet } from '@bornengine/engine/sprites';
import {
  SpriteAnimation as RootSpriteAnimation,
  SpriteAnimator as RootSpriteAnimator,
  SpriteRenderer as RootSpriteRenderer,
  SpriteSheet as RootSpriteSheet,
} from '../../src';
import type {
  SpriteAnimationOptions,
  SpriteAnimatorOptions,
  SpriteFrame,
  SpriteRendererOptions,
  SpriteSheetOptions,
} from '@bornengine/engine/sprites';

const spriteAnimationClass: typeof RootSpriteAnimation = SpriteAnimation;
const spriteAnimatorClass: typeof RootSpriteAnimator = SpriteAnimator;
const spriteSheetClass: typeof RootSpriteSheet = SpriteSheet;
const spriteRendererClass: typeof RootSpriteRenderer = SpriteRenderer;
const frameType: SpriteFrame | null = null;
const sheetOptions: SpriteSheetOptions = { frameWidth: 16, frameHeight: 16 };
const rendererOptions: SpriteRendererOptions = { flipX: true, renderOrder: 5 };
const animationOptions: SpriteAnimationOptions = { frames: [] };
const animatorOptions: SpriteAnimatorOptions = { clips: {} };

void spriteAnimationClass;
void spriteAnimatorClass;
void spriteSheetClass;
void spriteRendererClass;
void frameType;
void sheetOptions;
void rendererOptions;
void animationOptions;
void animatorOptions;
