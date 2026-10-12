import { GameContext, getGameContext } from './context';
import type { ContextResource } from './context';
import type { Game } from './game';
import { Colors } from './colors';
import type { Texture } from '../textures/texture';
import type { RenderTexture } from '../textures/render-texture';
import type { Font } from '../text/font';
import type { Model, Mesh } from '../models/model';
import type { Material } from '../models/material';
import * as native from './internal';
import {
  drawBezier,
  drawCircle,
  drawCircleLines,
  drawLine,
  drawPoly,
  drawRect,
  drawRectLines,
  drawTriangle,
} from '../shapes/internal';
import { drawText as drawPlainText, measureText as measurePlainText } from '../text/internal';
import {
  drawCube,
  drawCubeWires,
  drawCylinder,
  drawGrid,
  drawPlane,
  drawRay,
  drawSphere,
  drawSphereWires,
} from '../models/internal';
import type { Camera2D, Camera3D, Color, Rect, Vector2DLike, Vec3 } from './types';
import { getCamera2DWorldBounds, isRectIntersecting } from './camera2d-culling';
import type { Viewport2D } from '../camera2d/viewport-2d';
export { getCamera2DWorldBounds };

/** Render workload measured for the most recent scene render. */
export interface RendererStats {
  /** Frames per second estimated from consecutive scene renders. */
  fps: number;
  /** Milliseconds between consecutive scene renders. */
  frameIntervalMs: number;
  /**
   * Backend-defined 2D submissions: texture/uniform batches on WGPU and
   * drawable Canvas commands on watchOS.
   */
  drawSubmissions2D: number;
  /** Sprite quads submitted by SpriteRenderer and Tilemap components in the scene render. */
  spritesDrawn: number;
  /** Sprite quads skipped because their bounds fell outside the active 2D camera. */
  spritesCulled: number;
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isValidCamera2D(camera: Camera2D): boolean {
  return (
    camera !== null &&
    camera !== undefined &&
    camera.offset !== null &&
    camera.offset !== undefined &&
    camera.target !== null &&
    camera.target !== undefined &&
    isFiniteNumber(camera.offset.x) &&
    isFiniteNumber(camera.offset.y) &&
    isFiniteNumber(camera.target.x) &&
    isFiniteNumber(camera.target.y) &&
    isFiniteNumber(camera.rotation) &&
    isFiniteNumber(camera.zoom) &&
    camera.zoom > 0
  );
}

/** Context-owned source of instance data that can draw a model mesh with a material. */
export interface InstancedDrawSource extends ContextResource {
  readonly isLoaded: boolean;
  drawNative(material: Material, model: Model | Mesh, meshIndex: number): boolean;
}

type RenderMode = 'none' | '2d' | '3d';

/** Game-owned draw commands, render passes, post-processing, and profiling. */
export class Renderer {
  private mode: RenderMode = 'none';
  private disposed = false;
  private activeRenderTexture: RenderTexture | null = null;
  private activeCameraBounds: Rect | null = null;
  private activeCameraValue: Camera2D | null = null;
  private frameIntervalMsValue = 0;
  private spritesDrawnValue = 0;
  private spritesCulledValue = 0;

  private readonly context: GameContext;

  /** Creates the renderer for a Game. */
  constructor(owner: Game) {
    this.context = getGameContext(owner);
    this.context.setDrawHandler((resource, position, tint) =>
      this.drawTexture(resource as Texture | RenderTexture, position, tint),
    );
    this.context.setRenderTargetHandler((resource, action) => {
      const target = resource as RenderTexture;
      return action === 'begin' ? this.beginRenderTexture(target) : this.endRenderTexture(target);
    });
  }

  /** True while the renderer can accept draw commands. */
  get isReady(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed;
  }

  /** Snapshot of the camera applied to the current 2D render pass. */
  get activeCamera2D(): Camera2D | null {
    const camera = this.activeCameraValue;
    return camera === null
      ? null
      : {
          offset: { x: camera.offset.x, y: camera.offset.y },
          target: { x: camera.target.x, y: camera.target.y },
          rotation: camera.rotation,
          zoom: camera.zoom,
        };
  }

  /** Snapshot of the current game frame's render workload. */
  get stats(): RendererStats {
    const fps = this.frameIntervalMsValue > 0 ? 1000 / this.frameIntervalMsValue : 0;
    return {
      fps,
      frameIntervalMs: this.frameIntervalMsValue,
      drawSubmissions2D: this.isReady ? native.get2DDrawCalls() : 0,
      spritesDrawn: this.spritesDrawnValue,
      spritesCulled: this.spritesCulledValue,
    };
  }

  /** @internal Starts a new game-frame statistics sample. */
  _beginFrame(deltaTime: number): void {
    const frameIntervalMs = deltaTime * 1000;
    this.frameIntervalMsValue =
      isFiniteNumber(deltaTime) && deltaTime > 0 && isFiniteNumber(frameIntervalMs) ? frameIntervalMs : 0;
    this.spritesDrawnValue = 0;
    this.spritesCulledValue = 0;
    this.activeCameraBounds = null;
    this.activeCameraValue = null;
  }

  /** @internal Resets scene workload before rendering components. */
  _beginSceneRender(): void {
    this.spritesDrawnValue = 0;
    this.spritesCulledValue = 0;
    this.activeCameraBounds = null;
    this.activeCameraValue = null;
  }

  /** Tests an axis-aligned world-space rectangle against the active camera view. */
  isRectVisibleIn2D(bounds: Rect): boolean {
    return this.activeCameraBounds === null || isRectIntersecting(bounds, this.activeCameraBounds);
  }

  /** @internal Counts a SpriteRenderer quad after successful submission. */
  _recordSpriteDrawn(): void {
    this.spritesDrawnValue++;
  }

  /** @internal Counts a SpriteRenderer quad rejected by camera culling. */
  _recordSpriteCulled(count = 1): void {
    this.spritesCulledValue += count;
  }

  /** Fills the screen with a color. */
  clear(color: Color): boolean {
    if (!this.isReady) return false;
    native.clearBackground(color);
    return true;
  }

  /** Starts 2D drawing through a camera, optionally mapped into a viewport. Returns false if a 2D, 3D, or render texture pass is already active or the camera is invalid. */
  begin2D(camera: Camera2D, viewport?: Viewport2D | null): boolean {
    if (!this.isReady || this.mode !== 'none' || this.activeRenderTexture !== null || !isValidCamera2D(camera))
      return false;
    if (viewport !== undefined && viewport !== null) {
      const transform = viewport._renderTransform(native.getScreenWidth(), native.getScreenHeight());
      if (transform === null) return false;
      native.beginMode2DViewport(
        camera,
        transform.scaleX,
        transform.scaleY,
        transform.offsetX,
        transform.offsetY,
        viewport._clipRect(transform),
      );
      this.activeCameraBounds = getCamera2DWorldBounds(camera, transform.logicalWidth, transform.logicalHeight);
    } else {
      native.beginMode2D(camera);
      this.activeCameraBounds = getCamera2DWorldBounds(camera, native.getScreenWidth(), native.getScreenHeight());
    }
    this.mode = '2d';
    this.activeCameraValue = {
      offset: { x: camera.offset.x, y: camera.offset.y },
      target: { x: camera.target.x, y: camera.target.y },
      rotation: camera.rotation,
      zoom: camera.zoom,
    };
    return true;
  }

  /** Ends the current 2D pass. Returns false if no 2D pass is active. */
  end2D(): boolean {
    if (!this.isReady || this.mode !== '2d') return false;
    native.endMode2D();
    this.mode = 'none';
    this.activeCameraBounds = null;
    this.activeCameraValue = null;
    return true;
  }

  /** Starts 3D drawing through a camera. Returns false if a 2D, 3D, or render texture pass is already active. */
  begin3D(camera: Camera3D): boolean {
    if (!this.isReady || this.mode !== 'none' || this.activeRenderTexture !== null) return false;
    native.beginMode3D(camera);
    this.mode = '3d';
    return true;
  }

  /** Ends the current 3D pass. Returns false if no 3D pass is active. */
  end3D(): boolean {
    if (!this.isReady || this.mode !== '3d') return false;
    native.endMode3D();
    this.mode = 'none';
    this.activeCameraBounds = null;
    this.activeCameraValue = null;
    return true;
  }

  /** Draws a line between two points. */
  drawLine(start: Vector2DLike, end: Vector2DLike, color: Color, thickness = 1): boolean {
    if (!this.isReady) return false;
    drawLine(start.x, start.y, end.x, end.y, thickness, color);
    return true;
  }

  /** Draws a filled rectangle. */
  drawRectangle(bounds: Rect, color: Color): boolean {
    if (!this.isReady) return false;
    drawRect(bounds.x, bounds.y, bounds.width, bounds.height, color);
    return true;
  }

  /** Draws a rectangle outline. */
  drawRectangleOutline(bounds: Rect, color: Color, thickness = 1): boolean {
    if (!this.isReady) return false;
    drawRectLines(bounds.x, bounds.y, bounds.width, bounds.height, thickness, color);
    return true;
  }

  /** Draws a filled circle. */
  drawCircle(center: Vector2DLike, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawCircle(center.x, center.y, radius, color);
    return true;
  }

  /** Draws a circle outline. */
  drawCircleOutline(center: Vector2DLike, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawCircleLines(center.x, center.y, radius, color);
    return true;
  }

  /** Draws a filled triangle. */
  drawTriangle(a: Vector2DLike, b: Vector2DLike, c: Vector2DLike, color: Color): boolean {
    if (!this.isReady) return false;
    drawTriangle(a.x, a.y, b.x, b.y, c.x, c.y, color);
    return true;
  }

  /** Draws a filled regular polygon with the given number of sides, optionally rotated. */
  drawPolygon(center: Vector2DLike, sides: number, radius: number, color: Color, rotation = 0): boolean {
    if (!this.isReady) return false;
    drawPoly(center.x, center.y, sides, radius, rotation, color);
    return true;
  }

  /** Draws a cubic Bezier curve through two control points. */
  drawBezier(
    start: Vector2DLike,
    control1: Vector2DLike,
    control2: Vector2DLike,
    end: Vector2DLike,
    color: Color,
    thickness = 1,
  ): boolean {
    if (!this.isReady) return false;
    drawBezier(start.x, start.y, control1.x, control1.y, control2.x, control2.y, end.x, end.y, thickness, color);
    return true;
  }

  /** Draws text with the default font, or with `font` when given. Returns false if the font is not loaded or not owned by this Game. */
  drawText(text: string, position: Vector2DLike, size: number, color: Color, font?: Font, spacing = 0): boolean {
    if (!this.isReady) return false;
    if (font !== undefined) {
      if (!this.context.owns(font) || !font.isLoaded) return false;
      return font.drawNative(text, position, size, spacing, color);
    }
    drawPlainText(text, position.x, position.y, size, color);
    return true;
  }

  /** Returns the width of the text at the given size, using `font` when given. Returns 0 if the renderer is not ready or the font is unusable. */
  measureText(text: string, size: number, font?: Font, spacing = 0): number {
    if (!this.isReady) return 0;
    if (font === undefined) return measurePlainText(text, size);
    if (!this.context.owns(font) || !font.isLoaded) return 0;
    return font.measureText(text, size, spacing).x;
  }

  /** Draws a loaded texture or render texture at a position, multiplied by a tint that defaults to white. */
  drawTexture(texture: Texture | RenderTexture, position: Vector2DLike, tint: Color = Colors.WHITE): boolean {
    if (!this.isReady || !this.context.owns(texture) || !texture.isLoaded) return false;
    return texture.drawNative(position, tint);
  }

  /** Draws a loaded model or mesh at a position with a uniform scale, tint, and optional rotation around the Y axis. */
  drawModel(model: Model | Mesh, position: Vec3, scale = 1, tint: Color = Colors.WHITE, rotationY?: number): boolean {
    if (!this.isReady || !this.context.owns(model) || !model.isLoaded) return false;
    return model.drawNative(position, scale, tint, rotationY);
  }

  /** Draws a loaded model or mesh using a 16-element matrix. Returns false if the matrix length is not 16. */
  drawModelTransform(model: Model | Mesh, transform: number[], tint: Color = Colors.WHITE): boolean {
    if (!this.isReady || !this.context.owns(model) || !model.isLoaded || transform.length !== 16) return false;
    return model.drawTransformNative(transform, tint);
  }

  /** Draws a model or mesh with a material override, optionally limited to one mesh. */
  drawMaterial(
    material: Material,
    model: Model | Mesh,
    position: Vec3,
    scale = 1,
    tint: Color = Colors.WHITE,
    meshIndex?: number,
  ): boolean {
    if (
      !this.isReady ||
      !this.context.owns(material) ||
      !material.isLoaded ||
      !this.context.owns(model) ||
      !model.isLoaded
    )
      return false;
    return material.drawNative(model, position, scale, tint, meshIndex);
  }

  /** Draws many instances of a model mesh with a material, taking per-instance data from `source`. */
  drawInstanced(material: Material, model: Model | Mesh, source: InstancedDrawSource, meshIndex = 0): boolean {
    if (
      !this.isReady ||
      !this.context.owns(material) ||
      !material.isLoaded ||
      !this.context.owns(model) ||
      !model.isLoaded ||
      !this.context.owns(source) ||
      !source.isLoaded
    )
      return false;
    return source.drawNative(material, model, meshIndex);
  }

  /** Redirects drawing into a render texture. Returns false if another pass or render texture is active. */
  beginRenderTexture(target: RenderTexture): boolean {
    if (
      !this.isReady ||
      this.mode !== 'none' ||
      this.activeRenderTexture !== null ||
      !this.context.owns(target) ||
      !target.isLoaded
    )
      return false;
    if (!target.beginNative()) return false;
    this.activeRenderTexture = target;
    return true;
  }

  /** Stops drawing into the active render texture. Returns false if none is active or it differs from `target`. */
  endRenderTexture(target?: RenderTexture): boolean {
    if (!this.isReady || this.activeRenderTexture === null) return false;
    if (target !== undefined && target !== this.activeRenderTexture) return false;
    this.activeRenderTexture.endNative();
    this.activeRenderTexture = null;
    return true;
  }

  /** Draws a solid cube. */
  drawCube(position: Vec3, size: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawCube(position, size.x, size.y, size.z, color);
    return true;
  }

  /** Draws a cube as wireframe. */
  drawCubeOutline(position: Vec3, size: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawCubeWires(position, size.x, size.y, size.z, color);
    return true;
  }

  /** Draws a solid sphere. */
  drawSphere(position: Vec3, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawSphere(position, radius, color);
    return true;
  }

  /** Draws a sphere as wireframe. */
  drawSphereOutline(position: Vec3, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawSphereWires(position, radius, color);
    return true;
  }

  /** Draws a cylinder or cone with separate top and bottom radii, optionally with a custom slice count. */
  drawCylinder(
    position: Vec3,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    color: Color,
    slices?: number,
  ): boolean {
    if (!this.isReady) return false;
    drawCylinder(position, radiusTop, radiusBottom, height, color, slices);
    return true;
  }

  /** Draws a flat plane. */
  drawPlane(position: Vec3, width: number, depth: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawPlane(position, width, depth, color);
    return true;
  }

  /** Draws a reference grid with the given number of slices and spacing. */
  drawGrid(slices: number, spacing: number): boolean {
    if (!this.isReady) return false;
    drawGrid(slices, spacing);
    return true;
  }

  /** Draws a ray from an origin along a direction. */
  drawRay(origin: Vec3, direction: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawRay(origin, direction, color);
    return true;
  }

  /** Requests a screenshot saved to the given file path when the current frame ends. */
  screenshot(path: string): boolean {
    if (!this.isReady) return false;
    native.takeScreenshot(path);
    return true;
  }

  /** Sets the background color from the average color of an HDR environment map file. */
  setEnvironmentFromHdr(path: string): boolean {
    if (!this.isReady) return false;
    native.setEnvClearFromHdr(path);
    return true;
  }
  /** Enables height-based exponential fog. A density of 0 turns it off. */
  setFog(color: Color, density: number, heightReference: number, heightFalloff: number): boolean {
    if (!this.isReady) return false;
    native.setFog(color.r / 255, color.g / 255, color.b / 255, density, heightReference, heightFalloff);
    return true;
  }
  /** Sets the radial color-channel split at the screen edges. 0 turns it off. */
  setChromaticAberration(strength: number): boolean {
    if (!this.isReady) return false;
    native.setChromaticAberration(strength);
    return true;
  }
  /** Darkens the screen corners. Both `strength` and `softness` range from 0 to 1. */
  setVignette(strength: number, softness: number): boolean {
    if (!this.isReady) return false;
    native.setVignette(strength, softness);
    return true;
  }
  /** Sets the animated film grain strength. 0 turns it off. */
  setFilmGrain(strength: number): boolean {
    if (!this.isReady) return false;
    native.setFilmGrain(strength);
    return true;
  }
  /** Sets the composite sharpening strength. The engine default is 0.8 and 0 disables it. */
  setSharpenStrength(strength: number): boolean {
    if (!this.isReady) return false;
    native.setSharpenStrength(strength);
    return true;
  }
  /** Enables screen-space sun shafts with the given strength, decay, and color. A strength of 0 turns them off. */
  setSunShafts(strength: number, decay: number, color: Color): boolean {
    if (!this.isReady) return false;
    native.setSunShafts(strength, decay, color.r / 255, color.g / 255, color.b / 255);
    return true;
  }
  /** Enables or disables automatic exposure. */
  setAutoExposure(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setAutoExposure(enabled);
    return true;
  }
  /** Enables or disables skipping of scene nodes hidden behind other geometry. Enabled by default. */
  setOcclusionCulling(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setOcclusionCulling(enabled);
    return true;
  }
  /** Enables or disables temporal anti-aliasing. */
  setTaaEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setTaaEnabled(enabled);
    return true;
  }
  /** Sets the 3D render resolution multiplier. Values below 1 render fewer pixels and upscale them. */
  setRenderScale(scale: number): boolean {
    if (!this.isReady) return false;
    native.setRenderScale(scale);
    return true;
  }
  /** Sets the output resolution multiplier, where 1 is native. Lowering it reduces the cost of the final upscale and composite. */
  setOutputScale(scale: number): boolean {
    if (!this.isReady) return false;
    native.setOutputScale(scale);
    return true;
  }
  /** Returns the render resolution multiplier, or 0 if the renderer is not ready. */
  getRenderScale(): number {
    return this.isReady ? native.getRenderScale() : 0;
  }
  /** Returns the output resolution multiplier, or 0 if the renderer is not ready. */
  getOutputScale(): number {
    return this.isReady ? native.getOutputScale() : 0;
  }
  /** Selects the filter used to upscale when the render scale is below 1 and TAA is off. */
  setUpscaleMode(mode: native.UpscaleMode): boolean {
    if (!this.isReady) return false;
    native.setUpscaleMode(mode);
    return true;
  }
  /** Sets the contrast-adaptive sharpening strength. 0 turns it off and 1 is the maximum. */
  setCasStrength(strength: number): boolean {
    if (!this.isReady) return false;
    native.setCasStrength(strength);
    return true;
  }
  /** Enables or disables dynamic resolution, which adjusts the render scale to hold the target refresh rate. */
  setAutoResolution(targetHz: number, enabled = true): boolean {
    if (!this.isReady) return false;
    native.setAutoResolution(targetHz, enabled);
    return true;
  }
  /** Sets the exposure multiplier used when auto exposure is off. 1 is the default. */
  setManualExposure(value: number): boolean {
    if (!this.isReady) return false;
    native.setManualExposure(value);
    return true;
  }
  /** Sets the brightness multiplier of the environment map lighting and sky. 1 is the reference level. */
  setEnvironmentIntensity(intensity: number): boolean {
    if (!this.isReady) return false;
    native.setEnvIntensity(intensity);
    return true;
  }
  /** Enables or disables screen-space global illumination. */
  setSsgiEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setSsgiEnabled(enabled);
    return true;
  }
  /** Sets the path tracing mode: 0 is off, 1 is progressive, and 2 is realtime. Has no effect on devices without support. */
  setPathTracing(mode: number): boolean {
    if (!this.isReady) return false;
    native.setPathTracing(mode);
    return true;
  }
  /** Returns whether the device supports hardware path tracing. */
  isPathTracingSupported(): boolean {
    return this.isReady && native.isPathTracingSupported();
  }
  /** Sets the screen-space global illumination strength. 0 turns it off. */
  setSsgiIntensity(intensity: number): boolean {
    if (!this.isReady) return false;
    native.setSsgiIntensity(intensity);
    return true;
  }
  /** Sets the maximum distance screen-space global illumination searches for light, in meters. */
  setSsgiRadius(radius: number): boolean {
    if (!this.isReady) return false;
    native.setSsgiRadius(radius);
    return true;
  }
  /** Sets depth of field from the focus distance in world units and the blur strength. An aperture of 0 turns it off. */
  setDepthOfField(focusDistance: number, aperture: number): boolean {
    if (!this.isReady) return false;
    native.setDepthOfField(focusDistance, aperture);
    return true;
  }
  /** Applies a quality preset. Call individual setters afterward to fine-tune. */
  setQualityPreset(preset: native.QualityPreset): boolean {
    if (!this.isReady) return false;
    native.setQualityPreset(preset);
    return true;
  }
  /** Enables or disables cascaded shadow maps. */
  setShadowsEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setShadowsEnabled(enabled);
    return true;
  }
  /** Forces shadow maps to re-render every frame instead of reusing cached static casters. */
  setShadowsAlwaysFresh(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setShadowsAlwaysFresh(enabled);
    return true;
  }
  /** Enables or disables bloom. */
  setBloomEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setBloomEnabled(enabled);
    return true;
  }
  /** Sets the bloom strength. 0 adds no glow. */
  setBloomIntensity(intensity: number): boolean {
    if (!this.isReady) return false;
    native.setBloomIntensity(intensity);
    return true;
  }
  /** Selects the tonemap operator. */
  setTonemap(kind: native.Tonemap): boolean {
    if (!this.isReady) return false;
    native.setTonemap(kind);
    return true;
  }
  /** Sets the scene brightness target for auto exposure. Lower values give a darker image. */
  setAutoExposureKey(key: number): boolean {
    if (!this.isReady) return false;
    native.setAutoExposureKey(key);
    return true;
  }
  /** Sets how quickly auto exposure adapts per frame, from 0 (frozen) to 1 (instant). */
  setAutoExposureRate(rate: number): boolean {
    if (!this.isReady) return false;
    native.setAutoExposureRate(rate);
    return true;
  }
  /** Enables or disables screen-space ambient occlusion. */
  setSsaoEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setSsaoEnabled(enabled);
    return true;
  }
  /** Sets the ambient occlusion strength. 0 removes the darkening and 1 is the default. */
  setSsaoIntensity(intensity: number): boolean {
    if (!this.isReady) return false;
    native.setSsaoIntensity(intensity);
    return true;
  }
  /** Sets the ambient occlusion sampling radius in world units. */
  setSsaoRadius(radius: number): boolean {
    if (!this.isReady) return false;
    native.setSsaoRadius(radius);
    return true;
  }
  /** Replaces all post-process passes with one WGSL fragment shader. Returns false if the shader fails to compile. */
  setPostPass(source: string): boolean {
    return this.isReady && native.setPostPass(source);
  }
  /** Removes the post-process passes. */
  clearPostPass(): boolean {
    if (!this.isReady) return false;
    native.clearPostPass();
    return true;
  }
  /** Appends a WGSL fragment shader as a post-process pass that runs after the existing ones. Returns false if the shader fails to compile. */
  addPostPass(source: string): boolean {
    return this.isReady && native.addPostPass(source) >= 0;
  }
  /** Removes every post-process pass. */
  clearAllPostPasses(): boolean {
    if (!this.isReady) return false;
    native.clearAllPostPasses();
    return true;
  }
  /** Sets the global wind used by foliage materials: a direction on the XZ plane, a displacement amplitude, and a frequency in Hz. */
  setWind(directionX: number, directionZ: number, amplitude: number, frequency: number): boolean {
    if (!this.isReady) return false;
    native.setWind(directionX, directionZ, amplitude, frequency);
    return true;
  }
  /** Sets the cloud deck and the shadows it casts. A strength of 0 turns the shadows off. */
  setCloudShadows(strength: number, deckHeight: number, featureScale: number, driftSpeed: number): boolean {
    if (!this.isReady) return false;
    native.setCloudShadows(strength, deckHeight, featureScale, driftSpeed);
    return true;
  }
  /** Enables or disables screen-space reflections. */
  setSsrEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setSsrEnabled(enabled);
    return true;
  }
  /** Enables or disables per-object motion blur. */
  setMotionBlurEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setMotionBlurEnabled(enabled);
    return true;
  }
  /** Enables or disables subsurface scattering for skin and wax materials. */
  setSssEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setSssEnabled(enabled);
    return true;
  }
  /** Enables or disables the frame profiler. It costs nothing while disabled. */
  setProfilerEnabled(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setProfilerEnabled(enabled);
    return true;
  }
  /** Returns the average CPU frame time over a rolling window, in microseconds. */
  getProfilerCpuTimeUs(): number {
    return this.isReady ? native.getProfilerFrameCpuUs() : 0;
  }
  /** Returns the average GPU frame time over a rolling window, in microseconds. 0 if GPU timing is unavailable. */
  getProfilerGpuTimeUs(): number {
    return this.isReady ? native.getProfilerFrameGpuUs() : 0;
  }
  /** Returns the CPU and GPU time of each profiled phase, in microseconds, for drawing a profiler overlay. */
  getProfilerOverlay(): { label: string; cpuUs: number; gpuUs: number }[] {
    return this.isReady ? native.getProfilerOverlay() : [];
  }
  /** Returns recent per-frame CPU and GPU times in microseconds, oldest first. */
  getProfilerFrameHistory(): { cpuUs: number; gpuUs: number }[] {
    return this.isReady ? native.getProfilerFrameHistory() : [];
  }
  /** Prints a per-phase CPU and GPU timing table to standard output. */
  printProfilerSummary(): boolean {
    if (!this.isReady) return false;
    native.printProfilerSummary();
    return true;
  }
  /** Adds an impulse at a world position that refractive and translucent materials can sample, for effects such as ripples and footprints. */
  splatImpulse(x: number, z: number, radius: number, strength: number): boolean {
    if (!this.isReady) return false;
    native.splatImpulse(x, z, radius, strength);
    return true;
  }

  /** Ends any active pass and releases the renderer. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    if (this.activeRenderTexture !== null) this.endRenderTexture(this.activeRenderTexture);
    if (this.mode === '2d') native.endMode2D();
    if (this.mode === '3d') native.endMode3D();
    this.mode = 'none';
    this.disposed = true;
    this.context.setDrawHandler(null);
    this.context.setRenderTargetHandler(null);
  }
}
