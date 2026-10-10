import {
  SPRITE_ANIMATION_TEMPLATE_FORMAT,
  SPRITE_ANIMATION_TEMPLATE_VERSION,
  spriteAnimationTemplateSource,
  validateSpriteAnimationTemplate,
  validateSpriteAnimationTemplateBinding,
} from '../../../../../src/sprites/sprite-animation-template';
import type {
  ResolvedSpriteAnimationTemplate,
  ResolvedSpriteAnimationTemplateClip,
  ResolvedSpriteAnimationTemplateFrame,
  ResolvedSpriteAnimationTemplateLayer,
  ResolvedSpriteAnimationTemplateTransform,
  SpriteAnimationTemplate,
  SpriteAnimationTemplateBindingValidationResult,
  SpriteAnimationTemplateCanvasSize,
  SpriteAnimationTemplateClip,
  SpriteAnimationTemplateDiagnostic,
  SpriteAnimationTemplateFrame,
  SpriteAnimationTemplateImageSize,
  SpriteAnimationTemplateLayer,
  SpriteAnimationTemplateLoop,
  SpriteAnimationTemplateParameter,
  SpriteAnimationTemplateSourceRect,
  SpriteAnimationTemplateTransform,
  SpriteAnimationTemplateValidationResult,
  SpriteAnimationTemplateVector2,
} from '../../../../../src/sprites/sprite-animation-template';

export {
  SPRITE_ANIMATION_TEMPLATE_FORMAT,
  SPRITE_ANIMATION_TEMPLATE_VERSION,
  spriteAnimationTemplateSource,
  validateSpriteAnimationTemplate,
  validateSpriteAnimationTemplateBinding,
};
export type {
  ResolvedSpriteAnimationTemplate,
  ResolvedSpriteAnimationTemplateClip,
  ResolvedSpriteAnimationTemplateFrame,
  ResolvedSpriteAnimationTemplateLayer,
  ResolvedSpriteAnimationTemplateTransform,
  SpriteAnimationTemplate,
  SpriteAnimationTemplateBindingValidationResult,
  SpriteAnimationTemplateCanvasSize,
  SpriteAnimationTemplateClip,
  SpriteAnimationTemplateDiagnostic,
  SpriteAnimationTemplateFrame,
  SpriteAnimationTemplateImageSize,
  SpriteAnimationTemplateLayer,
  SpriteAnimationTemplateLoop,
  SpriteAnimationTemplateParameter,
  SpriteAnimationTemplateSourceRect,
  SpriteAnimationTemplateTransform,
  SpriteAnimationTemplateValidationResult,
  SpriteAnimationTemplateVector2,
};

export interface SpriteAnimationTemplateReadResult {
  readonly sourceText: string;
  readonly result: SpriteAnimationTemplateValidationResult;
}

/** Parses source text without discarding it, even when it is malformed or from a newer version. */
export function readSpriteAnimationTemplate(sourceText: string): SpriteAnimationTemplateReadResult {
  try {
    const parsed: unknown = JSON.parse(sourceText);
    return { sourceText, result: validateSpriteAnimationTemplate(parsed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    return {
      sourceText,
      result: {
        ok: false,
        value: null,
        diagnostics: [{ path: '', code: 'template.json', message: `Animation template is not valid JSON: ${message}` }],
      },
    };
  }
}
