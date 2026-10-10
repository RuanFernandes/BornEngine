import {
  ANIMATION_DIRECTIONS,
  DEFAULT_ANIMATION_DIRECTION,
  copyClipDirection,
  getClipFrameList,
  setClipDirectional,
  withClipFrameList,
} from './animationDirections';
import type { AnimationDirection } from './animationDirections';
import type {
  SpriteAnimationTemplate,
  SpriteAnimationTemplateClip,
  SpriteAnimationTemplateFrame,
  SpriteAnimationTemplateLayer,
} from './spriteAnimationTemplateSchema';

type TemplateClip = SpriteAnimationTemplateClip;
type TemplateFrame = SpriteAnimationTemplateFrame;
type TemplateLayer = SpriteAnimationTemplateLayer;

function findClip(template: SpriteAnimationTemplate, clipName: string) {
  const clip = template.clips.find((candidate) => candidate.name === clipName);
  if (!clip) throw new Error(`Unknown animation template clip: ${clipName}`);
  return clip;
}

/** Every frame list of a clip: its frames, or all four directions. */
function allFrameLists(clip: TemplateClip): readonly (readonly TemplateFrame[])[] {
  if (clip.directions !== undefined) return ANIMATION_DIRECTIONS.map((direction) => clip.directions![direction]);
  return [clip.frames ?? []];
}

function mapAllFrames(clip: TemplateClip, update: (frame: TemplateFrame) => TemplateFrame): TemplateClip {
  if (clip.directions !== undefined) {
    let next = clip;
    for (const direction of ANIMATION_DIRECTIONS) {
      next = withClipFrameList(next, direction, clip.directions[direction].map(update));
    }
    return next;
  }
  return withClipFrameList(clip, DEFAULT_ANIMATION_DIRECTION, (clip.frames ?? []).map(update));
}

function updateClipFrames(
  template: SpriteAnimationTemplate,
  clipName: string,
  direction: AnimationDirection,
  update: (frames: readonly TemplateFrame[]) => readonly TemplateFrame[],
): SpriteAnimationTemplate {
  return {
    ...template,
    clips: template.clips.map((clip) => clip.name !== clipName
      ? clip
      : withClipFrameList(clip, direction, update(getClipFrameList(clip, direction)))),
  };
}

function findFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
) {
  const clip = findClip(template, clipName);
  const frames = getClipFrameList(clip, direction);
  const frame = frames[frameIndex];
  if (!frame) throw new Error(`Unknown frame ${frameIndex} in clip: ${clipName}`);
  return { clip, frames, frame };
}

function replaceFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  update: (frame: TemplateFrame) => TemplateFrame,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  return updateClipFrames(template, clipName, direction,
    (frames) => frames.map((frame, index) => index === frameIndex ? update(frame) : frame));
}

export function addSpriteAnimationTemplateClip(
  template: SpriteAnimationTemplate,
  clip: SpriteAnimationTemplate['clips'][number],
): SpriteAnimationTemplate {
  if (template.clips.some((candidate) => candidate.name === clip.name)) {
    throw new Error(`Animation template clip already exists: ${clip.name}`);
  }
  return { ...template, clips: [...template.clips, clip] };
}

export function updateSpriteAnimationTemplateClip(
  template: SpriteAnimationTemplate,
  clipName: string,
  update: Partial<SpriteAnimationTemplate['clips'][number]>,
): SpriteAnimationTemplate {
  const clip = findClip(template, clipName);
  const nextName = update.name ?? clipName;
  if (template.clips.some((candidate) => candidate.name === nextName && candidate.name !== clipName)) {
    throw new Error(`Animation template clip already exists: ${nextName}`);
  }
  return {
    ...template,
    clips: template.clips.map((candidate) => candidate.name === clipName
      ? { ...candidate, ...update, canvasSize: update.canvasSize ? { ...update.canvasSize } : candidate.canvasSize }
      : candidate),
  };
}

export function moveSpriteAnimationTemplateClip(
  template: SpriteAnimationTemplate,
  clipName: string,
  delta: number,
): SpriteAnimationTemplate {
  const index = template.clips.findIndex((clip) => clip.name === clipName);
  if (index < 0) throw new Error(`Unknown animation template clip: ${clipName}`);
  return { ...template, clips: moveItem(template.clips, index, delta) };
}

export function removeSpriteAnimationTemplateClip(
  template: SpriteAnimationTemplate,
  clipName: string,
): SpriteAnimationTemplate {
  if (!template.clips.some((clip) => clip.name === clipName)) throw new Error(`Unknown animation template clip: ${clipName}`);
  if (template.clips.length <= 1) throw new Error('An animation template needs at least one clip.');
  return { ...template, clips: template.clips.filter((clip) => clip.name !== clipName) };
}

export function addSpriteAnimationTemplateFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frame: TemplateFrame,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  findClip(template, clipName);
  return updateClipFrames(template, clipName, direction, (frames) => [...frames, frame]);
}

export function updateSpriteAnimationTemplateFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  update: Partial<TemplateFrame>,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frame } = findFrame(template, clipName, frameIndex, direction);
  return replaceFrame(template, clipName, frameIndex, (current) => ({ ...frame, ...current, ...update,
    layers: update.layers === undefined ? current.layers : update.layers.map((layer) => ({ ...layer })) }), direction);
}

export function moveSpriteAnimationTemplateFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  delta: number,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  findFrame(template, clipName, frameIndex, direction);
  return updateClipFrames(template, clipName, direction, (frames) => moveItem(frames, frameIndex, delta));
}

export function removeSpriteAnimationTemplateFrame(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frames } = findFrame(template, clipName, frameIndex, direction);
  if (frames.length <= 1) throw new Error('A clip needs at least one frame.');
  return updateClipFrames(template, clipName, direction,
    (current) => current.filter((_item, index) => index !== frameIndex));
}

/** Turns per-direction frames on (copying the current frames to all four directions) or off (keeping one). */
export function setSpriteAnimationTemplateClipDirectional(
  template: SpriteAnimationTemplate,
  clipName: string,
  directional: boolean,
  keep: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  findClip(template, clipName);
  return {
    ...template,
    clips: template.clips.map((clip) => clip.name === clipName ? setClipDirectional(clip, directional, keep) : clip),
  };
}

/** Replaces one direction with a copy of another. Mirroring flips each layer horizontally around the canvas. */
export function copySpriteAnimationTemplateDirection(
  template: SpriteAnimationTemplate,
  clipName: string,
  from: AnimationDirection,
  to: AnimationDirection,
  mirror = false,
): SpriteAnimationTemplate {
  const clip = findClip(template, clipName);
  if (clip.directions === undefined) throw new Error(`Clip ${clipName} does not use directions.`);
  return {
    ...template,
    clips: template.clips.map((candidate) => candidate.name !== clipName ? candidate
      : copyClipDirection(candidate, from, to, (frame: TemplateFrame) => mirror ? mirrorTemplateFrame(frame) : frame)),
  };
}

function mirrorTemplateFrame(frame: TemplateFrame): TemplateFrame {
  return {
    ...frame,
    layers: frame.layers.map((layer) => {
      const transform = layer.transform ?? {};
      const offset = transform.offset ?? { x: 0, y: 0 };
      const stretch = transform.stretch ?? { x: 1, y: 1 };
      return {
        ...layer,
        transform: {
          ...transform,
          offset: { x: offset.x === 0 ? 0 : -offset.x, y: offset.y },
          stretch: { x: -stretch.x, y: stretch.y },
          rotation: (transform.rotation ?? 0) === 0 ? 0 : -(transform.rotation ?? 0),
        },
      };
    }),
  };
}

function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const nextIndex = index + delta;
  if (!Number.isInteger(index) || !Number.isInteger(delta) || index < 0 || index >= items.length ||
      nextIndex < 0 || nextIndex >= items.length) return [...items];
  const result = [...items];
  const item = result[index]!;
  result[index] = result[nextIndex]!;
  result[nextIndex] = item;
  return result;
}

export function addSpriteAnimationTemplateParameter(
  template: SpriteAnimationTemplate,
  parameter: SpriteAnimationTemplate['imageParameters'][number],
): SpriteAnimationTemplate {
  if (template.imageParameters.some((candidate) => candidate.id === parameter.id)) {
    throw new Error(`Animation template parameter ID already exists: ${parameter.id}`);
  }
  return { ...template, imageParameters: [...template.imageParameters, { ...parameter, tags: parameter.tags ? [...parameter.tags] : undefined }] };
}

export function updateSpriteAnimationTemplateParameter(
  template: SpriteAnimationTemplate,
  parameterId: string,
  update: Partial<SpriteAnimationTemplate['imageParameters'][number]>,
): SpriteAnimationTemplate {
  const parameter = template.imageParameters.find((candidate) => candidate.id === parameterId);
  if (!parameter) throw new Error(`Unknown animation template parameter: ${parameterId}`);
  const nextId = update.id ?? parameterId;
  if (template.imageParameters.some((candidate) => candidate.id === nextId && candidate.id !== parameterId)) {
    throw new Error(`Animation template parameter ID already exists: ${nextId}`);
  }
  const nextParameters = template.imageParameters.map((candidate) => candidate.id === parameterId
    ? { ...candidate, ...update, tags: update.tags === undefined ? candidate.tags : [...update.tags] }
    : candidate);
  const nextClips = nextId === parameterId ? template.clips : template.clips.map((clip) => mapAllFrames(clip, (frame) => ({
    ...frame,
    layers: frame.layers.map((layer) => layer.parameter === parameterId ? { ...layer, parameter: nextId } : layer),
  })));
  return { ...template, imageParameters: nextParameters, clips: nextClips };
}

export function moveSpriteAnimationTemplateParameter(
  template: SpriteAnimationTemplate,
  parameterId: string,
  delta: number,
): SpriteAnimationTemplate {
  const index = template.imageParameters.findIndex((parameter) => parameter.id === parameterId);
  if (index < 0) throw new Error(`Unknown animation template parameter: ${parameterId}`);
  return { ...template, imageParameters: moveItem(template.imageParameters, index, delta) };
}

export function removeSpriteAnimationTemplateParameter(
  template: SpriteAnimationTemplate,
  parameterId: string,
): SpriteAnimationTemplate {
  if (!template.imageParameters.some((parameter) => parameter.id === parameterId)) {
    throw new Error(`Unknown animation template parameter: ${parameterId}`);
  }
  if (template.imageParameters.length <= 1) throw new Error('An animation template needs at least one image parameter.');
  const stillUsed = template.clips.some((clip) => allFrameLists(clip).some((frames) =>
    frames.some((frame) => frame.layers.some((layer) => layer.parameter === parameterId))));
  if (stillUsed) throw new Error(`Reassign or remove layers that still use parameter ${parameterId} before removing it.`);
  return { ...template, imageParameters: template.imageParameters.filter((parameter) => parameter.id !== parameterId) };
}

/** Returns a copy with the selected parameter's organizational tags replaced. */
export function setSpriteAnimationTemplateParameterTags(
  template: SpriteAnimationTemplate,
  parameterId: string,
  tags: readonly string[],
): SpriteAnimationTemplate {
  let found = false;
  const imageParameters = template.imageParameters.map((parameter) => {
    if (parameter.id !== parameterId) return { ...parameter };
    found = true;
    const { tags: _oldTags, ...rest } = parameter;
    return tags.length > 0 ? { ...rest, tags: [...tags] } : rest;
  });
  if (!found) throw new Error(`Unknown animation template parameter: ${parameterId}`);
  return { ...template, imageParameters };
}

export function addSpriteAnimationTemplateLayer(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  layer: TemplateLayer,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frame } = findFrame(template, clipName, frameIndex, direction);
  if (!template.imageParameters.some((parameter) => parameter.id === layer.parameter)) {
    throw new Error(`Unknown animation template parameter: ${layer.parameter}`);
  }
  return replaceFrame(template, clipName, frameIndex, (current) => ({
    ...current,
    layers: [...current.layers, { ...layer, source: { ...layer.source }, transform: layer.transform ? { ...layer.transform } : undefined }],
  }), direction);
}

export function updateSpriteAnimationTemplateLayer(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  layerIndex: number,
  update: Partial<TemplateLayer>,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frame } = findFrame(template, clipName, frameIndex, direction);
  if (!frame.layers[layerIndex]) throw new Error(`Unknown layer ${layerIndex} in frame ${frameIndex}.`);
  if (update.parameter !== undefined && !template.imageParameters.some((parameter) => parameter.id === update.parameter)) {
    throw new Error(`Unknown animation template parameter: ${update.parameter}`);
  }
  return replaceFrame(template, clipName, frameIndex, (current) => ({
    ...current,
    layers: current.layers.map((layer, index) => index !== layerIndex ? layer : {
      ...layer,
      ...update,
      source: update.source === undefined ? layer.source : { ...update.source },
      transform: update.transform === undefined ? layer.transform : { ...update.transform },
    }),
  }), direction);
}

export function moveSpriteAnimationTemplateLayer(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  layerIndex: number,
  delta: number,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frame } = findFrame(template, clipName, frameIndex, direction);
  if (!frame.layers[layerIndex]) throw new Error(`Unknown layer ${layerIndex} in frame ${frameIndex}.`);
  return replaceFrame(template, clipName, frameIndex, (current) => ({
    ...current,
    layers: moveItem(current.layers, layerIndex, delta),
  }), direction);
}

export function removeSpriteAnimationTemplateLayer(
  template: SpriteAnimationTemplate,
  clipName: string,
  frameIndex: number,
  layerIndex: number,
  direction: AnimationDirection = DEFAULT_ANIMATION_DIRECTION,
): SpriteAnimationTemplate {
  const { frame } = findFrame(template, clipName, frameIndex, direction);
  if (!frame.layers[layerIndex]) throw new Error(`Unknown layer ${layerIndex} in frame ${frameIndex}.`);
  if (frame.layers.length <= 1) throw new Error('A frame needs at least one layer.');
  return replaceFrame(template, clipName, frameIndex, (current) => ({
    ...current,
    layers: current.layers.filter((_layer, index) => index !== layerIndex),
  }), direction);
}
