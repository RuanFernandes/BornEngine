import {
  SPRITE_ANIMATION_TEMPLATE_FORMAT,
  validateSpriteAnimationTemplate,
} from './spriteAnimationTemplateSchema';
import { SPRITE_ANIMATION_DOCUMENT_FORMAT } from './spriteAnimationSchema';
import type {
  ResolvedSpriteAnimationTemplate,
  ResolvedSpriteAnimationTemplateFrame,
  ResolvedSpriteAnimationTemplateLayer,
  ResolvedSpriteAnimationTemplateTransform,
} from './spriteAnimationTemplateSchema';

function compactVector(
  value: { readonly x: number; readonly y: number },
  defaults: { readonly x: number; readonly y: number },
): { x: number; y: number } | undefined {
  return value.x === defaults.x && value.y === defaults.y ? undefined : { x: value.x, y: value.y };
}

function compactTransform(value: ResolvedSpriteAnimationTemplateTransform): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  const offset = compactVector(value.offset, { x: 0, y: 0 });
  const stretch = compactVector(value.stretch, { x: 1, y: 1 });
  const pivot = compactVector(value.pivot, { x: 0.5, y: 0.5 });
  if (offset !== undefined) result.offset = offset;
  if (stretch !== undefined) result.stretch = stretch;
  if (value.zoom !== 1) result.zoom = value.zoom;
  if (value.rotation !== 0) result.rotation = value.rotation;
  if (pivot !== undefined) result.pivot = pivot;
  return Object.keys(result).length === 0 ? undefined : result;
}

function compactFrames(frames: readonly ResolvedSpriteAnimationTemplateFrame[]): Record<string, unknown>[] {
  return frames.map((frame) => ({
    ...(frame.duration === undefined ? {} : { duration: frame.duration }),
    ...(frame.markers === undefined ? {} : { markers: [...frame.markers] }),
    layers: frame.layers.map((layer: ResolvedSpriteAnimationTemplateLayer) => ({
      parameter: layer.parameter,
      source: { x: layer.source.x, y: layer.source.y, width: layer.source.width, height: layer.source.height },
      ...(layer.visible === false ? { visible: false } : {}),
      ...(compactTransform(layer.transform) === undefined ? {} : { transform: compactTransform(layer.transform) }),
    })),
  }));
}

function compactTemplate(template: ResolvedSpriteAnimationTemplate): Record<string, unknown> {
  return {
    format: template.format,
    version: template.version,
    id: template.id,
    name: template.name,
    ...(template.description === undefined ? {} : { description: template.description }),
    imageParameters: template.imageParameters.map((parameter) => ({
      id: parameter.id,
      ...(parameter.label === undefined ? {} : { label: parameter.label }),
      required: parameter.required,
      ...(parameter.tags === undefined ? {} : { tags: [...parameter.tags] }),
    })),
    clips: template.clips.map((clip) => ({
      name: clip.name,
      fps: clip.fps,
      loop: clip.loop,
      canvasSize: { width: clip.canvasSize.width, height: clip.canvasSize.height },
      ...(clip.directions === undefined
        ? { frames: compactFrames(clip.frames) }
        : {
            directions: {
              up: compactFrames(clip.directions.up),
              left: compactFrames(clip.directions.left),
              down: compactFrames(clip.directions.down),
              right: compactFrames(clip.directions.right),
            },
          }),
    })),
  };
}

/** Minifies animation JSON and removes only template transform/visibility defaults restored by validation. */
export function serializeSpriteAnimationJsonCompact(input: unknown): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Sprite animation JSON must be an object.');
  }
  const document = input as Record<string, unknown>;
  let value: unknown = input;
  if (document.format === SPRITE_ANIMATION_TEMPLATE_FORMAT) {
    const result = validateSpriteAnimationTemplate(input);
    if (!result.ok) throw new TypeError(result.diagnostics.map((item) => `${item.path}: ${item.message}`).join('\n'));
    value = compactTemplate(result.value);
  } else if (document.format !== SPRITE_ANIMATION_DOCUMENT_FORMAT) {
    throw new TypeError(`Unsupported sprite animation format: ${String(document.format)}`);
  }
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new TypeError('Sprite animation JSON could not be serialized.');
  return serialized;
}
