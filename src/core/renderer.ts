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
import { drawBezier, drawCircle, drawCircleLines, drawLine, drawPoly, drawRect, drawRectLines, drawTriangle } from '../shapes/internal';
import { drawText as drawPlainText, measureText as measurePlainText } from '../text/internal';
import {
  drawCube, drawCubeWires, drawCylinder, drawGrid, drawPlane, drawRay,
  drawSphere, drawSphereWires,
} from '../models/internal';
import type { Camera2D, Camera3D, Color, Rect, Vec2, Vec3 } from './types';

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

  private readonly context: GameContext;

  constructor(owner: Game) {
    this.context = getGameContext(owner);
    this.context.setDrawHandler((resource, position, tint) =>
      this.drawTexture(resource as Texture | RenderTexture, position, tint));
    this.context.setRenderTargetHandler((resource, action) => {
      const target = resource as RenderTexture;
      return action === 'begin' ? this.beginRenderTexture(target) : this.endRenderTexture(target);
    });
  }

  get isReady(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed; }

  clear(color: Color): boolean {
    if (!this.isReady) return false;
    native.clearBackground(color);
    return true;
  }

  begin2D(camera: Camera2D): boolean {
    if (!this.isReady || this.mode !== 'none' || this.activeRenderTexture !== null) return false;
    native.beginMode2D(camera);
    this.mode = '2d';
    return true;
  }

  end2D(): boolean {
    if (!this.isReady || this.mode !== '2d') return false;
    native.endMode2D();
    this.mode = 'none';
    return true;
  }

  begin3D(camera: Camera3D): boolean {
    if (!this.isReady || this.mode !== 'none' || this.activeRenderTexture !== null) return false;
    native.beginMode3D(camera);
    this.mode = '3d';
    return true;
  }

  end3D(): boolean {
    if (!this.isReady || this.mode !== '3d') return false;
    native.endMode3D();
    this.mode = 'none';
    return true;
  }

  drawLine(start: Vec2, end: Vec2, color: Color, thickness = 1): boolean {
    if (!this.isReady) return false;
    drawLine(start.x, start.y, end.x, end.y, thickness, color);
    return true;
  }

  drawRectangle(bounds: Rect, color: Color): boolean {
    if (!this.isReady) return false;
    drawRect(bounds.x, bounds.y, bounds.width, bounds.height, color);
    return true;
  }

  drawRectangleOutline(bounds: Rect, color: Color, thickness = 1): boolean {
    if (!this.isReady) return false;
    drawRectLines(bounds.x, bounds.y, bounds.width, bounds.height, thickness, color);
    return true;
  }

  drawCircle(center: Vec2, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawCircle(center.x, center.y, radius, color);
    return true;
  }

  drawCircleOutline(center: Vec2, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawCircleLines(center.x, center.y, radius, color);
    return true;
  }

  drawTriangle(a: Vec2, b: Vec2, c: Vec2, color: Color): boolean {
    if (!this.isReady) return false;
    drawTriangle(a.x, a.y, b.x, b.y, c.x, c.y, color);
    return true;
  }

  drawPolygon(center: Vec2, sides: number, radius: number, color: Color, rotation = 0): boolean {
    if (!this.isReady) return false;
    drawPoly(center.x, center.y, sides, radius, rotation, color);
    return true;
  }

  drawBezier(start: Vec2, control1: Vec2, control2: Vec2, end: Vec2, color: Color, thickness = 1): boolean {
    if (!this.isReady) return false;
    drawBezier(
      start.x, start.y, control1.x, control1.y, control2.x, control2.y,
      end.x, end.y, thickness, color,
    );
    return true;
  }

  drawText(text: string, position: Vec2, size: number, color: Color, font?: Font, spacing = 0): boolean {
    if (!this.isReady) return false;
    if (font !== undefined) {
      if (!this.context.owns(font) || !font.isLoaded) return false;
      return font.drawNative(text, position, size, spacing, color);
    }
    drawPlainText(text, position.x, position.y, size, color);
    return true;
  }

  measureText(text: string, size: number, font?: Font, spacing = 0): number {
    if (!this.isReady) return 0;
    if (font === undefined) return measurePlainText(text, size);
    if (!this.context.owns(font) || !font.isLoaded) return 0;
    return font.measureText(text, size, spacing).x;
  }

  drawTexture(texture: Texture | RenderTexture, position: Vec2, tint: Color = Colors.WHITE): boolean {
    if (!this.isReady || !this.context.owns(texture) || !texture.isLoaded) return false;
    return texture.drawNative(position, tint);
  }

  drawModel(model: Model | Mesh, position: Vec3, scale = 1, tint: Color = Colors.WHITE, rotationY?: number): boolean {
    if (!this.isReady || !this.context.owns(model) || !model.isLoaded) return false;
    return model.drawNative(position, scale, tint, rotationY);
  }

  drawModelTransform(model: Model | Mesh, transform: number[], tint: Color = Colors.WHITE): boolean {
    if (!this.isReady || !this.context.owns(model) || !model.isLoaded || transform.length !== 16) return false;
    return model.drawTransformNative(transform, tint);
  }

  drawMaterial(material: Material, model: Model | Mesh, position: Vec3, scale = 1,
    tint: Color = Colors.WHITE, meshIndex?: number): boolean {
    if (!this.isReady || !this.context.owns(material) || !material.isLoaded ||
        !this.context.owns(model) || !model.isLoaded) return false;
    return material.drawNative(model, position, scale, tint, meshIndex);
  }

  drawInstanced(material: Material, model: Model | Mesh, source: InstancedDrawSource, meshIndex = 0): boolean {
    if (!this.isReady || !this.context.owns(material) || !material.isLoaded ||
        !this.context.owns(model) || !model.isLoaded || !this.context.owns(source) || !source.isLoaded) return false;
    return source.drawNative(material, model, meshIndex);
  }

  beginRenderTexture(target: RenderTexture): boolean {
    if (!this.isReady || this.mode !== 'none' || this.activeRenderTexture !== null ||
        !this.context.owns(target) || !target.isLoaded) return false;
    if (!target.beginNative()) return false;
    this.activeRenderTexture = target;
    return true;
  }

  endRenderTexture(target?: RenderTexture): boolean {
    if (!this.isReady || this.activeRenderTexture === null) return false;
    if (target !== undefined && target !== this.activeRenderTexture) return false;
    this.activeRenderTexture.endNative();
    this.activeRenderTexture = null;
    return true;
  }

  drawCube(position: Vec3, size: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawCube(position, size.x, size.y, size.z, color);
    return true;
  }

  drawCubeOutline(position: Vec3, size: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawCubeWires(position, size.x, size.y, size.z, color);
    return true;
  }

  drawSphere(position: Vec3, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawSphere(position, radius, color);
    return true;
  }

  drawSphereOutline(position: Vec3, radius: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawSphereWires(position, radius, color);
    return true;
  }

  drawCylinder(position: Vec3, radiusTop: number, radiusBottom: number, height: number, color: Color, slices?: number): boolean {
    if (!this.isReady) return false;
    drawCylinder(position, radiusTop, radiusBottom, height, color, slices);
    return true;
  }

  drawPlane(position: Vec3, width: number, depth: number, color: Color): boolean {
    if (!this.isReady) return false;
    drawPlane(position, width, depth, color);
    return true;
  }

  drawGrid(slices: number, spacing: number): boolean {
    if (!this.isReady) return false;
    drawGrid(slices, spacing);
    return true;
  }

  drawRay(origin: Vec3, direction: Vec3, color: Color): boolean {
    if (!this.isReady) return false;
    drawRay(origin, direction, color);
    return true;
  }

  screenshot(path: string): boolean {
    if (!this.isReady) return false;
    native.takeScreenshot(path);
    return true;
  }

  setEnvironmentFromHdr(path: string): boolean { if (!this.isReady) return false; native.setEnvClearFromHdr(path); return true; }
  setFog(color: Color, density: number, heightReference: number, heightFalloff: number): boolean {
    if (!this.isReady) return false;
    native.setFog(color.r / 255, color.g / 255, color.b / 255, density, heightReference, heightFalloff);
    return true;
  }
  setChromaticAberration(strength: number): boolean { if (!this.isReady) return false; native.setChromaticAberration(strength); return true; }
  setVignette(strength: number, softness: number): boolean { if (!this.isReady) return false; native.setVignette(strength, softness); return true; }
  setFilmGrain(strength: number): boolean { if (!this.isReady) return false; native.setFilmGrain(strength); return true; }
  setSharpenStrength(strength: number): boolean { if (!this.isReady) return false; native.setSharpenStrength(strength); return true; }
  setSunShafts(strength: number, decay: number, color: Color): boolean {
    if (!this.isReady) return false;
    native.setSunShafts(strength, decay, color.r / 255, color.g / 255, color.b / 255);
    return true;
  }
  setAutoExposure(enabled: boolean): boolean { if (!this.isReady) return false; native.setAutoExposure(enabled); return true; }
  setOcclusionCulling(enabled: boolean): boolean { if (!this.isReady) return false; native.setOcclusionCulling(enabled); return true; }
  setTaaEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setTaaEnabled(enabled); return true; }
  setRenderScale(scale: number): boolean { if (!this.isReady) return false; native.setRenderScale(scale); return true; }
  setOutputScale(scale: number): boolean { if (!this.isReady) return false; native.setOutputScale(scale); return true; }
  getRenderScale(): number { return this.isReady ? native.getRenderScale() : 0; }
  getOutputScale(): number { return this.isReady ? native.getOutputScale() : 0; }
  setUpscaleMode(mode: native.UpscaleMode): boolean { if (!this.isReady) return false; native.setUpscaleMode(mode); return true; }
  setCasStrength(strength: number): boolean { if (!this.isReady) return false; native.setCasStrength(strength); return true; }
  setAutoResolution(targetHz: number, enabled = true): boolean {
    if (!this.isReady) return false;
    native.setAutoResolution(targetHz, enabled);
    return true;
  }
  setManualExposure(value: number): boolean { if (!this.isReady) return false; native.setManualExposure(value); return true; }
  setEnvironmentIntensity(intensity: number): boolean { if (!this.isReady) return false; native.setEnvIntensity(intensity); return true; }
  setSsgiEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setSsgiEnabled(enabled); return true; }
  setPathTracing(mode: number): boolean { if (!this.isReady) return false; native.setPathTracing(mode); return true; }
  isPathTracingSupported(): boolean { return this.isReady && native.isPathTracingSupported(); }
  setSsgiIntensity(intensity: number): boolean { if (!this.isReady) return false; native.setSsgiIntensity(intensity); return true; }
  setSsgiRadius(radius: number): boolean { if (!this.isReady) return false; native.setSsgiRadius(radius); return true; }
  setDepthOfField(focusDistance: number, aperture: number): boolean {
    if (!this.isReady) return false;
    native.setDepthOfField(focusDistance, aperture);
    return true;
  }
  setQualityPreset(preset: native.QualityPreset): boolean { if (!this.isReady) return false; native.setQualityPreset(preset); return true; }
  setShadowsEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setShadowsEnabled(enabled); return true; }
  setShadowsAlwaysFresh(enabled: boolean): boolean { if (!this.isReady) return false; native.setShadowsAlwaysFresh(enabled); return true; }
  setBloomEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setBloomEnabled(enabled); return true; }
  setBloomIntensity(intensity: number): boolean { if (!this.isReady) return false; native.setBloomIntensity(intensity); return true; }
  setTonemap(kind: native.Tonemap): boolean { if (!this.isReady) return false; native.setTonemap(kind); return true; }
  setAutoExposureKey(key: number): boolean { if (!this.isReady) return false; native.setAutoExposureKey(key); return true; }
  setAutoExposureRate(rate: number): boolean { if (!this.isReady) return false; native.setAutoExposureRate(rate); return true; }
  setSsaoEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setSsaoEnabled(enabled); return true; }
  setSsaoIntensity(intensity: number): boolean { if (!this.isReady) return false; native.setSsaoIntensity(intensity); return true; }
  setSsaoRadius(radius: number): boolean { if (!this.isReady) return false; native.setSsaoRadius(radius); return true; }
  setPostPass(source: string): boolean { return this.isReady && native.setPostPass(source); }
  clearPostPass(): boolean { if (!this.isReady) return false; native.clearPostPass(); return true; }
  addPostPass(source: string): boolean { return this.isReady && native.addPostPass(source) >= 0; }
  clearAllPostPasses(): boolean { if (!this.isReady) return false; native.clearAllPostPasses(); return true; }
  setWind(directionX: number, directionZ: number, amplitude: number, frequency: number): boolean {
    if (!this.isReady) return false;
    native.setWind(directionX, directionZ, amplitude, frequency);
    return true;
  }
  setCloudShadows(strength: number, deckHeight: number, featureScale: number, driftSpeed: number): boolean {
    if (!this.isReady) return false;
    native.setCloudShadows(strength, deckHeight, featureScale, driftSpeed);
    return true;
  }
  setSsrEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setSsrEnabled(enabled); return true; }
  setMotionBlurEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setMotionBlurEnabled(enabled); return true; }
  setSssEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setSssEnabled(enabled); return true; }
  setProfilerEnabled(enabled: boolean): boolean { if (!this.isReady) return false; native.setProfilerEnabled(enabled); return true; }
  getProfilerCpuTimeUs(): number { return this.isReady ? native.getProfilerFrameCpuUs() : 0; }
  getProfilerGpuTimeUs(): number { return this.isReady ? native.getProfilerFrameGpuUs() : 0; }
  getProfilerOverlay(): { label: string; cpuUs: number; gpuUs: number }[] {
    return this.isReady ? native.getProfilerOverlay() : [];
  }
  getProfilerFrameHistory(): { cpuUs: number; gpuUs: number }[] {
    return this.isReady ? native.getProfilerFrameHistory() : [];
  }
  printProfilerSummary(): boolean { if (!this.isReady) return false; native.printProfilerSummary(); return true; }
  splatImpulse(x: number, z: number, radius: number, strength: number): boolean {
    if (!this.isReady) return false;
    native.splatImpulse(x, z, radius, strength);
    return true;
  }

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
