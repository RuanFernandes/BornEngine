import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { CameraRig2D } from '../../src/camera2d/camera-rig-2d';
import { Vector2D } from '../../src/math/vector2d';
import { Viewport2D } from '../../src/camera2d/viewport-2d';
import { GameObject } from '../../src/game/game-object';
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

function createGame(): { game: Game; context: GameContext } {
  const game = {} as Game;
  const context = GameContext.create();
  if (context === null) {
    console.error('FAIL: camera fixture context is available');
    process.exit(1);
  }
  context.markReady();
  bindGameContext(game, context);
  return { game, context };
}

const target = new GameObject({ position: { x: 20, y: 12, z: 0 } });
const follow = new CameraRig2D({ target, offset: { x: 50, y: 40 } });
follow.update(1 / 60);
expect(follow.camera.target.x === 20 && follow.camera.target.y === 12,
  'camera rig follows its target without smoothing');
expect(follow.camera.target instanceof Vector2D && follow.targetOffset instanceof Vector2D,
  'camera snapshots and offsets expose Vector2D values');
const clampedCameraTarget = follow.camera.target.clamped(Vector2D.zero(), new Vector2D(30, 30));
expect(clampedCameraTarget.equals({ x: 20, y: 12 }),
  'camera snapshots expose Vector2D methods in their declared type');

target.transform.position = { x: 40, y: 18, z: 0 };
follow.update(1 / 60);
expect(follow.camera.target.x === 40 && follow.camera.target.y === 18,
  'camera rig reads the target world transform on each update');

const deadZoneTarget = new GameObject({ position: { x: 12, y: -9, z: 0 } });
const deadZone = new CameraRig2D({
  target: deadZoneTarget,
  offset: { x: 50, y: 40 },
  deadZone: { x: -5, y: -4, width: 10, height: 8 },
});
deadZone.update(0.1);
expect(deadZone.camera.target.x === 7 && deadZone.camera.target.y === -5,
  'dead zone moves only enough to keep the target on its edge');
deadZoneTarget.transform.position = { x: 8, y: -7, z: 0 };
deadZone.update(0.1);
expect(deadZone.camera.target.x === 7 && deadZone.camera.target.y === -5,
  'dead zone leaves the camera still while the target remains inside');

function smoothedRig(step: number, count: number): CameraRig2D {
  const movingTarget = new GameObject({ position: { x: 10, y: 0, z: 0 } });
  const rig = new CameraRig2D({ target: movingTarget, smoothing: 1, offset: { x: 50, y: 40 } });
  for (let index = 0; index < count; index++) rig.update(step);
  return rig;
}
const oneStep = smoothedRig(1, 1).camera.target.x;
const fourSteps = smoothedRig(0.25, 4).camera.target.x;
expect(close(oneStep, 10 * (1 - Math.exp(-1))) && close(oneStep, fourSteps),
  'exponential smoothing gives the same result for different frame subdivisions');

const boundedTarget = new GameObject({ position: { x: 100, y: 90, z: 0 } });
const boundedRig = new CameraRig2D({
  target: boundedTarget,
  offset: { x: 50, y: 40 },
  bounds: { x: 10, y: 15, width: 30, height: 20 },
});
const { game, context } = createGame();
const scene = new Scene(game);
scene.viewport2D = new Viewport2D({ width: 100, height: 80 });
const boundedOwner = new GameObject();
boundedOwner.addComponent(boundedRig);
scene.addNode(boundedTarget);
scene.addNode(boundedOwner);
boundedRig.update(0.1);
expect(boundedRig.camera.target.x === 25 && boundedRig.camera.target.y === 25,
  'bounds smaller than the logical viewport center the camera on the bounds');

const zoomTarget = new GameObject();
const zoomRig = new CameraRig2D({
  target: zoomTarget,
  zoom: 4,
  minZoom: 0.5,
  maxZoom: 2,
  offset: { x: 50, y: 40 },
});
expect(zoomRig.camera.zoom === 2, 'initial zoom clamps to its configured maximum');
expect(zoomRig.setZoom(0.1) && zoomRig.camera.zoom === 0.5,
  'runtime zoom clamps to its configured minimum');
expect(!zoomRig.setZoom(-2) && zoomRig.camera.zoom === 0.5,
  'invalid zoom requests fail without changing the camera');
const minimumZoomRig = new CameraRig2D({ minZoom: 2, maxZoom: 3 });
expect(minimumZoomRig.camera.zoom === 2,
  'the default zoom clamps to a configured minimum above one');

const shakeA = new CameraRig2D({ target: zoomTarget, offset: { x: 50, y: 40 } });
const shakeB = new CameraRig2D({ target: zoomTarget, offset: { x: 50, y: 40 } });
const shake = { amplitude: { x: 4, y: 3 }, duration: 1, seed: 47 };
expect(shakeA.shake(shake) && shakeB.shake(shake), 'valid seeded shake starts');
shakeA.update(0.2);
shakeB.update(0.2);
expect(shakeA.camera.target.x === shakeB.camera.target.x &&
  shakeA.camera.target.y === shakeB.camera.target.y &&
  (shakeA.camera.target.x !== 0 || shakeA.camera.target.y !== 0),
  'equal seeds produce matching non-zero shake offsets');
shakeA.stopShake();
expect(shakeA.camera.target.x === 0 && shakeA.camera.target.y === 0,
  'stopping shake clears its offset immediately');
shakeB.update(1);
expect(shakeB.camera.target.x === 0 && shakeB.camera.target.y === 0,
  'shake envelope returns to the target when its duration ends');
const explicitShake = new CameraRig2D({ target: zoomTarget, offset: { x: 50, y: 40 } });
expect(explicitShake.shake({
  duration: 1,
  envelope: [{ x: 0, y: 0 }, { x: 3, y: -2 }, { x: 0, y: 0 }],
}), 'explicit shake envelopes are accepted');
explicitShake.update(0.5);
expect(explicitShake.camera.target.x === 3 && explicitShake.camera.target.y === -2,
  'explicit shake envelope samples normalized offsets');

const cameraSnapshot = zoomRig.camera;
cameraSnapshot.target.set(999, 999);
expect(zoomRig.camera.target.x === 0, 'camera getter returns an isolated snapshot');

const fallbackCamera = {
  offset: { x: 25, y: 30 }, target: { x: 5, y: 6 }, rotation: 0, zoom: 1,
};
scene.camera2D = fallbackCamera;
const rigOwner = new GameObject();
const boundRig = new CameraRig2D({ target: zoomTarget, offset: { x: 40, y: 30 } });
rigOwner.addComponent(boundRig);
scene.addNode(rigOwner);
expect(scene.bindCameraRig2D(boundRig) && scene.camera2D !== null && scene.camera2D.offset.x === 40,
  'scene binding uses the active rig camera snapshot');
boundRig.enabled = false;
expect(scene.camera2D === fallbackCamera,
  'disabling the bound rig restores the previous scene camera');
boundRig.enabled = true;
expect(rigOwner.removeComponent(boundRig) && scene.camera2D === fallbackCamera,
  'removing the bound rig restores the previous scene camera');
const invalidRig = new CameraRig2D({ target: null, smoothing: NaN, zoom: NaN });
expect(invalidRig.error !== null && invalidRig.camera.zoom === 1,
  'invalid targets and camera options fail safely with a valid snapshot');
const malformedTargetRig = new CameraRig2D({ target: {} as GameObject });
malformedTargetRig.update(1 / 60);
expect(malformedTargetRig.error !== null && malformedTargetRig.camera.zoom === 1,
  'invalid target objects fail safely instead of throwing during follow updates');

scene.unload();
context.disposeResources();
console.log('CameraRig2D runtime fixture passed');
