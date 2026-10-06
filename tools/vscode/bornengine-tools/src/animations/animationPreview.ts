import type { SpriteAnimationDocument, SpriteAnimationFrameTransform, SpriteAnimationLoop, SpriteSheetCharacterMetadata } from './spriteAnimationSchema';
import { getSpriteAnimationCanvasSize } from './animationFrameTransform';

export interface AnimationPreviewFrame {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imagePath?: string;
  name?: string;
  duration?: number;
  transform?: SpriteAnimationFrameTransform;
}

export interface AnimationPreviewSelection {
  clipName: string;
  animationGroupId: string;
  direction: string;
  fps: number;
  loop: SpriteAnimationLoop;
  row: number;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  frames: AnimationPreviewFrame[];
}

export interface AnimationPreviewClipOption {
  name: string;
  animationGroupId: string;
  directions: string[];
}

/** Returns the available direction rows for each companion clip in metadata order. */
export function getAnimationPreviewClipOptions(
  document: SpriteAnimationDocument,
  metadata: SpriteSheetCharacterMetadata,
): AnimationPreviewClipOption[] {
  return document.clips.map((clip) => {
    if (clip.frames !== undefined) {
      return { name: clip.name, animationGroupId: clip.animationGroupId, directions: ['Frames'] };
    }
    const directions: string[] = [];
    for (const row of metadata.rows) {
      if (row.animation_group_id !== clip.animationGroupId || !row.direction || directions.includes(row.direction)) continue;
      directions.push(row.direction);
    }
    return { name: clip.name, animationGroupId: clip.animationGroupId, directions };
  });
}

/** Maps a clip and direction to the atlas cells covered by its metadata row. */
export function selectFramesForGroupAndDirection(
  document: SpriteAnimationDocument,
  metadata: SpriteSheetCharacterMetadata,
  clipName: string,
  direction: string,
): AnimationPreviewSelection | null {
  const clip = document.clips.find((candidate) => candidate.name === clipName);
  if (!clip || !direction) return null;

  if (clip.frames !== undefined) {
    if (direction !== 'Frames' || clip.frames.length === 0) return null;
    const frames = clip.frames.map((frame, column) => ({
      column,
      row: -1,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      imagePath: frame.image,
      ...(frame.name === undefined ? {} : { name: frame.name }),
      ...(frame.duration === undefined ? {} : { duration: frame.duration }),
      ...(frame.transform === undefined ? {} : { transform: frame.transform }),
    }));
    const canvas = getSpriteAnimationCanvasSize(clip, metadata);
    return {
      clipName: clip.name,
      animationGroupId: clip.animationGroupId,
      direction: 'Frames',
      fps: clip.fps,
      loop: clip.loop,
      row: -1,
      frameCount: frames.length,
      cellWidth: frames[0]?.width ?? 1,
      cellHeight: frames[0]?.height ?? 1,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      frames,
    };
  }

  const rows = metadata.rows.filter((row) =>
    row.animation_group_id === clip.animationGroupId && row.direction === direction);
  if (rows.length !== 1) return null;

  const row = rows[0];
  if (!row || !Number.isInteger(row.row) || row.row < 0 ||
      !Number.isInteger(row.frame_count) || row.frame_count <= 0 ||
      !Number.isInteger(metadata.cell_size.width) || metadata.cell_size.width <= 0 ||
      !Number.isInteger(metadata.cell_size.height) || metadata.cell_size.height <= 0 ||
      !Number.isInteger(metadata.columns) || row.frame_count > metadata.columns ||
      row.row * metadata.cell_size.height + metadata.cell_size.height > metadata.sheet_size.height) {
    return null;
  }

  const frames: AnimationPreviewFrame[] = [];
  for (let column = 0; column < row.frame_count; column++) {
    if (column * metadata.cell_size.width + metadata.cell_size.width > metadata.sheet_size.width) return null;
    frames.push({
      column,
      row: row.row,
      x: column * metadata.cell_size.width,
      y: row.row * metadata.cell_size.height,
      width: metadata.cell_size.width,
      height: metadata.cell_size.height,
    });
  }

  const canvas = getSpriteAnimationCanvasSize(clip, metadata);
  return {
    clipName: clip.name,
    animationGroupId: clip.animationGroupId,
    direction,
    fps: clip.fps,
    loop: clip.loop,
    row: row.row,
    frameCount: frames.length,
    cellWidth: metadata.cell_size.width,
    cellHeight: metadata.cell_size.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    frames,
  };
}

/** Resolves the frame shown at elapsed playback time using SpriteAnimation loop rules. */
export function advancePreviewFrame(
  frameCount: number,
  fps: number,
  loop: SpriteAnimationLoop,
  elapsedSeconds: number,
): number | null {
  if (!Number.isInteger(frameCount) || frameCount <= 0 || !Number.isFinite(fps) || fps <= 0 ||
      !Number.isFinite(elapsedSeconds) ||
      (loop !== 'loop' && loop !== 'once' && loop !== 'ping-pong')) return null;

  const elapsedFrames = Math.floor(Math.max(0, elapsedSeconds) * fps);
  if (!Number.isFinite(elapsedFrames)) return null;
  if (frameCount === 1 || loop === 'once') return Math.min(elapsedFrames, frameCount - 1);
  if (loop === 'loop') return elapsedFrames % frameCount;

  const cycleLength = 2 * (frameCount - 1);
  const cyclePosition = elapsedFrames % cycleLength;
  return cyclePosition < frameCount ? cyclePosition : cycleLength - cyclePosition;
}
