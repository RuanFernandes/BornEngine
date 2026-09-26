// Reference consumer for the shared world format using the class-first API.
// Run from a game directory so world model references resolve against its assets.
// Usage: world-viewer --world assets/worlds/level.world.json [--prefabs assets/prefabs]
// Controls: WASD move, Q/E down/up, hold right mouse to look, Shift = fast.

import { Game, Key, Model, MouseButton, PrefabLibrary, WorldData } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';
import { readdirSync } from 'fs';

let worldPath = '';
let prefabsDir = '';
for (let index = 0; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--world' && index + 1 < process.argv.length) worldPath = process.argv[index + 1];
  if (process.argv[index] === '--prefabs' && index + 1 < process.argv.length) prefabsDir = process.argv[index + 1];
}
if (worldPath.length === 0) {
  console.error('usage: world-viewer --world <path/to/x.world.json> [--prefabs <dir>]');
  process.exit(2);
}

const worldData = new WorldData(worldPath);
if (!worldData.load()) throw new Error(worldData.error || 'World load failed');
const world = worldData.document;
if (world === null) throw new Error('Loaded world document is unavailable');

const game = new Game({
  window: { width: 1280, height: 800, title: 'world-viewer — ' + world.name },
  targetFps: 60,
});
if (!game.isReady) throw new Error(game.error || 'Game startup failed');

const modelCache = new Map<string, Model>();
function getModel(path: string): Model | null {
  const cached = modelCache.get(path);
  if (cached !== undefined) return cached.isLoaded ? cached : null;
  const model = new Model(game, path);
  modelCache.set(path, model);
  if (!model.isLoaded) console.error('world-viewer: ' + model.error);
  return model.isLoaded ? model : null;
}

let prefabs: PrefabLibrary | null = null;
if (prefabsDir.length > 0) {
  prefabs = new PrefabLibrary();
  let files: string[] = [];
  try {
    files = readdirSync(prefabsDir) as string[];
  } catch (error) {
    console.error('world-viewer: cannot read --prefabs dir ' + prefabsDir);
  }
  for (const file of files) {
    if (!file.endsWith('.prefab.json')) continue;
    try {
      prefabs.load(prefabsDir + '/' + file);
    } catch (error) {
      console.error('world-viewer: skipping prefab ' + file + ': ' + String(error));
    }
  }
}

const instance = worldData.instantiate(game, { getModel, prefabs });
if (instance.error !== null) throw new Error(instance.error);
for (const warning of instance.warnings) console.error('world-viewer: ' + warning);

const centerX = (world.bounds.min[0] + world.bounds.max[0]) / 2;
const centerY = (world.bounds.min[1] + world.bounds.max[1]) / 2;
const centerZ = (world.bounds.min[2] + world.bounds.max[2]) / 2;
const spanX = world.bounds.max[0] - world.bounds.min[0];
const spanZ = world.bounds.max[2] - world.bounds.min[2];
let span = spanX > spanZ ? spanX : spanZ;
if (span < 10) span = 10;

let cameraX = centerX;
let cameraY = centerY + span * 0.35;
let cameraZ = centerZ + span * 0.7;
let yaw = Math.PI;
let pitch = -0.35;

function update(deltaTime: number): void {
  if (game.input.isMouseButtonDown(MouseButton.RIGHT)) {
    yaw -= game.input.getMouseDeltaX() * 0.003;
    pitch -= game.input.getMouseDeltaY() * 0.003;
    if (pitch > 1.5) pitch = 1.5;
    if (pitch < -1.5) pitch = -1.5;
  }

  const forwardX = Math.sin(yaw) * Math.cos(pitch);
  const forwardY = Math.sin(pitch);
  const forwardZ = Math.cos(yaw) * Math.cos(pitch);
  const rightX = Math.sin(yaw - Math.PI / 2);
  const rightZ = Math.cos(yaw - Math.PI / 2);
  let speed = span * 0.15 * deltaTime;
  if (game.input.isKeyDown(Key.LEFT_SHIFT)) speed *= 4;
  if (game.input.isKeyDown(Key.W)) { cameraX += forwardX * speed; cameraY += forwardY * speed; cameraZ += forwardZ * speed; }
  if (game.input.isKeyDown(Key.S)) { cameraX -= forwardX * speed; cameraY -= forwardY * speed; cameraZ -= forwardZ * speed; }
  if (game.input.isKeyDown(Key.A)) { cameraX -= rightX * speed; cameraZ -= rightZ * speed; }
  if (game.input.isKeyDown(Key.D)) { cameraX += rightX * speed; cameraZ += rightZ * speed; }
  if (game.input.isKeyDown(Key.Q)) cameraY -= speed;
  if (game.input.isKeyDown(Key.E)) cameraY += speed;
}

function render(): void {
  const camera: Camera3D = {
    position: { x: cameraX, y: cameraY, z: cameraZ },
    target: {
      x: cameraX + Math.sin(yaw) * Math.cos(pitch),
      y: cameraY + Math.sin(pitch),
      z: cameraZ + Math.cos(yaw) * Math.cos(pitch),
    },
    up: { x: 0, y: 1, z: 0 },
    fovy: 60,
    projection: 'perspective',
  };
  const sky = world.environment.skyColor;
  game.renderer.clear({
    r: Math.floor(sky[0] * 255),
    g: Math.floor(sky[1] * 255),
    b: Math.floor(sky[2] * 255),
    a: 255,
  });
  instance.applyLighting();
  if (game.renderer.begin3D(camera)) game.renderer.end3D();

  const summary = world.name + ' — ' + world.entities.length + ' entities, ' +
    world.lights.length + ' lights, ' + world.water.length + ' water, ' +
    world.rivers.length + ' rivers' +
    (instance.warnings.length > 0 ? ' (' + instance.warnings.length + ' warnings; see console)' : '');
  game.renderer.drawText(summary, { x: 12, y: 12 }, 18, { r: 255, g: 255, b: 255, a: 220 });
  game.renderer.drawText('WASD move · Q/E down/up · hold RMB look · Shift fast',
    { x: 12, y: 34 }, 14, { r: 255, g: 255, b: 255, a: 140 });
}

game.run({ update, render, onStop: () => game.dispose() });
