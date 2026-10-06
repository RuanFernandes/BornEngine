export const SPRITE_ANIMATION_DOCUMENT_FORMAT = 'bornengine.spriteanim';
export const SPRITE_ANIMATION_DOCUMENT_VERSION = 1;

export type SpriteAnimationLoop = 'loop' | 'once' | 'ping-pong';

export interface SpriteAnimationFrameTransform {
  offset: { x: number; y: number };
  stretch: { x: number; y: number };
  zoom: number;
  rotation: number;
  pivot: { x: number; y: number };
}

export interface SpriteAnimationFrameDefinition {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  duration?: number;
  transform?: SpriteAnimationFrameTransform;
}

export interface SpriteAnimationClipDefinition {
  name: string;
  animationGroupId: string;
  fps: number;
  loop: SpriteAnimationLoop;
  frames?: SpriteAnimationFrameDefinition[];
  canvasSize?: { width: number; height: number };
}

export interface SpriteAnimationDocument {
  format: typeof SPRITE_ANIMATION_DOCUMENT_FORMAT;
  version: typeof SPRITE_ANIMATION_DOCUMENT_VERSION;
  source: string;
  clips: SpriteAnimationClipDefinition[];
}

export interface SpriteSheetCharacterMetadataRow {
  row: number;
  type: string;
  frame_count: number;
  animation_group_id?: string;
  direction?: string;
}

export interface SpriteSheetCharacterMetadata {
  spritesheet: { path: string };
  cell_size: { width: number; height: number };
  sheet_size: { width: number; height: number };
  columns: number;
  rows: SpriteSheetCharacterMetadataRow[];
}

export interface SpriteAnimationDocumentDiagnostic {
  path: string;
  code: string;
  message: string;
}

export type SpriteAnimationValidationResult<T> =
  | { ok: true; value: T; diagnostics: [] }
  | { ok: false; value: null; diagnostics: SpriteAnimationDocumentDiagnostic[] };

export interface SpriteSheetTextureSize {
  width: number;
  height: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && Number.isInteger(value);
}

function pointer(parent: string, segment: string | number): string {
  return `${parent}/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function addDiagnostic(
  diagnostics: SpriteAnimationDocumentDiagnostic[],
  path: string,
  code: string,
  message: string,
): void {
  diagnostics.push({ path, code, message });
}

function isNormalizedWorkspacePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() ||
      value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isRelativeImageReference(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() ||
      value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return value.split('/').every((segment) => segment.length > 0);
}

function success<T>(value: T): SpriteAnimationValidationResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(diagnostics: SpriteAnimationDocumentDiagnostic[]): SpriteAnimationValidationResult<T> {
  return { ok: false, value: null, diagnostics };
}

export function validateSpriteAnimationDocument(input: unknown): SpriteAnimationValidationResult<SpriteAnimationDocument> {
  const diagnostics: SpriteAnimationDocumentDiagnostic[] = [];
  if (!isObject(input)) {
    addDiagnostic(diagnostics, '', 'invalid_document', 'Sprite animation document must be a JSON object.');
    return failure(diagnostics);
  }
  if (input.format !== SPRITE_ANIMATION_DOCUMENT_FORMAT) {
    addDiagnostic(diagnostics, '/format', 'invalid_format', `Format must be "${SPRITE_ANIMATION_DOCUMENT_FORMAT}".`);
  }
  if (input.version !== SPRITE_ANIMATION_DOCUMENT_VERSION) {
    addDiagnostic(diagnostics, '/version', 'unsupported_version', `Only sprite animation document version ${SPRITE_ANIMATION_DOCUMENT_VERSION} is supported.`);
  }
  if (!isNormalizedWorkspacePath(input.source)) {
    addDiagnostic(diagnostics, '/source', 'invalid_source_path', 'Source must be a normalized workspace-relative metadata path.');
  }
  if (!Array.isArray(input.clips)) {
    addDiagnostic(diagnostics, '/clips', 'invalid_clips', 'Clips must be an array.');
  } else {
    const names = new Set<string>();
    input.clips.forEach((clip, index) => {
      const clipPath = pointer('/clips', index);
      if (!isObject(clip)) {
        addDiagnostic(diagnostics, clipPath, 'invalid_clip', 'Each clip must be a JSON object.');
        return;
      }
      if (typeof clip.name !== 'string' || clip.name.length === 0 || clip.name !== clip.name.trim()) {
        addDiagnostic(diagnostics, pointer(clipPath, 'name'), 'invalid_clip_name', 'Clip name must be a non-empty string.');
      } else if (names.has(clip.name)) {
        addDiagnostic(diagnostics, pointer(clipPath, 'name'), 'duplicate_clip_name', `Clip name "${clip.name}" must be unique.`);
      } else names.add(clip.name);
      if (typeof clip.animationGroupId !== 'string' || clip.animationGroupId.length === 0 || clip.animationGroupId !== clip.animationGroupId.trim()) {
        addDiagnostic(diagnostics, pointer(clipPath, 'animationGroupId'), 'invalid_animation_group_id', 'Animation group ID must be a non-empty string.');
      }
      if (!isFiniteNumber(clip.fps) || clip.fps <= 0) {
        addDiagnostic(diagnostics, pointer(clipPath, 'fps'), 'invalid_fps', 'Clip FPS must be finite and positive.');
      }
      if (clip.loop !== 'loop' && clip.loop !== 'once' && clip.loop !== 'ping-pong') {
        addDiagnostic(diagnostics, pointer(clipPath, 'loop'), 'invalid_loop', 'Loop must be loop, once, or ping-pong.');
      }
      if (clip.canvasSize !== undefined && (!isObject(clip.canvasSize) ||
          !isPositiveInteger(clip.canvasSize.width) || !isPositiveInteger(clip.canvasSize.height))) {
        addDiagnostic(diagnostics, pointer(clipPath, 'canvasSize'), 'invalid_canvas_size', 'canvasSize width and height must be positive integers.');
      }
      if (clip.frames !== undefined) {
        if (!Array.isArray(clip.frames)) {
          addDiagnostic(diagnostics, pointer(clipPath, 'frames'), 'invalid_frames', 'frames must be an array when present.');
        } else {
          clip.frames.forEach((frame, frameIndex) => {
            const framePath = pointer(pointer(clipPath, 'frames'), frameIndex);
            if (!isObject(frame)) {
              addDiagnostic(diagnostics, framePath, 'invalid_frame', 'Each sprite frame must be a JSON object.');
              return;
            }
            if (!isNormalizedWorkspacePath(frame.image)) {
              addDiagnostic(diagnostics, pointer(framePath, 'image'), 'invalid_frame_image', 'Frame image must be a normalized workspace-relative path.');
            }
            if (!isFiniteNumber(frame.x) || frame.x < 0 || !Number.isInteger(frame.x) ||
                !isFiniteNumber(frame.y) || frame.y < 0 || !Number.isInteger(frame.y)) {
              addDiagnostic(diagnostics, framePath, 'invalid_frame_position', 'Frame x and y must be non-negative integers.');
            }
            if (!isPositiveInteger(frame.width) || !isPositiveInteger(frame.height)) {
              addDiagnostic(diagnostics, framePath, 'invalid_frame_size', 'Frame width and height must be positive integers.');
            }
            if (frame.name !== undefined && (typeof frame.name !== 'string' || frame.name.length === 0 || frame.name !== frame.name.trim())) {
              addDiagnostic(diagnostics, pointer(framePath, 'name'), 'invalid_frame_name', 'Frame name must be a non-empty trimmed string when present.');
            }
            if (frame.duration !== undefined && (!isFiniteNumber(frame.duration) || frame.duration <= 0)) {
              addDiagnostic(diagnostics, pointer(framePath, 'duration'), 'invalid_frame_duration', 'Frame duration must be finite and positive when present.');
            }
            if (frame.transform !== undefined) {
              const transform = isObject(frame.transform) ? frame.transform : null;
              const offset = transform && isObject(transform.offset) ? transform.offset : null;
              const stretch = transform && isObject(transform.stretch) ? transform.stretch : null;
              const pivot = transform && isObject(transform.pivot) ? transform.pivot : null;
              const validOffset = offset && isFiniteNumber(offset.x) && isFiniteNumber(offset.y);
              const validStretch = stretch && isFiniteNumber(stretch.x) && stretch.x !== 0 &&
                isFiniteNumber(stretch.y) && stretch.y !== 0;
              const validRotation = transform && isFiniteNumber(transform.rotation);
              const validZoom = transform && (transform.zoom === undefined ||
                (isFiniteNumber(transform.zoom) && transform.zoom > 0));
              const validPivot = pivot && isFiniteNumber(pivot.x) && pivot.x >= 0 && pivot.x <= 1 &&
                isFiniteNumber(pivot.y) && pivot.y >= 0 && pivot.y <= 1;
              if (!transform || !validOffset || !validStretch || !validZoom || !validRotation || !validPivot) {
                addDiagnostic(diagnostics, pointer(framePath, 'transform'), 'invalid_frame_transform',
                  'Frame transform needs finite offset, non-zero stretch, positive zoom, rotation, and pivot coordinates between 0 and 1.');
              }
            }
          });
        }
      }
    });
  }
  if (diagnostics.length > 0) return failure(diagnostics);
  const clips = (input.clips as Array<Record<string, unknown>>).map((clip) => ({
    name: clip.name as string,
    animationGroupId: clip.animationGroupId as string,
    fps: clip.fps as number,
    loop: clip.loop as SpriteAnimationLoop,
    ...(clip.canvasSize === undefined ? {} : {
      canvasSize: {
        width: (clip.canvasSize as { width: number; height: number }).width,
        height: (clip.canvasSize as { width: number; height: number }).height,
      },
    }),
    ...(clip.frames === undefined ? {} : {
      frames: (clip.frames as Array<Record<string, unknown>>).map((frame) => ({
        image: frame.image as string,
        x: frame.x as number,
        y: frame.y as number,
        width: frame.width as number,
        height: frame.height as number,
        ...(frame.name === undefined ? {} : { name: frame.name as string }),
        ...(frame.duration === undefined ? {} : { duration: frame.duration as number }),
        ...(frame.transform === undefined ? {} : {
          transform: {
            offset: { ...(frame.transform as SpriteAnimationFrameTransform).offset },
            stretch: { ...(frame.transform as SpriteAnimationFrameTransform).stretch },
            zoom: (frame.transform as SpriteAnimationFrameTransform).zoom ?? 1,
            rotation: (frame.transform as SpriteAnimationFrameTransform).rotation,
            pivot: { ...(frame.transform as SpriteAnimationFrameTransform).pivot },
          },
        }),
      })),
    }),
  }));
  return success({
    format: SPRITE_ANIMATION_DOCUMENT_FORMAT,
    version: SPRITE_ANIMATION_DOCUMENT_VERSION,
    source: input.source as string,
    clips,
  });
}

export function validateSpriteSheetCharacterMetadata(
  input: unknown,
  textureSize?: SpriteSheetTextureSize,
): SpriteAnimationValidationResult<SpriteSheetCharacterMetadata> {
  const diagnostics: SpriteAnimationDocumentDiagnostic[] = [];
  if (!isObject(input)) {
    addDiagnostic(diagnostics, '', 'invalid_metadata', 'Sprite sheet character metadata must be a JSON object.');
    return failure(diagnostics);
  }
  const spritesheet = isObject(input.spritesheet) ? input.spritesheet : null;
  const cellSize = isObject(input.cell_size) ? input.cell_size : null;
  const sheetSize = isObject(input.sheet_size) ? input.sheet_size : null;
  if (!spritesheet || !isRelativeImageReference(spritesheet.path)) {
    addDiagnostic(diagnostics, '/spritesheet/path', 'invalid_spritesheet_path', 'spritesheet.path must be a relative image path.');
  }
  if (!cellSize || !isPositiveInteger(cellSize.width) || !isPositiveInteger(cellSize.height)) {
    addDiagnostic(diagnostics, '/cell_size', 'invalid_cell_size', 'cell_size width and height must be positive integers.');
  }
  if (!sheetSize || !isPositiveInteger(sheetSize.width) || !isPositiveInteger(sheetSize.height)) {
    addDiagnostic(diagnostics, '/sheet_size', 'invalid_sheet_size', 'sheet_size width and height must be positive integers.');
  }
  if (!isPositiveInteger(input.columns)) {
    addDiagnostic(diagnostics, '/columns', 'invalid_columns', 'columns must be a positive integer.');
  }
  if (textureSize && (!isPositiveInteger(textureSize.width) || !isPositiveInteger(textureSize.height))) {
    addDiagnostic(diagnostics, '/texture', 'invalid_texture_size', 'Decoded texture dimensions must be positive integers.');
  }
  if (sheetSize && isPositiveInteger(sheetSize.width) && isPositiveInteger(sheetSize.height) && textureSize &&
      isPositiveInteger(textureSize.width) && isPositiveInteger(textureSize.height) &&
      (sheetSize.width !== textureSize.width || sheetSize.height !== textureSize.height)) {
    addDiagnostic(diagnostics, '/sheet_size', 'sheet_size_mismatch', 'Declared sheet_size does not match the decoded image dimensions.');
  }
  const sheetWidth = sheetSize?.width;
  const sheetHeight = sheetSize?.height;
  const cellWidth = cellSize?.width;
  const cellHeight = cellSize?.height;
  if (isPositiveInteger(sheetWidth) && isPositiveInteger(cellWidth) && isPositiveInteger(input.columns) &&
      input.columns > Math.floor(sheetWidth / cellWidth)) {
    addDiagnostic(diagnostics, '/columns', 'columns_exceed_sheet', 'columns cannot exceed the number of cells that fit in sheet_size.');
  }
  if (!Array.isArray(input.rows)) {
    addDiagnostic(diagnostics, '/rows', 'invalid_rows', 'rows must be an array.');
  } else {
    input.rows.forEach((row, index) => {
      const rowPath = pointer('/rows', index);
      if (!isObject(row)) {
        addDiagnostic(diagnostics, rowPath, 'invalid_row', 'Each metadata row must be a JSON object.');
        return;
      }
      const maximumRows = isPositiveInteger(sheetHeight) && isPositiveInteger(cellHeight)
        ? Math.floor(sheetHeight / cellHeight)
        : Number.POSITIVE_INFINITY;
      if (!isFiniteNumber(row.row) || row.row < 0 || !Number.isInteger(row.row) || row.row >= maximumRows) {
        addDiagnostic(diagnostics, pointer(rowPath, 'row'), 'invalid_row', 'Row index must refer to a row inside sheet_size.');
      }
      if (typeof row.type !== 'string' || row.type.length === 0 || row.type !== row.type.trim()) {
        addDiagnostic(diagnostics, pointer(rowPath, 'type'), 'invalid_row_type', 'Row type must be a non-empty string.');
      }
      if (!isPositiveInteger(row.frame_count) || (isPositiveInteger(input.columns) && row.frame_count > input.columns)) {
        addDiagnostic(diagnostics, pointer(rowPath, 'frame_count'), 'invalid_frame_count', 'frame_count must be a positive integer no greater than columns.');
      }
      if (row.animation_group_id !== undefined &&
          (typeof row.animation_group_id !== 'string' || row.animation_group_id.length === 0 || row.animation_group_id !== row.animation_group_id.trim())) {
        addDiagnostic(diagnostics, pointer(rowPath, 'animation_group_id'), 'invalid_animation_group_id', 'animation_group_id must be a non-empty string when present.');
      }
      if (row.direction !== undefined &&
          (typeof row.direction !== 'string' || row.direction.length === 0 || row.direction !== row.direction.trim())) {
        addDiagnostic(diagnostics, pointer(rowPath, 'direction'), 'invalid_direction', 'direction must be a non-empty string when present.');
      }
    });
  }
  if (diagnostics.length > 0) return failure(diagnostics);
  const cell = input.cell_size as { width: number; height: number };
  const size = input.sheet_size as { width: number; height: number };
  const rows = (input.rows as Array<Record<string, unknown>>).map((row) => ({
    row: row.row as number,
    type: row.type as string,
    frame_count: row.frame_count as number,
    ...(row.animation_group_id === undefined ? {} : { animation_group_id: row.animation_group_id as string }),
    ...(row.direction === undefined ? {} : { direction: row.direction as string }),
  }));
  return success({
    spritesheet: { path: (input.spritesheet as Record<string, unknown>).path as string },
    cell_size: { width: cell.width, height: cell.height },
    sheet_size: { width: size.width, height: size.height },
    columns: input.columns as number,
    rows,
  });
}
