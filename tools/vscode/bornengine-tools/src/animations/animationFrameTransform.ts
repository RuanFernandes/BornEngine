import type {
  SpriteAnimationClipDefinition,
  SpriteAnimationFrameDefinition,
  SpriteAnimationFrameTransform,
  SpriteSheetCharacterMetadata,
} from './spriteAnimationSchema';

export const DEFAULT_SPRITE_FRAME_TRANSFORM: SpriteAnimationFrameTransform = {
  offset: { x: 0, y: 0 },
  stretch: { x: 1, y: 1 },
  zoom: 1,
  rotation: 0,
  pivot: { x: 0.5, y: 0.5 },
};

export function getSpriteAnimationFrameTransform(
  frame: Pick<SpriteAnimationFrameDefinition, 'transform'>,
): SpriteAnimationFrameTransform {
  const transform = frame.transform;
  return {
    offset: { ...(transform?.offset ?? DEFAULT_SPRITE_FRAME_TRANSFORM.offset) },
    stretch: { ...(transform?.stretch ?? DEFAULT_SPRITE_FRAME_TRANSFORM.stretch) },
    zoom: transform?.zoom ?? DEFAULT_SPRITE_FRAME_TRANSFORM.zoom,
    rotation: transform?.rotation ?? DEFAULT_SPRITE_FRAME_TRANSFORM.rotation,
    pivot: { ...(transform?.pivot ?? DEFAULT_SPRITE_FRAME_TRANSFORM.pivot) },
  };
}

export function getSpriteAnimationCanvasSize(
  clip: Pick<SpriteAnimationClipDefinition, 'canvasSize'>,
  metadata: Pick<SpriteSheetCharacterMetadata, 'cell_size'>,
): { width: number; height: number } {
  return {
    width: clip.canvasSize?.width ?? metadata.cell_size.width,
    height: clip.canvasSize?.height ?? metadata.cell_size.height,
  };
}
