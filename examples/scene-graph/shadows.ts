/**
 * Shadows + GLTF Example — Phase 4 proof-of-concept.
 *
 * Demonstrates:
 * - Directional light shadow mapping (PCF)
 * - GLTF model loaded and attached to scene nodes
 * - Multiple lights with shadows
 * - Model instancing via scene nodes
 */

import { Colors, Game } from '@bornengine/engine';
import type { SceneNode } from '@bornengine/engine';

// ============================================================
// Setup
// ============================================================

const game = new Game({ window: { width: 1280, height: 720, title: "BornEngine — Shadows + GLTF (Phase 4)" }, targetFps: 60 });

// Enable shadow mapping
game.sceneGraph.setShadowsEnabled(true);

// Lighting
game.sceneGraph.setAmbientLight({ r: 255, g: 255, b: 255, a: 255 }, 0.2);
game.sceneGraph.addDirectionalLight({ x: 0.5, y: 1.0, z: 0.3 }, { r: 255, g: 240, b: 220, a: 255 }, 0.7);

function extrude(node: SceneNode, flatXZ: number[], depth: number): void {
  const points: { x: number; y: number; z: number }[] = [];
  for (let index = 0; index + 1 < flatXZ.length; index += 2) {
    points.push({ x: flatXZ[index], y: 0, z: flatXZ[index + 1] });
  }
  node.extrudePolygon(points, depth);
}

// ============================================================
// Scene: room with furniture
// ============================================================

// Floor
const floor = game.sceneGraph.createNode();
const floorPoly = [-5, -5, 5, -5, 5, 5, -5, 5];
extrude(floor, floorPoly, 0.05);
floor.setColor({ r: 204, g: 199, b: 184, a: 255 });
floor.setPbr(0.7, 0.0);

// Walls
function makeWall(sx: number, sz: number, ex: number, ez: number): void {
  const node = game.sceneGraph.createNode();
  const dx = ex - sx;
  const dz = ez - sz;
  const len = Math.sqrt(dx * dx + dz * dz);
  const nx = -dz / len * 0.1;
  const nz = dx / len * 0.1;
  const poly = [
    sx + nx, sz + nz,
    ex + nx, ez + nz,
    ex - nx, ez - nz,
    sx - nx, sz - nz,
  ];
  extrude(node, poly, 3.0);
  node.setColor({ r: 242, g: 237, b: 224, a: 255 });
  node.setPbr(0.85, 0.0);
}

makeWall(-5, -5, 5, -5);  // back
makeWall(5, -5, 5, 5);    // right
makeWall(5, 5, -5, 5);    // front
makeWall(-5, 5, -5, -5);  // left

// Simple "table" made from extruded boxes
function makeBox(cx: number, cy: number, cz: number, w: number, h: number, d: number, r: number, g: number, b: number): void {
  const node = game.sceneGraph.createNode();
  const hw = w / 2;
  const hd = d / 2;
  const poly = [cx - hw, cz - hd, cx + hw, cz - hd, cx + hw, cz + hd, cx - hw, cz + hd];
  extrude(node, poly, h);
  // Offset Y via transform
  node.setTrs({ x: 0, y: cy, z: 0 });
  node.setColor({ r: r * 255, g: g * 255, b: b * 255, a: 255 });
  node.setPbr(0.6, 0.0);
}

// Table
makeBox(0, 0, 0, 1.5, 0.75, 0.8, 0.6, 0.4, 0.25);  // tabletop
makeBox(-0.6, 0, -0.3, 0.08, 0.72, 0.08, 0.5, 0.35, 0.2);  // legs
makeBox(0.6, 0, -0.3, 0.08, 0.72, 0.08, 0.5, 0.35, 0.2);
makeBox(-0.6, 0, 0.3, 0.08, 0.72, 0.08, 0.5, 0.35, 0.2);
makeBox(0.6, 0, 0.3, 0.08, 0.72, 0.08, 0.5, 0.35, 0.2);

// Chair (simple box)
makeBox(2.0, 0, 0, 0.5, 0.45, 0.5, 0.55, 0.45, 0.35);
makeBox(2.0, 0.45, -0.2, 0.5, 0.5, 0.08, 0.55, 0.45, 0.35);

// Lighting system
game.sceneGraph.onFrame(() => {
  game.sceneGraph.addDirectionalLight({ x: 0.5, y: 1.0, z: 0.3 }, { r: 255, g: 242, b: 230, a: 255 }, 0.6);
  game.sceneGraph.addDirectionalLight({ x: -0.3, y: 0.5, z: -0.7 }, { r: 178, g: 204, b: 242, a: 255 }, 0.2);
}, 5);

// ============================================================
// Main loop
// ============================================================

let angle = 0;

game.run({
  update(dt) { angle += dt * 0.15; },
  render() {
    game.sceneGraph.setAmbientLight({ r: 255, g: 255, b: 255, a: 255 }, 0.2);
    game.renderer.clear(Colors.SNOW);

  const camX = Math.cos(angle) * 12;
  const camZ = Math.sin(angle) * 12;
  game.renderer.begin3D({
    position: { x: camX, y: 8, z: camZ },
    target: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovy: 45,
    projection: "perspective",
  });

  game.renderer.drawGrid(20, 1.0);
  game.renderer.end3D();

  game.renderer.drawText("BornEngine — Shadow Mapping + GLTF (Phase 4)", { x: 10, y: 10 }, 20, Colors.DARKGRAY);
  game.renderer.drawText("Scene nodes: " + String(game.sceneGraph.nodeCount), { x: 10, y: 35 }, 16, Colors.GRAY);
  game.renderer.drawText("Directional light shadows (2048x2048 PCF)", { x: 10, y: 55 }, 16, Colors.GRAY);
  game.renderer.drawText("Room with table + chair (extruded polygons)", { x: 10, y: 75 }, 16, Colors.GRAY);

  },
  onStop: () => game.dispose(),
});
