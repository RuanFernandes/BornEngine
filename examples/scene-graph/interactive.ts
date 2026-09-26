/**
 * Interactive Wall Editor.
 *
 * Demonstrates scene picking, wall placement, camera orbit controls, and
 * game-owned frame systems using BornEngine's native runtime.
 */

import { Colors, Game, Key, MouseButton } from '@bornengine/engine';
import type { Camera3D, SceneNode, Vec3 } from '@bornengine/engine';

interface WallData {
  id: string;
  start: [number, number];
  end: [number, number];
  thickness: number;
  height: number;
  node: SceneNode;
}

const game = new Game({
  window: { width: 1280, height: 720, title: 'BornEngine — Interactive Wall Editor' },
  targetFps: 60,
});

const walls = new Map<string, WallData>();
const dirtyWalls = new Set<string>();
let nextWallId = 1;
let selectedWallId: string | null = null;

const floor = game.sceneGraph.createNode({ name: 'Floor' });
floor.extrudePolygon([
  { x: -10, y: 0, z: -10 },
  { x: 10, y: 0, z: -10 },
  { x: 10, y: 0, z: 10 },
  { x: -10, y: 0, z: 10 },
], 0.02);
floor.setColor({ r: 217, g: 217, b: 209, a: 255 });
floor.setPbr(0.7, 0);

function extrudeFlatXZ(node: SceneNode, polygon: number[], depth: number): void {
  const points: Vec3[] = [];
  for (let index = 0; index + 1 < polygon.length; index += 2) {
    points.push({ x: polygon[index], y: 0, z: polygon[index + 1] });
  }
  node.extrudePolygon(points, depth);
}

function createWall(sx: number, sz: number, ex: number, ez: number): string {
  const id = 'wall_' + String(nextWallId++);
  const node = game.sceneGraph.createNode({ name: id });
  walls.set(id, {
    id,
    start: [sx, sz],
    end: [ex, ez],
    thickness: 0.2,
    height: 3,
    node,
  });
  dirtyWalls.add(id);
  return id;
}

function wallSystem(): void {
  for (const id of dirtyWalls) {
    const wall = walls.get(id);
    if (wall === undefined) continue;

    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    const dx = ex - sx;
    const dz = ez - sz;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.001) continue;

    const nx = -dz / length;
    const nz = dx / length;
    const halfThickness = wall.thickness * 0.5;
    const polygon = [
      sx + nx * halfThickness, sz + nz * halfThickness,
      ex + nx * halfThickness, ez + nz * halfThickness,
      ex - nx * halfThickness, ez - nz * halfThickness,
      sx - nx * halfThickness, sz - nz * halfThickness,
    ];

    extrudeFlatXZ(wall.node, polygon, wall.height);
    wall.node.setColor(wall.id === selectedWallId
      ? { r: 77, g: 153, b: 255, a: 255 }
      : { r: 242, g: 242, b: 235, a: 255 });
    wall.node.setPbr(0.8, 0);
    dirtyWalls.delete(id);
  }
}

function lightSystem(): void {
  game.sceneGraph.addDirectionalLight(
    { x: 0.5, y: 1, z: 0.3 },
    { r: 255, g: 242, b: 230, a: 255 },
    0.6,
  );
  game.sceneGraph.addDirectionalLight(
    { x: -0.3, y: 0.5, z: -0.7 },
    { r: 204, g: 217, b: 242, a: 255 },
    0.25,
  );
}

game.sceneGraph.setAmbientLight(Colors.WHITE, 0.3);
game.sceneGraph.onFrame(wallSystem, 4);
game.sceneGraph.onFrame(lightSystem, 5);

createWall(0, 0, 5, 0);
createWall(5, 0, 5, 4);
createWall(5, 4, 0, 4);
createWall(0, 4, 0, 0);

type ToolMode = 'select' | 'draw';
let toolMode: ToolMode = 'draw';
let drawStart: [number, number] | null = null;
let cameraAngle = 0.5;
let cameraPitch = 0.4;
const cameraDistance = 15;
let cameraTargetX = 0;
let cameraTargetZ = 0;

function getCameraPosition(): Vec3 {
  return {
    x: cameraTargetX + Math.cos(cameraAngle) * Math.cos(cameraPitch) * cameraDistance,
    y: Math.sin(cameraPitch) * cameraDistance,
    z: cameraTargetZ + Math.sin(cameraAngle) * Math.cos(cameraPitch) * cameraDistance,
  };
}

function updateCamera(): void {
  if (!game.input.isMouseButtonDown(MouseButton.RIGHT)) return;
  cameraAngle -= game.input.getMouseDeltaX() * 0.005;
  cameraPitch -= game.input.getMouseDeltaY() * 0.005;
  cameraPitch = Math.max(0.1, Math.min(1.4, cameraPitch));
}

function selectWall(id: string | null): void {
  if (selectedWallId !== null) dirtyWalls.add(selectedWallId);
  selectedWallId = id;
  if (selectedWallId !== null) dirtyWalls.add(selectedWallId);
}

function handleLeftClick(): void {
  const hit = game.sceneGraph.pick(game.input.getMousePosition());
  if (toolMode === 'select') {
    if (hit.hit && hit.node !== null) {
      for (const [id, wall] of walls) {
        if (wall.node === hit.node) {
          selectWall(id);
          return;
        }
      }
    }
    selectWall(null);
    return;
  }

  if (!hit.hit || hit.node !== floor) return;
  const worldX = Math.round(hit.point.x * 2) / 2;
  const worldZ = Math.round(hit.point.z * 2) / 2;
  if (drawStart === null) {
    drawStart = [worldX, worldZ];
    return;
  }

  createWall(drawStart[0], drawStart[1], worldX, worldZ);
  drawStart = null;
}

game.run({
  update() {
    updateCamera();

    if (game.input.isKeyPressed(Key.TAB)) {
      toolMode = toolMode === 'select' ? 'draw' : 'select';
      drawStart = null;
    }

    if (game.input.isMouseButtonPressed(MouseButton.LEFT)) handleLeftClick();
    if (game.input.isKeyPressed(Key.ESCAPE)) drawStart = null;

    if (game.input.isKeyPressed(Key.BACKSPACE) && selectedWallId !== null) {
      const wall = walls.get(selectedWallId);
      if (wall !== undefined) {
        game.sceneGraph.remove(wall.node, true);
        walls.delete(selectedWallId);
        selectWall(null);
      }
    }
  },
  render() {
    game.renderer.clear(Colors.SNOW);

    const camera: Camera3D = {
      position: getCameraPosition(),
      target: { x: cameraTargetX, y: 1.5, z: cameraTargetZ },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective',
    };
    if (game.renderer.begin3D(camera)) {
      game.renderer.drawGrid(20, 0.5);
      game.renderer.end3D();
    }

    game.renderer.drawText('Interactive Wall Editor', { x: 10, y: 10 }, 20, Colors.DARKGRAY);
    game.renderer.drawText('Mode: ' + toolMode + ' (Tab to toggle)', { x: 10, y: 35 }, 16, Colors.GRAY);
    game.renderer.drawText('Scene nodes: ' + String(game.sceneGraph.nodeCount), { x: 10, y: 55 }, 16, Colors.GRAY);
    game.renderer.drawText('Walls: ' + String(walls.size), { x: 10, y: 75 }, 16, Colors.GRAY);

    if (toolMode === 'select') {
      game.renderer.drawText('LEFT CLICK: select wall | BACKSPACE: delete', { x: 10, y: 100 }, 14, Colors.BLUE);
      if (selectedWallId !== null) {
        game.renderer.drawText('Selected: ' + selectedWallId, { x: 10, y: 120 }, 14, Colors.BLUE);
      }
    } else {
      game.renderer.drawText('LEFT CLICK: place wall endpoint | ESC: cancel', { x: 10, y: 100 }, 14, Colors.GREEN);
      if (drawStart !== null) {
        const startText = 'Start: ' + String(drawStart[0]) + ', ' + String(drawStart[1]) + ' — click to place end';
        game.renderer.drawText(startText, { x: 10, y: 120 }, 14, Colors.GREEN);
      }
    }

    game.renderer.drawText('RIGHT DRAG: orbit camera', { x: 10, y: 145 }, 14, Colors.GRAY);
  },
  onStop: () => game.dispose(),
});
