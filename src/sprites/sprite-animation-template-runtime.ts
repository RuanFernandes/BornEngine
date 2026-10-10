import { Colors } from '../core/colors';
import type { GameContext } from '../core/context';
import type { Color, Rect, Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import { getParallaxOffset } from '../camera2d/parallax-layer-2d';
import { GameComponent } from '../game/game-component';
import type { Renderer } from '../core/renderer';
import { SpriteSheet } from './sprite-sheet';
import type { SpriteFrame } from './sprite-sheet';
import type {
  ResolvedSpriteAnimationTemplate,
  ResolvedSpriteAnimationTemplateClip,
  ResolvedSpriteAnimationTemplateLayer,
  SpriteAnimationTemplateDiagnostic,
} from './sprite-animation-template';
import {
  clipFrameLists,
  SPRITE_ANIMATION_DEFAULT_DIR,
  spriteAnimationTemplateSource,
  validateSpriteAnimationTemplate,
  validateSpriteAnimationTemplateBinding,
} from './sprite-animation-template';
import type {
  SpriteAnimationLoop,
  SpriteAnimationPlaybackClip,
  SpriteAnimationPlaybackFrame,
} from './sprite-animation';
import type { SpriteAnimationTarget } from './sprite-animation-target';
import type { Texture } from '../textures/texture';

export interface SpriteAnimationTemplateBindingSuccess {
  readonly ok: true;
  readonly value: SpriteAnimationTemplateBoundAnimation;
  readonly diagnostics: readonly [];
}

export interface SpriteAnimationTemplateBindingFailure {
  readonly ok: false;
  readonly value: null;
  readonly diagnostics: readonly SpriteAnimationTemplateDiagnostic[];
}

export type SpriteAnimationTemplateBindingResult =
  | SpriteAnimationTemplateBindingSuccess
  | SpriteAnimationTemplateBindingFailure;

export interface SpriteAnimationTemplateBoundLayer extends ResolvedSpriteAnimationTemplateLayer {
  readonly sprite: SpriteFrame;
}

export interface SpriteAnimationTemplateBoundFrame extends SpriteAnimationPlaybackFrame {
  readonly layers: readonly SpriteAnimationTemplateBoundLayer[];
}

/** One immutable template clip after texture IDs have been bound to this character's art. */
export class SpriteAnimationTemplateBoundClip implements SpriteAnimationPlaybackClip {
  readonly error: string | null = null;
  readonly name: string;
  readonly fps: number;
  readonly loop: SpriteAnimationLoop;
  readonly duration: number;
  readonly canvasSize: ResolvedSpriteAnimationTemplateClip['canvasSize'];
  readonly frames: readonly SpriteAnimationTemplateBoundFrame[];
  /** Per-direction variants indexed by dir (0 up, 1 left, 2 down, 3 right); null for plain clips. */
  readonly directions: readonly SpriteAnimationTemplateBoundClip[] | null;

  constructor(
    clip: ResolvedSpriteAnimationTemplateClip,
    frames: readonly SpriteAnimationTemplateBoundFrame[],
    directions: readonly SpriteAnimationTemplateBoundClip[] | null = null,
  ) {
    this.name = clip.name;
    this.directions = directions === null ? null : Object.freeze(directions.slice());
    this.fps = clip.fps;
    this.loop = clip.loop;
    this.canvasSize = Object.freeze({ width: clip.canvasSize.width, height: clip.canvasSize.height });
    this.frames = Object.freeze(
      frames.map((frame) =>
        Object.freeze({
          duration: frame.duration,
          markers: Object.freeze(frame.markers.slice()),
          layers: Object.freeze(frame.layers.map((layer) => Object.freeze({ ...layer }))),
        }),
      ),
    );
    let duration = 0;
    for (let index = 0; index < this.frames.length; index++) duration += this.frames[index].duration;
    this.duration = duration;
    Object.freeze(this);
  }
}

/** Bound immutable frame data and per-binding SpriteSheet/SpriteFrame instances. */
export class SpriteAnimationTemplateBoundAnimation {
  readonly templateId: string;
  readonly templateName: string;
  readonly clips: Readonly<Record<string, SpriteAnimationTemplateBoundClip>>;
  private readonly sheets: readonly SpriteSheet[];
  private readonly textures: readonly Texture[];

  constructor(
    templateId: string,
    templateName: string,
    clips: Record<string, SpriteAnimationTemplateBoundClip>,
    sheets: readonly SpriteSheet[],
    textures: readonly Texture[],
  ) {
    this.templateId = templateId;
    this.templateName = templateName;
    this.clips = Object.freeze(clips);
    this.sheets = Object.freeze(sheets.slice());
    this.textures = Object.freeze(textures.slice());
    Object.freeze(this);
  }

  getClip(name: string): SpriteAnimationTemplateBoundClip | null {
    return Object.prototype.hasOwnProperty.call(this.clips, name) ? this.clips[name] : null;
  }

  /** @internal A bound animation stays with the Game that owns every supplied texture. */
  _canAttachTo(context: GameContext): boolean {
    for (let index = 0; index < this.textures.length; index++) {
      if (!this.textures[index]._canAttachTo(context)) return false;
    }
    for (let index = 0; index < this.sheets.length; index++) {
      if (!this.sheets[index]._canAttachTo(context)) return false;
    }
    return true;
  }
}

/** Validated, source-independent animation data that can be bound to different texture sets. */
export class SpriteAnimationTemplateAsset {
  private readonly value: ResolvedSpriteAnimationTemplate | null;
  private readonly diagnosticsValue: readonly SpriteAnimationTemplateDiagnostic[];

  constructor(input: unknown) {
    const result = validateSpriteAnimationTemplate(input);
    if (result.ok) {
      this.value = freezeValue(result.value);
      this.diagnosticsValue = [];
    } else {
      this.value = null;
      this.diagnosticsValue = result.diagnostics.slice();
    }
  }

  get error(): string | null {
    return this.diagnosticsValue.length === 0 ? null : this.diagnosticsValue[0].message;
  }

  get diagnostics(): readonly SpriteAnimationTemplateDiagnostic[] {
    return this.diagnosticsValue;
  }

  get definition(): ResolvedSpriteAnimationTemplate | null {
    return this.value;
  }

  bind(images: Readonly<Record<string, Texture>>): SpriteAnimationTemplateBindingResult {
    const template = this.value;
    if (template === null) return bindingFailure(this.diagnosticsValue.slice());
    if (images === null || images === undefined || typeof images !== 'object' || Array.isArray(images)) {
      return bindingFailure([
        { path: '/images', code: 'binding.images', message: 'Image bindings must be an object keyed by parameter ID.' },
      ]);
    }

    const diagnostics: SpriteAnimationTemplateDiagnostic[] = [];
    const imageSizes: Record<string, { width: number; height: number }> = Object.create(null);
    const texturesById: Record<string, Texture> = Object.create(null);
    const declared = new Set<string>();
    for (let index = 0; index < template.imageParameters.length; index++) {
      declared.add(template.imageParameters[index].id);
    }

    const keys = Object.keys(images);
    for (let index = 0; index < keys.length; index++) {
      const id = keys[index];
      if (!declared.has(id)) continue;
      const texture = images[id];
      if (
        texture === null ||
        texture === undefined ||
        typeof texture !== 'object' ||
        texture.isLoaded !== true ||
        !isPositiveInteger(texture.width) ||
        !isPositiveInteger(texture.height)
      ) {
        diagnostics.push({
          path: `/images/${escapePointer(id)}`,
          code: 'binding.texture',
          message: `Image parameter "${id}" must be a loaded texture with positive integer dimensions.`,
        });
        imageSizes[id] = { width: 0, height: 0 };
        continue;
      }
      texturesById[id] = texture;
      imageSizes[id] = { width: texture.width, height: texture.height };
    }

    const bindingCheck = validateSpriteAnimationTemplateBinding(
      spriteAnimationTemplateSource(template),
      imageSizesWithUnknownKeys(images, imageSizes),
    );
    if (!bindingCheck.ok) diagnostics.push(...bindingCheck.diagnostics);

    const boundIds = Object.keys(texturesById);
    if (boundIds.length > 1) {
      const first = texturesById[boundIds[0]] as Texture & { _belongsToSameGame?: (other: Texture) => boolean };
      for (let index = 1; index < boundIds.length; index++) {
        const next = texturesById[boundIds[index]];
        if (typeof first._belongsToSameGame !== 'function' || !first._belongsToSameGame(next)) {
          diagnostics.push({
            path: `/images/${escapePointer(boundIds[index])}`,
            code: 'binding.game',
            message: 'All textures in one animation binding must belong to the same Game.',
          });
        }
      }
    }

    if (diagnostics.length > 0) return bindingFailure(diagnostics);

    const sheets: SpriteSheet[] = [];
    const boundTextures: Texture[] = [];
    const framesByKey = new Map<string, SpriteFrame>();
    for (let parameterIndex = 0; parameterIndex < template.imageParameters.length; parameterIndex++) {
      const parameter = template.imageParameters[parameterIndex];
      const texture = texturesById[parameter.id];
      if (texture === undefined) continue;
      boundTextures.push(texture);
      const definitions: { name: string; source: Rect }[] = [];
      for (let clipIndex = 0; clipIndex < template.clips.length; clipIndex++) {
        const frameLists = clipFrameLists(template.clips[clipIndex]);
        for (let listIndex = 0; listIndex < frameLists.length; listIndex++) {
          const frames = frameLists[listIndex].frames;
          for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
            const frame = frames[frameIndex];
            for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex++) {
              const layer = frame.layers[layerIndex];
              if (layer.parameter !== parameter.id) continue;
              const name = layerFrameName(clipIndex, listIndex, frameIndex, layerIndex);
              definitions.push({ name, source: layer.source });
            }
          }
        }
      }
      if (definitions.length === 0) continue;
      const sheet = new SpriteSheet(texture, { frames: definitions });
      if (sheet.error !== null) {
        return bindingFailure([
          { path: `/images/${escapePointer(parameter.id)}`, code: 'binding.sheet', message: sheet.error },
        ]);
      }
      sheets.push(sheet);
      for (let clipIndex = 0; clipIndex < template.clips.length; clipIndex++) {
        const frameLists = clipFrameLists(template.clips[clipIndex]);
        for (let listIndex = 0; listIndex < frameLists.length; listIndex++) {
          const frameList = frameLists[listIndex];
          for (let frameIndex = 0; frameIndex < frameList.frames.length; frameIndex++) {
            const frame = frameList.frames[frameIndex];
            for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex++) {
              const layer = frame.layers[layerIndex];
              if (layer.parameter !== parameter.id) continue;
              const frameObject = sheet.getFrame(layerFrameName(clipIndex, listIndex, frameIndex, layerIndex));
              if (frameObject === null) {
                const listPath = frameList.direction === null ? 'frames' : `directions/${frameList.direction}`;
                return bindingFailure([
                  {
                    path: `/clips/${clipIndex}/${listPath}/${frameIndex}/layers/${layerIndex}`,
                    code: 'binding.frame',
                    message: 'Could not construct a SpriteFrame for the bound animation layer.',
                  },
                ]);
              }
              framesByKey.set(layerFrameKey(clipIndex, listIndex, frameIndex, layerIndex), frameObject);
            }
          }
        }
      }
    }

    const clips: Record<string, SpriteAnimationTemplateBoundClip> = Object.create(null);
    for (let clipIndex = 0; clipIndex < template.clips.length; clipIndex++) {
      const clip = template.clips[clipIndex];
      const frameLists = clipFrameLists(clip);
      const boundLists: SpriteAnimationTemplateBoundFrame[][] = [];
      for (let listIndex = 0; listIndex < frameLists.length; listIndex++) {
        const sourceFrames = frameLists[listIndex].frames;
        const frames: SpriteAnimationTemplateBoundFrame[] = [];
        for (let frameIndex = 0; frameIndex < sourceFrames.length; frameIndex++) {
          const frame = sourceFrames[frameIndex];
          const layers: SpriteAnimationTemplateBoundLayer[] = [];
          for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex++) {
            const layer = frame.layers[layerIndex];
            const sprite = framesByKey.get(layerFrameKey(clipIndex, listIndex, frameIndex, layerIndex));
            if (sprite === undefined) continue;
            layers.push({ ...layer, sprite });
          }
          frames.push({
            duration: frame.duration === undefined ? 1 / clip.fps : frame.duration,
            markers: frame.markers === undefined ? [] : frame.markers.slice(),
            layers,
          });
        }
        boundLists.push(frames);
      }
      if (clip.directions === undefined) {
        clips[clip.name] = new SpriteAnimationTemplateBoundClip(clip, boundLists[0], null);
      } else {
        const variants: SpriteAnimationTemplateBoundClip[] = [];
        for (let dir = 0; dir < boundLists.length; dir++) {
          variants.push(new SpriteAnimationTemplateBoundClip(clip, boundLists[dir], null));
        }
        clips[clip.name] = new SpriteAnimationTemplateBoundClip(
          clip,
          boundLists[SPRITE_ANIMATION_DEFAULT_DIR],
          variants,
        );
      }
    }

    return {
      ok: true,
      value: new SpriteAnimationTemplateBoundAnimation(template.id, template.name, clips, sheets, boundTextures),
      diagnostics: [],
    };
  }
}

export interface SpriteAnimationTemplateRendererOptions {
  /** World-space dimensions occupied by the clip canvas. Defaults to the first clip's pixel size. */
  readonly size?: Vector2DLike;
  readonly tint?: Color;
  readonly visible?: boolean;
  readonly renderOrder?: number;
}

interface SelectedTemplateFrame {
  readonly clip: SpriteAnimationTemplateBoundClip;
  readonly frameIndex: number;
}

/** Draws all visible layers in a bound clip. One SpriteAnimator selects the shared frame. */
export class SpriteAnimationTemplateRenderer extends GameComponent implements SpriteAnimationTarget {
  readonly animation: SpriteAnimationTemplateBoundAnimation;
  size: Vector2D;
  tint: Color;
  visible: boolean;
  error: string | null = null;
  private current: SelectedTemplateFrame | null = null;
  private fading: SelectedTemplateFrame | null = null;
  private fadeDuration = 0;
  private fadeElapsed = 0;
  private readonly cullingBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(animation: SpriteAnimationTemplateBoundAnimation, options: SpriteAnimationTemplateRendererOptions = {}) {
    super();
    this.animation = animation;
    const settings = options === null || options === undefined ? {} : options;
    const firstClip = firstBoundClip(animation);
    this.size = new Vector2D(
      firstClip === null ? 0 : firstClip.canvasSize.width,
      firstClip === null ? 0 : firstClip.canvasSize.height,
    );
    this.tint = copyColor(Colors.WHITE);
    this.visible = settings.visible === undefined ? true : settings.visible;
    if (animation === null || animation === undefined) {
      this.error = 'SpriteAnimationTemplateRenderer requires a bound animation template.';
      return;
    }
    if (settings.size !== undefined && !this.setSize(settings.size)) return;
    if (settings.tint !== undefined) {
      if (!validColor(settings.tint)) this.error = 'SpriteAnimationTemplateRenderer tint must be finite.';
      else this.tint = copyColor(settings.tint);
    }
    if (settings.renderOrder !== undefined) {
      if (isFiniteNumber(settings.renderOrder)) this.renderOrder = settings.renderOrder;
      else this.error = 'SpriteAnimationTemplateRenderer renderOrder must be finite.';
    }
  }

  setSize(size: Vector2DLike): boolean {
    if (
      size === null ||
      size === undefined ||
      !isFiniteNumber(size.x) ||
      !isFiniteNumber(size.y) ||
      size.x < 0 ||
      size.y < 0
    ) {
      this.error = 'SpriteAnimationTemplateRenderer size must be finite and non-negative.';
      return false;
    }
    this.size = Vector2D.from(size);
    if (this.error === 'SpriteAnimationTemplateRenderer size must be finite and non-negative.') this.error = null;
    return true;
  }

  /** @internal Only clips from this bound asset can use this target. */
  _canPlayClip(clip: SpriteAnimationPlaybackClip): boolean {
    if (!(clip instanceof SpriteAnimationTemplateBoundClip)) return false;
    if (clip.error !== null || clip.frames.length === 0) return false;
    const owned = this.animation.getClip(clip.name);
    if (owned === null) return false;
    if (owned === clip) return true;
    return owned.directions !== null && owned.directions.indexOf(clip) >= 0;
  }

  /** @internal Starts a template clip on the shared timeline and optionally crossfades the composite. */
  _startClipFrame(clip: SpriteAnimationPlaybackClip, frameIndex: number, fade: number): boolean {
    if (!this._canPlayClip(clip) || !validFrameIndex(clip, frameIndex) || !isFiniteNumber(fade) || fade < 0) {
      this.error = 'SpriteAnimationTemplateRenderer cannot select the requested clip frame.';
      return false;
    }
    this.fading = fade > 0 && this.current !== null ? this.current : null;
    this.fadeDuration = this.fading === null ? 0 : fade;
    this.fadeElapsed = 0;
    this.current = { clip: clip as SpriteAnimationTemplateBoundClip, frameIndex };
    this.error = null;
    return true;
  }

  /** @internal Changes the synchronized frame without interrupting a crossfade. */
  _selectClipFrame(clip: SpriteAnimationPlaybackClip, frameIndex: number, cancelCrossfade = false): boolean {
    if (!this._canPlayClip(clip) || !validFrameIndex(clip, frameIndex)) {
      this.error = 'SpriteAnimationTemplateRenderer cannot select the requested clip frame.';
      return false;
    }
    if (cancelCrossfade) {
      this.fading = null;
      this.fadeDuration = 0;
      this.fadeElapsed = 0;
    }
    this.current = { clip: clip as SpriteAnimationTemplateBoundClip, frameIndex };
    this.error = null;
    return true;
  }

  _advanceCrossfade(deltaTime: number): void {
    if (this.fading === null || !isFiniteNumber(deltaTime) || deltaTime <= 0) return;
    this.fadeElapsed += deltaTime;
    if (this.fadeElapsed >= this.fadeDuration) {
      this.fading = null;
      this.fadeDuration = 0;
      this.fadeElapsed = 0;
    }
  }

  _canAttachTo(context: GameContext): boolean {
    return this.error === null && this.animation._canAttachTo(context);
  }

  _canAttachClipTo(clip: SpriteAnimationPlaybackClip, context: GameContext): boolean {
    if (!this._canPlayClip(clip)) return false;
    const boundClip = clip as SpriteAnimationTemplateBoundClip;
    for (let frameIndex = 0; frameIndex < boundClip.frames.length; frameIndex++) {
      const layers = boundClip.frames[frameIndex].layers;
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        if (!layers[layerIndex].sprite.sheet._canAttachTo(context)) return false;
      }
    }
    return true;
  }

  render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (
      !this.visible ||
      this.error !== null ||
      this.current === null ||
      owner === null ||
      owner.scene === null ||
      !this.isActiveAndEnabled ||
      !this.animation._canAttachTo(owner.scene.context) ||
      !isFiniteNumber(this.size.x) ||
      !isFiniteNumber(this.size.y) ||
      this.size.x <= 0 ||
      this.size.y <= 0 ||
      !validColor(this.tint)
    )
      return;
    if (this.fading !== null && this.fadeDuration > 0) {
      const progress = Math.max(0, Math.min(1, this.fadeElapsed / this.fadeDuration));
      this.drawSelected(renderer, this.fading, 1 - progress);
      this.drawSelected(renderer, this.current, progress);
    } else {
      this.drawSelected(renderer, this.current, 1);
    }
  }

  private drawSelected(renderer: Renderer, selected: SelectedTemplateFrame, opacity: number): void {
    const owner = this.gameObject;
    if (owner === null || owner.scene === null) return;
    const clip = selected.clip;
    const frame = clip.frames[selected.frameIndex];
    if (frame === undefined) return;
    const transform = owner.transform;
    const worldPosition = transform.worldPosition;
    const parallax = getParallaxOffset(owner, renderer.activeCamera2D);
    const worldScale = transform.worldScale;
    const worldRotation = rotationZDegrees(transform.worldRotation);
    const radians = (worldRotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const canvasScaleX = this.size.x / clip.canvasSize.width;
    const canvasScaleY = this.size.y / clip.canvasSize.height;

    for (let layerIndex = 0; layerIndex < frame.layers.length; layerIndex++) {
      const layer = frame.layers[layerIndex];
      if (!layer.visible || !layer.sprite.sheet._canAttachTo(owner.scene.context)) continue;
      const localOffsetX = layer.transform.offset.x * canvasScaleX * worldScale.x;
      const localOffsetY = layer.transform.offset.y * canvasScaleY * worldScale.y;
      const anchorX = worldPosition.x + parallax.x + localOffsetX * cosine - localOffsetY * sine;
      const anchorY = worldPosition.y + parallax.y + localOffsetX * sine + localOffsetY * cosine;
      const signedScaleX = canvasScaleX * worldScale.x * layer.transform.stretch.x * layer.transform.zoom;
      const signedScaleY = canvasScaleY * worldScale.y * layer.transform.stretch.y * layer.transform.zoom;
      if (!isFiniteNumber(signedScaleX) || !isFiniteNumber(signedScaleY) || signedScaleX === 0 || signedScaleY === 0)
        continue;
      const flipX = signedScaleX < 0;
      const flipY = signedScaleY < 0;
      const source: Rect = {
        x: layer.sprite.source.x + (flipX ? layer.sprite.source.width : 0),
        y: layer.sprite.source.y + (flipY ? layer.sprite.source.height : 0),
        width: flipX ? -layer.sprite.source.width : layer.sprite.source.width,
        height: flipY ? -layer.sprite.source.height : layer.sprite.source.height,
      };
      const destinationWidth = layer.sprite.source.width * Math.abs(signedScaleX);
      const destinationHeight = layer.sprite.source.height * Math.abs(signedScaleY);
      const pivot = layer.transform.pivot;
      const origin = {
        x: (flipX ? 1 - pivot.x : pivot.x) * destinationWidth,
        y: (flipY ? 1 - pivot.y : pivot.y) * destinationHeight,
      };
      const destination: Rect = {
        x: anchorX - origin.x,
        y: anchorY - origin.y,
        width: destinationWidth,
        height: destinationHeight,
      };
      const rotation = worldRotation + layer.transform.rotation;
      updateRotatedBounds(destination, origin, rotation, this.cullingBounds);
      const visibleInCamera = renderer.isRectVisibleIn2D(this.cullingBounds);
      if (!visibleInCamera) {
        renderer._recordSpriteCulled();
        continue;
      }
      const tint = copyColor(this.tint);
      tint.a *= opacity;
      const didDraw = layer.sprite.sheet.texture.drawRegion(source, destination, origin, rotation, tint);
      if (didDraw) {
        renderer._recordSpriteDrawn();
      }
    }
  }
}

function bindingFailure(
  diagnostics: readonly SpriteAnimationTemplateDiagnostic[],
): SpriteAnimationTemplateBindingFailure {
  return { ok: false, value: null, diagnostics };
}

function imageSizesWithUnknownKeys(
  images: Readonly<Record<string, Texture>>,
  validSizes: Readonly<Record<string, { width: number; height: number }>>,
): Record<string, { width: number; height: number }> {
  const result: Record<string, { width: number; height: number }> = Object.create(null);
  const keys = Object.keys(images);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    result[key] = validSizes[key] === undefined ? { width: 0, height: 0 } : validSizes[key];
  }
  return result;
}

function layerFrameName(clipIndex: number, listIndex: number, frameIndex: number, layerIndex: number): string {
  return `template:${clipIndex}:${listIndex}:${frameIndex}:${layerIndex}`;
}

function layerFrameKey(clipIndex: number, listIndex: number, frameIndex: number, layerIndex: number): string {
  return `${clipIndex}:${listIndex}:${frameIndex}:${layerIndex}`;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validFrameIndex(clip: SpriteAnimationPlaybackClip, frameIndex: number): boolean {
  return Number.isInteger(frameIndex) && frameIndex >= 0 && frameIndex < clip.frames.length;
}

function copyColor(value: Color): Color {
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

function validColor(value: Color): boolean {
  return (
    value !== null &&
    value !== undefined &&
    isFiniteNumber(value.r) &&
    isFiniteNumber(value.g) &&
    isFiniteNumber(value.b) &&
    isFiniteNumber(value.a)
  );
}

function firstBoundClip(animation: SpriteAnimationTemplateBoundAnimation): SpriteAnimationTemplateBoundClip | null {
  for (const key of Object.keys(animation.clips)) return animation.clips[key];
  return null;
}

function rotationZDegrees(rotation: { x: number; y: number; z: number; w: number }): number {
  const sin = 2 * (rotation.w * rotation.z + rotation.x * rotation.y);
  const cos = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return (Math.atan2(sin, cos) * 180) / Math.PI;
}

function updateRotatedBounds(destination: Rect, origin: Vector2DLike, rotation: number, bounds: Rect): void {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const pivotX = destination.x + origin.x;
  const pivotY = destination.y + origin.y;
  const centerX = pivotX + (destination.width * 0.5 - origin.x) * cosine - (destination.height * 0.5 - origin.y) * sine;
  const centerY = pivotY + (destination.width * 0.5 - origin.x) * sine + (destination.height * 0.5 - origin.y) * cosine;
  const halfWidth = (Math.abs(cosine) * destination.width + Math.abs(sine) * destination.height) * 0.5;
  const halfHeight = (Math.abs(sine) * destination.width + Math.abs(cosine) * destination.height) * 0.5;
  bounds.x = centerX - halfWidth;
  bounds.y = centerY - halfHeight;
  bounds.width = halfWidth * 2;
  bounds.height = halfHeight * 2;
}

function freezeValue<T>(input: T): T {
  if (input === null || typeof input !== 'object' || Object.isFrozen(input)) return input;
  for (const key of Object.keys(input as object)) freezeValue((input as Record<string, unknown>)[key]);
  return Object.freeze(input);
}
