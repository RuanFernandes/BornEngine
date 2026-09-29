import { Viewport2D } from '../../src/camera2d/viewport-2d';
import { Vector2D } from '../../src/math/vector2d';
import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Camera2D } from '../../src/core/types';
import { Scene } from '../../src/game/scene';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function close(actual: number, expected: number, epsilon = 0.0001): boolean {
  return Math.abs(actual - expected) < epsilon;
}

const fit = new Viewport2D({ width: 320, height: 180, mode: 'fit' });
const wide = fit.getTransform(1000, 600);
expect(wide !== null && close(wide.scaleX, 3.125) && close(wide.scaleY, 3.125) &&
  close(wide.offsetX, 0) && close(wide.offsetY, 18.75),
  'fit uses a uniform scale and centers letterbox bars on a wide screen');
expect(fit.screenToLogical({ x: 0, y: 18.75 }, 1000, 600)?.x === 0 &&
  fit.screenToLogical({ x: 0, y: 18.75 }, 1000, 600)?.y === 0,
  'the content top-left edge maps to logical origin');
expect(fit.screenToLogical({ x: 500, y: 10 }, 1000, 600) === null &&
  fit.screenToLogical({ x: 1000, y: 300 }, 1000, 600) === null,
  'bar pixels and the half-open right edge are outside the logical viewport');

const narrow = fit.getTransform(600, 1000);
expect(narrow !== null && close(narrow.scaleX, 1.875) && close(narrow.offsetY, 331.25),
  'fit letterboxes a taller, narrower screen');
expect(fit.getTransform(0, 600) === null && fit.getTransform(800, NaN) === null,
  'zero or invalid renderer dimensions fail safely');

const integer = new Viewport2D({ width: 320, height: 180, mode: 'integer' });
const integerUpscale = integer.getTransform(960, 540);
expect(integerUpscale !== null && integerUpscale.scaleX === 3 && integerUpscale.scaleY === 3,
  'integer mode chooses a whole-number upscale');
const integerFallback = integer.getTransform(160, 90);
expect(integerFallback !== null && close(integerFallback.scaleX, 0.5) &&
  close(integerFallback.scaleY, 0.5),
  'integer mode falls back to uniform fractional fit below one times');

const stretch = new Viewport2D({ width: 320, height: 180, mode: 'stretch' });
const stretched = stretch.getTransform(800, 600);
expect(stretched !== null && stretched.scaleX === 2.5 && stretched.scaleY === 600 / 180 &&
  stretched.offsetX === 0 && stretched.offsetY === 0,
  'stretch fills both screen axes with independent scales');
const roundTrip = stretch.screenToLogical({ x: 425, y: 366.6666666667 }, 800, 600);
expect(roundTrip !== null && close(roundTrip.x, 170) && close(roundTrip.y, 110),
  'stretch screen and logical transforms round trip');

const invalid = new Viewport2D({ width: 0, height: 180, mode: 'fit' });
const invalidTransform = invalid.getTransform(800, 600);
expect(!invalid.isValid && invalid.error !== null && invalidTransform !== null &&
  invalidTransform.scaleX === 1 && invalidTransform.scaleY === 1 &&
  invalid.screenToLogical({ x: 24, y: 12 }, 800, 600)?.x === 24,
  'invalid logical dimensions safely fall back to full-window coordinates');

const hidpiTransform = fit.getTransform(800, 600);
expect(hidpiTransform !== null && hidpiTransform.scaleX === 2.5,
  'viewport resolution uses the logical screen dimensions reported by the renderer');

const camera: Camera2D = {
  offset: { x: 160, y: 90 }, target: { x: 0, y: 0 }, rotation: 0, zoom: 1,
};
const center = fit.screenToWorld({ x: 500, y: 300 }, camera, 1000, 600);
expect(center !== null && center.x === 0 && center.y === 0,
  'pointer conversion applies the viewport before the camera transform');
expect(center instanceof Vector2D && center.add(Vector2D.one()).equals(new Vector2D(1, 1)),
  'viewport conversions return Vector2D instances with math helpers');
expect(fit.screenToWorld({ x: 500, y: 10 }, camera, 1000, 600) === null,
  'pointer positions in letterbox bars have no world position');
const screen = fit.worldToScreen({ x: 10, y: 20 }, camera, 1000, 600);
expect(screen !== null && close(screen.x, 531.25) && close(screen.y, 362.5),
  'world-to-screen uses the same fit scale and offsets as rendering');
const returned = fit.screenToWorld(screen as { x: number; y: number }, camera, 1000, 600);
expect(returned !== null && close(returned.x, 10) && close(returned.y, 20),
  'world and screen conversions round trip through the active viewport');

const resizedScreen = fit.worldToScreen({ x: 10, y: 20 }, camera, 1600, 900);
expect(resizedScreen !== null && close(resizedScreen.x, 850) && close(resizedScreen.y, 550),
  'viewport mapping recalculates after a window resize');

const rotated: Camera2D = {
  offset: { x: 160, y: 90 }, target: { x: 5, y: -3 }, rotation: 90, zoom: 2,
};
const rotatedScreen = fit.worldToScreen({ x: 8, y: 1 }, rotated, 1000, 600);
const rotatedWorld = rotatedScreen === null ? null : fit.screenToWorld(rotatedScreen, rotated, 1000, 600);
expect(rotatedWorld !== null && close(rotatedWorld.x, 8) && close(rotatedWorld.y, 1),
  'rotated camera conversions remain inverse after viewport mapping');
expect(fit.screenToWorld({ x: 500, y: 300 }, { ...camera, zoom: 0 }, 1000, 600) === null &&
  fit.screenToWorld({ x: 500, y: 300 }, { ...camera, zoom: -1 }, 1000, 600) === null &&
  fit.worldToScreen({ x: NaN, y: 0 }, camera, 1000, 600) === null,
  'zero or negative zoom and invalid world values fail safely');

const game = {} as Game;
const context = GameContext.create();
if (context === null) process.exit(1);
context.markReady();
bindGameContext(game, context);
const scene = new Scene(game);
scene.viewport2D = fit;
let startedCamera: Camera2D | null = null;
let startedViewport: Viewport2D | null = null;
scene.render({
  _beginSceneRender(): void {},
  begin2D(activeCamera: Camera2D, activeViewport?: Viewport2D | null): boolean {
    startedCamera = activeCamera;
    startedViewport = activeViewport === undefined ? null : activeViewport;
    return true;
  },
  end2D(): boolean { return true; },
} as any as Renderer, scene.camera2D, scene.viewport2D);
expect(startedCamera !== null && startedCamera.zoom === 1 && startedCamera.offset.x === 0 &&
  startedCamera.target.y === 0 && startedViewport === fit,
  'a viewport-only scene opens an identity camera pass for rendering');
scene.unload();
context.disposeResources();

console.log('Viewport2D runtime fixture passed');
