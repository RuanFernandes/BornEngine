export const SPRITE_ANIMATION_TEMPLATE_FORMAT = 'bornengine.spriteanim-template';
export const SPRITE_ANIMATION_TEMPLATE_VERSION = 1;

export type SpriteAnimationTemplateLoop = 'loop' | 'once' | 'ping-pong';

export interface SpriteAnimationTemplateVector2 {
  readonly x: number;
  readonly y: number;
}

export interface SpriteAnimationTemplateTransform {
  readonly offset?: SpriteAnimationTemplateVector2;
  readonly stretch?: SpriteAnimationTemplateVector2;
  readonly zoom?: number;
  readonly rotation?: number;
  readonly pivot?: SpriteAnimationTemplateVector2;
}

export interface ResolvedSpriteAnimationTemplateTransform {
  readonly offset: SpriteAnimationTemplateVector2;
  readonly stretch: SpriteAnimationTemplateVector2;
  readonly zoom: number;
  readonly rotation: number;
  readonly pivot: SpriteAnimationTemplateVector2;
}

export interface SpriteAnimationTemplateParameter {
  readonly id: string;
  readonly label?: string;
  readonly required: boolean;
  readonly tags?: readonly string[];
}

export interface SpriteAnimationTemplateSourceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SpriteAnimationTemplateLayer {
  readonly parameter: string;
  readonly source: SpriteAnimationTemplateSourceRect;
  readonly visible?: boolean;
  readonly transform?: SpriteAnimationTemplateTransform;
}

export interface SpriteAnimationTemplateFrame {
  readonly duration?: number;
  readonly markers?: readonly string[];
  readonly layers: readonly SpriteAnimationTemplateLayer[];
}

export interface SpriteAnimationTemplateCanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface SpriteAnimationTemplateClip {
  readonly name: string;
  readonly fps: number;
  readonly loop: SpriteAnimationTemplateLoop;
  readonly canvasSize: SpriteAnimationTemplateCanvasSize;
  readonly frames: readonly SpriteAnimationTemplateFrame[];
}

export interface SpriteAnimationTemplate {
  readonly format: typeof SPRITE_ANIMATION_TEMPLATE_FORMAT;
  readonly version: typeof SPRITE_ANIMATION_TEMPLATE_VERSION;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly imageParameters: readonly SpriteAnimationTemplateParameter[];
  readonly clips: readonly SpriteAnimationTemplateClip[];
}

export interface ResolvedSpriteAnimationTemplateLayer extends SpriteAnimationTemplateLayer {
  readonly visible: boolean;
  readonly transform: ResolvedSpriteAnimationTemplateTransform;
}

export interface ResolvedSpriteAnimationTemplateFrame extends SpriteAnimationTemplateFrame {
  readonly layers: readonly ResolvedSpriteAnimationTemplateLayer[];
}

export interface ResolvedSpriteAnimationTemplateClip extends SpriteAnimationTemplateClip {
  readonly frames: readonly ResolvedSpriteAnimationTemplateFrame[];
}

export interface ResolvedSpriteAnimationTemplate extends SpriteAnimationTemplate {
  readonly clips: readonly ResolvedSpriteAnimationTemplateClip[];
}

export interface SpriteAnimationTemplateDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type SpriteAnimationTemplateValidationResult =
  | { readonly ok: true; readonly value: ResolvedSpriteAnimationTemplate; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly value: null; readonly diagnostics: readonly SpriteAnimationTemplateDiagnostic[] };

export interface SpriteAnimationTemplateImageSize {
  readonly width: number;
  readonly height: number;
}

export type SpriteAnimationTemplateBindingValidationResult =
  | { readonly ok: true; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly SpriteAnimationTemplateDiagnostic[] };

const TEMPLATE_KEYS = ['format', 'version', 'id', 'name', 'description', 'imageParameters', 'clips'];
const PARAMETER_KEYS = ['id', 'label', 'required', 'tags'];
const CLIP_KEYS = ['name', 'fps', 'loop', 'canvasSize', 'frames'];
const FRAME_KEYS = ['duration', 'markers', 'layers'];
const LAYER_KEYS = ['parameter', 'source', 'visible', 'transform'];
const SOURCE_KEYS = ['x', 'y', 'width', 'height'];
const TRANSFORM_KEYS = ['offset', 'stretch', 'zoom', 'rotation', 'pivot'];
const VECTOR_KEYS = ['x', 'y'];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && Number.isInteger(value);
}

function pointer(parent: string, segment: string | number): string {
  return `${parent}/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function addDiagnostic(
  diagnostics: SpriteAnimationTemplateDiagnostic[],
  path: string,
  code: string,
  message: string,
): void {
  diagnostics.push({ path, code, message });
}

function checkKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  diagnostics: SpriteAnimationTemplateDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      addDiagnostic(diagnostics, pointer(path, key), 'template.field', `Unknown field "${key}".`);
    }
  }
}

function validStableText(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function success(value: ResolvedSpriteAnimationTemplate): SpriteAnimationTemplateValidationResult {
  return { ok: true, value, diagnostics: [] };
}

function failure(diagnostics: SpriteAnimationTemplateDiagnostic[]): SpriteAnimationTemplateValidationResult {
  return { ok: false, value: null, diagnostics };
}

function bindingFailure(
  diagnostics: SpriteAnimationTemplateDiagnostic[],
): SpriteAnimationTemplateBindingValidationResult {
  return { ok: false, diagnostics };
}

function bindingSuccess(): SpriteAnimationTemplateBindingValidationResult {
  return { ok: true, diagnostics: [] };
}

/** Validates and fills the documented defaults of a source-independent animation template. */
export function validateSpriteAnimationTemplate(input: unknown): SpriteAnimationTemplateValidationResult {
  const diagnostics: SpriteAnimationTemplateDiagnostic[] = [];
  if (!isObject(input)) {
    addDiagnostic(diagnostics, '', 'template.object', 'Animation template must be a JSON object.');
    return failure(diagnostics);
  }
  checkKeys(input, TEMPLATE_KEYS, '', diagnostics);
  if (input.format !== SPRITE_ANIMATION_TEMPLATE_FORMAT) {
    addDiagnostic(diagnostics, '/format', 'template.format', `Format must be "${SPRITE_ANIMATION_TEMPLATE_FORMAT}".`);
  }
  if (input.version !== SPRITE_ANIMATION_TEMPLATE_VERSION) {
    addDiagnostic(
      diagnostics,
      '/version',
      'template.version',
      `Only animation template version ${SPRITE_ANIMATION_TEMPLATE_VERSION} is supported.`,
    );
  }
  if (!validStableText(input.id)) {
    addDiagnostic(
      diagnostics,
      '/id',
      'template.id',
      'Template ID must be non-empty, trimmed text without control characters.',
    );
  }
  if (!validStableText(input.name)) {
    addDiagnostic(
      diagnostics,
      '/name',
      'template.name',
      'Template name must be non-empty, trimmed text without control characters.',
    );
  }
  if (
    input.description !== undefined &&
    (typeof input.description !== 'string' || input.description !== input.description.trim())
  ) {
    addDiagnostic(
      diagnostics,
      '/description',
      'template.description',
      'Description must be trimmed text when present.',
    );
  }

  const parameters: SpriteAnimationTemplateParameter[] = [];
  const parameterIds = new Set<string>();
  if (!Array.isArray(input.imageParameters) || input.imageParameters.length === 0) {
    addDiagnostic(diagnostics, '/imageParameters', 'parameter.list', 'At least one image parameter is required.');
  } else {
    input.imageParameters.forEach((rawParameter, index) => {
      const path = pointer('/imageParameters', index);
      if (!isObject(rawParameter)) {
        addDiagnostic(diagnostics, path, 'parameter.object', 'Each image parameter must be a JSON object.');
        return;
      }
      checkKeys(rawParameter, PARAMETER_KEYS, path, diagnostics);
      let id = '';
      if (!validStableText(rawParameter.id)) {
        addDiagnostic(
          diagnostics,
          pointer(path, 'id'),
          'parameter.id',
          'Parameter ID must be non-empty, trimmed text without control characters.',
        );
      } else {
        id = rawParameter.id;
        if (parameterIds.has(id))
          addDiagnostic(
            diagnostics,
            pointer(path, 'id'),
            'parameter.duplicate',
            `Parameter ID "${id}" must be unique.`,
          );
        parameterIds.add(id);
      }
      if (rawParameter.label !== undefined && !validStableText(rawParameter.label)) {
        addDiagnostic(
          diagnostics,
          pointer(path, 'label'),
          'parameter.label',
          'Parameter label must be non-empty, trimmed text without control characters when present.',
        );
      }
      if (typeof rawParameter.required !== 'boolean') {
        addDiagnostic(
          diagnostics,
          pointer(path, 'required'),
          'parameter.required',
          'Parameter required must be a boolean.',
        );
      }
      let tags: string[] | undefined;
      if (rawParameter.tags !== undefined) {
        if (!Array.isArray(rawParameter.tags)) {
          addDiagnostic(
            diagnostics,
            pointer(path, 'tags'),
            'parameter.tags',
            'Parameter tags must be an array of unique non-empty strings.',
          );
        } else {
          const tagSet = new Set<string>();
          tags = [];
          rawParameter.tags.forEach((tag, tagIndex) => {
            if (!validStableText(tag)) {
              addDiagnostic(
                diagnostics,
                pointer(pointer(path, 'tags'), tagIndex),
                'parameter.tag',
                'Tags must be non-empty, trimmed text without control characters.',
              );
            } else if (tagSet.has(tag)) {
              addDiagnostic(
                diagnostics,
                pointer(pointer(path, 'tags'), tagIndex),
                'parameter.tag_duplicate',
                `Tag "${tag}" must be unique for this parameter.`,
              );
            } else {
              tagSet.add(tag);
              tags?.push(tag);
            }
          });
        }
      }
      if (
        id.length > 0 &&
        typeof rawParameter.required === 'boolean' &&
        (rawParameter.label === undefined || validStableText(rawParameter.label)) &&
        (rawParameter.tags === undefined || Array.isArray(rawParameter.tags))
      ) {
        parameters.push({
          id,
          ...(rawParameter.label === undefined ? {} : { label: rawParameter.label as string }),
          required: rawParameter.required,
          ...(tags === undefined ? {} : { tags }),
        });
      }
    });
  }

  const clips: ResolvedSpriteAnimationTemplateClip[] = [];
  const clipNames = new Set<string>();
  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    addDiagnostic(diagnostics, '/clips', 'clip.list', 'At least one animation clip is required.');
  } else {
    input.clips.forEach((rawClip, clipIndex) => {
      const clipPath = pointer('/clips', clipIndex);
      if (!isObject(rawClip)) {
        addDiagnostic(diagnostics, clipPath, 'clip.object', 'Each clip must be a JSON object.');
        return;
      }
      checkKeys(rawClip, CLIP_KEYS, clipPath, diagnostics);
      let name = '';
      if (!validStableText(rawClip.name)) {
        addDiagnostic(
          diagnostics,
          pointer(clipPath, 'name'),
          'clip.name',
          'Clip name must be non-empty, trimmed text without control characters.',
        );
      } else {
        name = rawClip.name;
        if (clipNames.has(name))
          addDiagnostic(
            diagnostics,
            pointer(clipPath, 'name'),
            'clip.duplicate',
            `Clip name "${name}" must be unique.`,
          );
        clipNames.add(name);
      }
      if (!isFiniteNumber(rawClip.fps) || rawClip.fps <= 0) {
        addDiagnostic(diagnostics, pointer(clipPath, 'fps'), 'clip.fps', 'Clip FPS must be finite and positive.');
      }
      if (rawClip.loop !== 'loop' && rawClip.loop !== 'once' && rawClip.loop !== 'ping-pong') {
        addDiagnostic(diagnostics, pointer(clipPath, 'loop'), 'clip.loop', 'Loop must be loop, once, or ping-pong.');
      }
      const canvas = isObject(rawClip.canvasSize) ? rawClip.canvasSize : null;
      if (!canvas || !isPositiveInteger(canvas.width) || !isPositiveInteger(canvas.height)) {
        addDiagnostic(
          diagnostics,
          pointer(clipPath, 'canvasSize'),
          'clip.canvas',
          'Canvas width and height must be positive integers.',
        );
      } else checkKeys(canvas, ['width', 'height'], pointer(clipPath, 'canvasSize'), diagnostics);

      const frames: ResolvedSpriteAnimationTemplateFrame[] = [];
      if (!Array.isArray(rawClip.frames) || rawClip.frames.length === 0) {
        addDiagnostic(
          diagnostics,
          pointer(clipPath, 'frames'),
          'frame.list',
          'Each clip must contain at least one frame.',
        );
      } else {
        rawClip.frames.forEach((rawFrame, frameIndex) => {
          const framePath = pointer(pointer(clipPath, 'frames'), frameIndex);
          if (!isObject(rawFrame)) {
            addDiagnostic(diagnostics, framePath, 'frame.object', 'Each frame must be a JSON object.');
            return;
          }
          checkKeys(rawFrame, FRAME_KEYS, framePath, diagnostics);
          if (rawFrame.duration !== undefined && (!isFiniteNumber(rawFrame.duration) || rawFrame.duration <= 0)) {
            addDiagnostic(
              diagnostics,
              pointer(framePath, 'duration'),
              'frame.duration',
              'Frame duration must be finite and positive when present.',
            );
          }
          let markers: string[] | undefined;
          if (rawFrame.markers !== undefined) {
            if (!Array.isArray(rawFrame.markers)) {
              addDiagnostic(
                diagnostics,
                pointer(framePath, 'markers'),
                'frame.markers',
                'Frame markers must be an array of non-empty strings.',
              );
            } else {
              markers = [];
              rawFrame.markers.forEach((marker, markerIndex) => {
                if (!validStableText(marker)) {
                  addDiagnostic(
                    diagnostics,
                    pointer(pointer(framePath, 'markers'), markerIndex),
                    'frame.marker',
                    'Marker names must be non-empty, trimmed text without control characters.',
                  );
                } else markers?.push(marker);
              });
            }
          }
          const layers: ResolvedSpriteAnimationTemplateLayer[] = [];
          if (!Array.isArray(rawFrame.layers) || rawFrame.layers.length === 0) {
            addDiagnostic(
              diagnostics,
              pointer(framePath, 'layers'),
              'layer.list',
              'Each frame must contain at least one layer.',
            );
          } else {
            rawFrame.layers.forEach((rawLayer, layerIndex) => {
              const layerPath = pointer(pointer(framePath, 'layers'), layerIndex);
              if (!isObject(rawLayer)) {
                addDiagnostic(diagnostics, layerPath, 'layer.object', 'Each layer must be a JSON object.');
                return;
              }
              checkKeys(rawLayer, LAYER_KEYS, layerPath, diagnostics);
              const parameter = rawLayer.parameter;
              if (!validStableText(parameter) || !parameterIds.has(parameter)) {
                addDiagnostic(
                  diagnostics,
                  pointer(layerPath, 'parameter'),
                  'layer.parameter',
                  'Layer must reference a declared image parameter ID.',
                );
              }
              const source = isObject(rawLayer.source) ? rawLayer.source : null;
              if (
                !source ||
                !isNonNegativeInteger(source.x) ||
                !isNonNegativeInteger(source.y) ||
                !isPositiveInteger(source.width) ||
                !isPositiveInteger(source.height)
              ) {
                addDiagnostic(
                  diagnostics,
                  pointer(layerPath, 'source'),
                  'layer.source',
                  'Layer source needs non-negative integer x/y and positive integer width/height.',
                );
              } else checkKeys(source, SOURCE_KEYS, pointer(layerPath, 'source'), diagnostics);
              if (rawLayer.visible !== undefined && typeof rawLayer.visible !== 'boolean') {
                addDiagnostic(
                  diagnostics,
                  pointer(layerPath, 'visible'),
                  'layer.visible',
                  'Layer visibility must be a boolean when present.',
                );
              }
              const transformResult = normalizeTransform(
                rawLayer.transform,
                pointer(layerPath, 'transform'),
                diagnostics,
              );
              if (
                validStableText(parameter) &&
                parameterIds.has(parameter) &&
                source &&
                isNonNegativeInteger(source.x) &&
                isNonNegativeInteger(source.y) &&
                isPositiveInteger(source.width) &&
                isPositiveInteger(source.height) &&
                transformResult !== null &&
                (rawLayer.visible === undefined || typeof rawLayer.visible === 'boolean')
              ) {
                layers.push({
                  parameter,
                  source: { x: source.x, y: source.y, width: source.width, height: source.height },
                  visible: rawLayer.visible === undefined ? true : rawLayer.visible,
                  transform: transformResult,
                });
              }
            });
          }
          if (
            Array.isArray(rawFrame.layers) &&
            rawFrame.layers.length > 0 &&
            layers.length === rawFrame.layers.length
          ) {
            frames.push({
              ...(rawFrame.duration === undefined ? {} : { duration: rawFrame.duration as number }),
              ...(markers === undefined ? {} : { markers }),
              layers,
            });
          }
        });
      }
      if (
        name.length > 0 &&
        isFiniteNumber(rawClip.fps) &&
        rawClip.fps > 0 &&
        (rawClip.loop === 'loop' || rawClip.loop === 'once' || rawClip.loop === 'ping-pong') &&
        canvas &&
        isPositiveInteger(canvas.width) &&
        isPositiveInteger(canvas.height) &&
        Array.isArray(rawClip.frames) &&
        rawClip.frames.length > 0 &&
        frames.length === rawClip.frames.length
      ) {
        clips.push({
          name,
          fps: rawClip.fps,
          loop: rawClip.loop,
          canvasSize: { width: canvas.width, height: canvas.height },
          frames,
        });
      }
    });
  }

  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    format: SPRITE_ANIMATION_TEMPLATE_FORMAT,
    version: SPRITE_ANIMATION_TEMPLATE_VERSION,
    id: input.id as string,
    name: input.name as string,
    ...(input.description === undefined ? {} : { description: input.description as string }),
    imageParameters: parameters,
    clips,
  });
}

function normalizeTransform(
  input: unknown,
  path: string,
  diagnostics: SpriteAnimationTemplateDiagnostic[],
): ResolvedSpriteAnimationTemplateTransform | null {
  if (input === undefined) {
    return {
      offset: { x: 0, y: 0 },
      stretch: { x: 1, y: 1 },
      zoom: 1,
      rotation: 0,
      pivot: { x: 0.5, y: 0.5 },
    };
  }
  if (!isObject(input)) {
    addDiagnostic(diagnostics, path, 'layer.transform', 'Transform must be an object.');
    return null;
  }
  checkKeys(input, TRANSFORM_KEYS, path, diagnostics);
  const offset = vectorWithDefault(input, 'offset', { x: 0, y: 0 }, path, diagnostics);
  const stretch = vectorWithDefault(input, 'stretch', { x: 1, y: 1 }, path, diagnostics);
  const pivot = vectorWithDefault(input, 'pivot', { x: 0.5, y: 0.5 }, path, diagnostics);
  const zoom = input.zoom === undefined ? 1 : input.zoom;
  const rotation = input.rotation === undefined ? 0 : input.rotation;
  let valid = offset !== null && stretch !== null && pivot !== null;
  if (stretch && (!isFiniteNumber(stretch.x) || stretch.x === 0 || !isFiniteNumber(stretch.y) || stretch.y === 0))
    valid = false;
  if (
    pivot &&
    (!isFiniteNumber(pivot.x) || pivot.x < 0 || pivot.x > 1 || !isFiniteNumber(pivot.y) || pivot.y < 0 || pivot.y > 1)
  )
    valid = false;
  if (!isFiniteNumber(zoom) || zoom <= 0 || !isFiniteNumber(rotation)) valid = false;
  if (!valid) {
    addDiagnostic(
      diagnostics,
      path,
      'layer.transform',
      'Transform needs finite offset, non-zero signed stretch, positive zoom, finite rotation, and normalized pivot coordinates from 0 to 1.',
    );
    return null;
  }
  return {
    offset: offset as SpriteAnimationTemplateVector2,
    stretch: stretch as SpriteAnimationTemplateVector2,
    zoom: zoom as number,
    rotation: rotation as number,
    pivot: pivot as SpriteAnimationTemplateVector2,
  };
}

function vectorWithDefault(
  transform: Record<string, unknown>,
  key: string,
  defaults: SpriteAnimationTemplateVector2,
  path: string,
  diagnostics: SpriteAnimationTemplateDiagnostic[],
): SpriteAnimationTemplateVector2 | null {
  const value = transform[key];
  if (value === undefined) return { x: defaults.x, y: defaults.y };
  if (!isObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    addDiagnostic(diagnostics, pointer(path, key), 'layer.transform', `${key} must contain finite x and y values.`);
    return null;
  }
  checkKeys(value, VECTOR_KEYS, pointer(path, key), diagnostics);
  return { x: value.x, y: value.y };
}

/** Checks supplied image sizes and every layer crop. Optional unbound inputs are valid and skipped. */
export function validateSpriteAnimationTemplateBinding(
  templateInput: unknown,
  imageSizes: unknown,
): SpriteAnimationTemplateBindingValidationResult {
  const templateResult = validateSpriteAnimationTemplate(templateInput);
  if (!templateResult.ok) return bindingFailure([...templateResult.diagnostics]);
  const diagnostics: SpriteAnimationTemplateDiagnostic[] = [];
  if (!isObject(imageSizes)) {
    addDiagnostic(diagnostics, '/images', 'binding.images', 'Image bindings must be an object keyed by parameter ID.');
    return bindingFailure(diagnostics);
  }

  const declared = new Map<string, SpriteAnimationTemplateParameter>();
  for (const parameter of templateResult.value.imageParameters) declared.set(parameter.id, parameter);
  for (const key of Object.keys(imageSizes)) {
    if (!declared.has(key))
      addDiagnostic(
        diagnostics,
        pointer('/images', key),
        'binding.unknown',
        `Image binding "${key}" is not declared by this template.`,
      );
  }

  const validSizes = new Map<string, SpriteAnimationTemplateImageSize>();
  for (const parameter of templateResult.value.imageParameters) {
    const supplied = hasOwn(imageSizes, parameter.id);
    if (!supplied) {
      if (parameter.required)
        addDiagnostic(
          diagnostics,
          pointer('/images', parameter.id),
          'binding.required',
          `Required image parameter "${parameter.id}" is missing.`,
        );
      continue;
    }
    const size = imageSizes[parameter.id];
    if (!isObject(size) || !isPositiveInteger(size.width) || !isPositiveInteger(size.height)) {
      addDiagnostic(
        diagnostics,
        pointer('/images', parameter.id),
        'binding.size',
        `Image parameter "${parameter.id}" needs positive integer texture dimensions.`,
      );
      continue;
    }
    validSizes.set(parameter.id, { width: size.width, height: size.height });
  }

  for (let clipIndex = 0; clipIndex < templateResult.value.clips.length; clipIndex++) {
    const clip = templateResult.value.clips[clipIndex];
    for (let frameIndex = 0; frameIndex < clip.frames.length; frameIndex++) {
      const frame = clip.frames[frameIndex];
      for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex++) {
        const layer = frame.layers[layerIndex];
        const size = validSizes.get(layer.parameter);
        if (!size) continue;
        if (layer.source.x + layer.source.width > size.width || layer.source.y + layer.source.height > size.height) {
          const path = pointer(pointer(pointer(pointer('/clips', clipIndex), 'frames'), frameIndex), 'layers');
          addDiagnostic(
            diagnostics,
            pointer(pointer(path, layerIndex), 'source'),
            'binding.crop',
            `Crop for image parameter "${layer.parameter}" is outside its ${size.width}x${size.height} texture.`,
          );
        }
      }
    }
  }
  return diagnostics.length > 0 ? bindingFailure(diagnostics) : bindingSuccess();
}
