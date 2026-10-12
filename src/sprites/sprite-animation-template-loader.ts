import { readFile } from '../core/internal';
import type { Texture } from '../textures/texture';
import { SpriteAnimationTemplateAsset } from './sprite-animation-template-runtime';
import type { SpriteAnimationTemplateBoundAnimation } from './sprite-animation-template-runtime';

/** Reads a template file and binds the given textures. Throws on a missing file or an invalid binding. */
export function loadSpriteAnimationTemplate(
  path: string,
  images: Readonly<Record<string, Texture>>,
): SpriteAnimationTemplateBoundAnimation {
  const json = readFile(path);
  if (json === '') throw new Error(`Could not read ${path}`);
  const binding = new SpriteAnimationTemplateAsset(JSON.parse(json)).bind(images);
  if (!binding.ok) throw new Error(binding.diagnostics[0].message);
  return binding.value;
}
