import { spriteAnimationFileStem } from './spriteAnimationCreation';
import {
  SPRITE_ANIMATION_TEMPLATE_FORMAT,
  SPRITE_ANIMATION_TEMPLATE_VERSION,
  validateSpriteAnimationTemplate,
} from './spriteAnimationTemplateSchema';

export function createSpriteAnimationTemplateDocument(name: string): {
  format: typeof SPRITE_ANIMATION_TEMPLATE_FORMAT;
  version: typeof SPRITE_ANIMATION_TEMPLATE_VERSION;
  id: string;
  name: string;
  imageParameters: Array<{ id: string; required: boolean }>;
  clips: Array<{
    name: string;
    fps: number;
    loop: 'loop';
    canvasSize: { width: number; height: number };
    frames: Array<{ layers: Array<{ parameter: string; source: { x: number; y: number; width: number; height: number } }> }>;
  }>;
} {
  const title = name.trim();
  if (title.length === 0) throw new Error('Template name cannot be empty.');
  const id = spriteAnimationFileStem(title);
  const template = {
    format: SPRITE_ANIMATION_TEMPLATE_FORMAT as typeof SPRITE_ANIMATION_TEMPLATE_FORMAT,
    version: SPRITE_ANIMATION_TEMPLATE_VERSION as typeof SPRITE_ANIMATION_TEMPLATE_VERSION,
    id,
    name: title,
    imageParameters: [{ id: 'input-1', required: true }],
    clips: [{
      name: 'idle',
      fps: 8,
      loop: 'loop' as const,
      canvasSize: { width: 32, height: 32 },
      frames: [{ layers: [{ parameter: 'input-1', source: { x: 0, y: 0, width: 1, height: 1 } }] }],
    }],
  };
  const checked = validateSpriteAnimationTemplate(template);
  if (!checked.ok) throw new Error(checked.diagnostics.map((item) => item.message).join('\n'));
  return template;
}
