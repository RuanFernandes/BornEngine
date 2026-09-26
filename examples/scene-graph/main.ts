/**
 * Scene Graph Example — Demonstrates retained-mode 3D rendering.
 *
 * This is a proof-of-concept for the Pascal Editor native compilation path:
 * - Creates persistent scene nodes (like React Three Fiber's <mesh>)
 * - Updates geometry dynamically (like WallSystem's useFrame callback)
 * - Sets per-node transforms and materials
 *
 * The scene graph nodes persist across frames — unlike immediate-mode drawCube(),
 * they don't need to be re-submitted each frame.
 */

import { Colors, Game, Key } from '@bornengine/engine';

// ============================================================
// Wall geometry generator (simplified version of Pascal Editor's
// generateExtrudedWall — pure TypeScript math, no Three.js)
// ============================================================

function generateWallVertices(
  startX: number, startZ: number,
  endX: number, endZ: number,
  height: number,
  thickness: number,
): { vertices: number[]; indices: number[] } {
  // Wall direction vector
  const dx = endX - startX;
  const dz = endZ - startZ;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return { vertices: [], indices: [] };

  // Normal perpendicular to wall direction (in XZ plane)
  const nx = -dz / len;
  const nz = dx / len;

  // Half thickness offset
  const hx = nx * thickness * 0.5;
  const hz = nz * thickness * 0.5;

  // 8 corner vertices of the wall box
  //   0--1  (top, front)
  //   |  |
  //   3--2  (top, back)
  //
  //   4--5  (bottom, front)
  //   |  |
  //   7--6  (bottom, back)
  const corners = [
    // Front face (start side)
    [startX + hx, height, startZ + hz],  // 0: top-front-start
    [endX + hx, height, endZ + hz],      // 1: top-front-end
    [endX - hx, height, endZ - hz],      // 2: top-back-end
    [startX - hx, height, startZ - hz],  // 3: top-back-start
    [startX + hx, 0, startZ + hz],       // 4: bottom-front-start
    [endX + hx, 0, endZ + hz],           // 5: bottom-front-end
    [endX - hx, 0, endZ - hz],           // 6: bottom-back-end
    [startX - hx, 0, startZ - hz],       // 7: bottom-back-start
  ];

  const vertices: number[] = [];
  const indices: number[] = [];

  function addFace(
    v0: number[], v1: number[], v2: number[], v3: number[],
    fnx: number, fny: number, fnz: number,
  ) {
    const baseIdx = vertices.length / 12;
    // 4 vertices per face, each with 12 floats: xyz, nxnynz, rgba, uv
    for (const [v, u, uv_u, uv_v] of [[v0, 0, 0, 0], [v1, 1, 1, 0], [v2, 2, 1, 1], [v3, 3, 0, 1]] as any) {
      vertices.push(
        v[0], v[1], v[2],       // position
        fnx, fny, fnz,          // normal
        1.0, 1.0, 1.0, 1.0,    // color (white)
        uv_u, uv_v,            // UV
      );
    }
    // Two triangles per face
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // Front face (+normal direction)
  addFace(corners[0], corners[1], corners[5], corners[4], nx, 0, nz);
  // Back face (-normal direction)
  addFace(corners[2], corners[3], corners[7], corners[6], -nx, 0, -nz);
  // Top face
  addFace(corners[0], corners[3], corners[2], corners[1], 0, 1, 0);
  // Bottom face
  addFace(corners[4], corners[5], corners[6], corners[7], 0, -1, 0);
  // Start cap
  addFace(corners[3], corners[0], corners[4], corners[7], -dx / len, 0, -dz / len);
  // End cap
  addFace(corners[1], corners[2], corners[6], corners[5], dx / len, 0, dz / len);

  return { vertices, indices };
}

// ============================================================
// Main
// ============================================================

const game = new Game({ window: { width: 1280, height: 720, title: "BornEngine — Scene Graph Demo" }, targetFps: 60 });

// Create scene graph nodes (persistent, like R3F <mesh> elements)
const wall1 = game.sceneGraph.createNode();
const wall2 = game.sceneGraph.createNode();
const wall3 = game.sceneGraph.createNode();
const floor = game.sceneGraph.createNode();

// Generate wall geometry (like WallSystem's generateExtrudedWall)
const wall1Geo = generateWallVertices(0, 0, 5, 0, 3, 0.2);
const wall2Geo = generateWallVertices(5, 0, 5, 4, 3, 0.2);
const wall3Geo = generateWallVertices(0, 0, 0, 4, 3, 0.2);

// Upload geometry to GPU (like WallSystem assigning mesh.geometry)
wall1.updateGeometry(wall1Geo.vertices, wall1Geo.indices);
wall2.updateGeometry(wall2Geo.vertices, wall2Geo.indices);
wall3.updateGeometry(wall3Geo.vertices, wall3Geo.indices);

// Floor: a flat rectangle
const floorGeo = generateWallVertices(0, 0, 5, 0, 0, 4);
// Floor needs different geometry — let's make a simple quad
const floorVerts: number[] = [
  // x, y, z, nx, ny, nz, r, g, b, a, u, v
  0, 0, 0,   0, 1, 0,   0.8, 0.8, 0.8, 1.0,   0, 0,
  5, 0, 0,   0, 1, 0,   0.8, 0.8, 0.8, 1.0,   1, 0,
  5, 0, 4,   0, 1, 0,   0.8, 0.8, 0.8, 1.0,   1, 1,
  0, 0, 4,   0, 1, 0,   0.8, 0.8, 0.8, 1.0,   0, 1,
];
const floorIdx: number[] = [0, 1, 2, 0, 2, 3];
floor.updateGeometry(floorVerts, floorIdx);

// Set materials
wall1.setColor({ r: 242, g: 242, b: 235, a: 255 });
wall2.setColor({ r: 235, g: 235, b: 224, a: 255 });
wall3.setColor({ r: 230, g: 230, b: 219, a: 255 });
floor.setColor({ r: 179, g: 179, b: 166, a: 255 });

// Set PBR properties
wall1.setPbr(0.8, 0.0);
wall2.setPbr(0.8, 0.0);
wall3.setPbr(0.8, 0.0);
floor.setPbr(0.6, 0.0);

let angle = 0;
let wall3Visible = true;

game.run({
  update(dt) {

  // Toggle wall visibility with Space
  if (game.input.isKeyPressed(Key.SPACE)) {
    wall3Visible = !wall3Visible;
    wall3.setVisible(wall3Visible);
  }

  // Slowly rotate camera angle
  angle += dt * 0.3;
  },
  render() {
  game.renderer.clear(Colors.SNOW);

  // Camera orbits around the room
  const camX = 2.5 + Math.cos(angle) * 10;
  const camZ = 2.0 + Math.sin(angle) * 10;
  game.renderer.begin3D({
    position: { x: camX, y: 6, z: camZ },
    target: { x: 2.5, y: 1.5, z: 2 },
    up: { x: 0, y: 1, z: 0 },
    fovy: 45,
    projection: "perspective",
  });

  // Scene graph nodes render automatically via end_frame_with_scene
  // We only need to draw the grid manually (immediate mode)
  game.renderer.drawGrid(20, 1.0);

  game.renderer.end3D();

  game.renderer.drawText("BornEngine Scene Graph Demo", { x: 10, y: 10 }, 20, Colors.DARKGRAY);
  game.renderer.drawText("Scene nodes: " + String(game.sceneGraph.nodeCount), { x: 10, y: 35 }, 16, Colors.GRAY);
  game.renderer.drawText("Press SPACE to toggle wall 3", { x: 10, y: 55 }, 16, Colors.GRAY);
  game.renderer.drawText("Walls render automatically (retained mode)", { x: 10, y: 75 }, 16, Colors.GRAY);

  },
  onStop: () => game.dispose(),
});
