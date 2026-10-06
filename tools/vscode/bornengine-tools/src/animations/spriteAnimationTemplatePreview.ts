import type {
  ResolvedSpriteAnimationTemplateClip,
  ResolvedSpriteAnimationTemplateFrame,
  ResolvedSpriteAnimationTemplateLayer,
  ResolvedSpriteAnimationTemplateTransform,
  SpriteAnimationTemplateClip,
  SpriteAnimationTemplateFrame,
  SpriteAnimationTemplateLayer,
} from './spriteAnimationTemplateSchema';

export interface SpriteAnimationTemplatePreviewImage {
  readonly image: CanvasImageSource;
}

export interface SpriteAnimationTemplatePreviewPlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface SpriteAnimationTemplatePlaybackFrame {
  readonly index: number;
  readonly done: boolean;
}

const DEFAULT_TRANSFORM: ResolvedSpriteAnimationTemplateTransform = {
  offset: { x: 0, y: 0 },
  stretch: { x: 1, y: 1 },
  zoom: 1,
  rotation: 0,
  pivot: { x: 0.5, y: 0.5 },
};

/** Draws visible layers bottom-to-top using the same shared canvas and per-layer transform rules as playback. */
export function drawSpriteAnimationTemplateFrame(
  context: CanvasRenderingContext2D,
  clip: SpriteAnimationTemplateClip | ResolvedSpriteAnimationTemplateClip,
  frame: SpriteAnimationTemplateFrame | ResolvedSpriteAnimationTemplateFrame,
  images: Readonly<Record<string, SpriteAnimationTemplatePreviewImage | undefined>>,
  placement: SpriteAnimationTemplatePreviewPlacement,
): number {
  context.save();
  context.translate(placement.x, placement.y);
  context.scale(placement.scale, placement.scale);
  let drawn = 0;
  for (const layer of frame.layers as readonly (SpriteAnimationTemplateLayer | ResolvedSpriteAnimationTemplateLayer)[]) {
    if (layer.visible === false) continue;
    const source = images[layer.parameter];
    if (!source) continue;
    const transform = { ...DEFAULT_TRANSFORM, ...(layer.transform ?? {}) };
    context.save();
    context.translate(clip.canvasSize.width / 2 + transform.offset.x, clip.canvasSize.height / 2 + transform.offset.y);
    context.rotate(transform.rotation * Math.PI / 180);
    context.scale(transform.stretch.x * transform.zoom, transform.stretch.y * transform.zoom);
    context.drawImage(
      source.image,
      layer.source.x,
      layer.source.y,
      layer.source.width,
      layer.source.height,
      -layer.source.width * transform.pivot.x,
      -layer.source.height * transform.pivot.y,
      layer.source.width,
      layer.source.height,
    );
    context.restore();
    drawn++;
  }
  context.restore();
  return drawn;
}

/** Resolves a shared clip playhead to one frame, including frame-specific timing and loop modes. */
export function getSpriteAnimationTemplateFrameIndex(
  clip: SpriteAnimationTemplateClip | ResolvedSpriteAnimationTemplateClip,
  elapsedSeconds: number,
): SpriteAnimationTemplatePlaybackFrame {
  const count = clip.frames.length;
  if (count === 0) return { index: 0, done: true };
  const durationOf = (index: number): number => clip.frames[index]!.duration ?? 1 / clip.fps;
  const sequence = clip.loop === 'ping-pong'
    ? [...Array.from({ length: count }, (_item, index) => index), ...Array.from({ length: Math.max(0, count - 2) }, (_item, index) => count - 2 - index)]
    : Array.from({ length: count }, (_item, index) => index);
  const durations = sequence.map(durationOf);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = Math.max(0, elapsedSeconds);
  const epsilon = Number.EPSILON * Math.max(1, total) * 8;
  const done = clip.loop === 'once' && elapsed >= total - epsilon;
  let time = clip.loop === 'once' ? Math.min(elapsed, Math.max(0, total - epsilon)) : elapsed % total;
  if (clip.loop !== 'once' && total - time <= epsilon) time = 0;
  for (let index = 0; index < sequence.length; index++) {
    if (time + epsilon < durations[index]!) return { index: sequence[index]!, done };
    time -= durations[index]!;
  }
  return { index: sequence[sequence.length - 1]!, done };
}
