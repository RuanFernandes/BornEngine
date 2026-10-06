import {
  ParticleEmitter2D,
  SpriteAnimation,
  SpriteAnimationTemplateAsset,
  SpriteAnimationTemplateRenderer,
  SpriteAnimator,
  SpriteRenderer,
  SpriteSheet,
} from '@bornengine/engine/sprites';
import {
  ParticleEmitter2D as RootParticleEmitter2D,
  SpriteAnimation as RootSpriteAnimation,
  SpriteAnimationTemplateAsset as RootSpriteAnimationTemplateAsset,
  SpriteAnimationTemplateRenderer as RootSpriteAnimationTemplateRenderer,
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
  ParticleEmitter2DOptions,
} from '@bornengine/engine/sprites';
import type {
  SpriteAnimationTemplate,
  SpriteAnimationTemplateBindingResult,
  SpriteAnimationTemplateRendererOptions,
} from '@bornengine/engine/sprites';
import type {
  SpriteAnimationTemplate as RootSpriteAnimationTemplate,
  SpriteAnimationTemplateBindingResult as RootSpriteAnimationTemplateBindingResult,
  SpriteAnimationTemplateRendererOptions as RootSpriteAnimationTemplateRendererOptions,
} from '../../src';

const emitterClass: typeof RootParticleEmitter2D = ParticleEmitter2D;
const spriteAnimationClass: typeof RootSpriteAnimation = SpriteAnimation;
const animationTemplateClass: typeof RootSpriteAnimationTemplateAsset = SpriteAnimationTemplateAsset;
const animationTemplateRendererClass: typeof RootSpriteAnimationTemplateRenderer = SpriteAnimationTemplateRenderer;
const spriteAnimatorClass: typeof RootSpriteAnimator = SpriteAnimator;
const spriteSheetClass: typeof RootSpriteSheet = SpriteSheet;
const spriteRendererClass: typeof RootSpriteRenderer = SpriteRenderer;
const frameType: SpriteFrame | null = null;
const sheetOptions: SpriteSheetOptions = { frameWidth: 16, frameHeight: 16 };
const rendererOptions: SpriteRendererOptions = { flipX: true, renderOrder: 5 };
const animationOptions: SpriteAnimationOptions = { frames: [] };
const animatorOptions: SpriteAnimatorOptions = { clips: {} };
const emitterOptions: ParticleEmitter2DOptions = { frames: [] };
const templateDefinition: SpriteAnimationTemplate = {} as SpriteAnimationTemplate;
const rootTemplateDefinition: RootSpriteAnimationTemplate = templateDefinition;
const templateBinding: SpriteAnimationTemplateBindingResult | null = null;
const rootTemplateBinding: RootSpriteAnimationTemplateBindingResult | null = templateBinding;
const templateRendererOptions: SpriteAnimationTemplateRendererOptions = { size: { x: 48, y: 48 } };
const rootTemplateRendererOptions: RootSpriteAnimationTemplateRendererOptions = templateRendererOptions;
const layeredAnimatorOptions: SpriteAnimatorOptions = { clips: {} };

void emitterClass;
void spriteAnimationClass;
void animationTemplateClass;
void animationTemplateRendererClass;
void spriteAnimatorClass;
void spriteSheetClass;
void spriteRendererClass;
void frameType;
void sheetOptions;
void rendererOptions;
void animationOptions;
void animatorOptions;
void emitterOptions;
void rootTemplateDefinition;
void rootTemplateBinding;
void rootTemplateRendererOptions;
void layeredAnimatorOptions;
