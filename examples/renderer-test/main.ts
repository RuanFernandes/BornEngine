// ============================================================
// BornEngine Renderer Test Scene
// ============================================================
// Walkable 3D showcase exercising every current rendering feature.
// Visual regression target for bloom-renderer-spec-v2.md.
//
// As renderer features land (GI, SSR, bloom, volumetrics, TAA,
// VSM, etc.), this scene is designed to reveal their impact
// without code changes — the geometry and materials are chosen
// to make quality differences obvious.
//
// Controls:
//   WASD / Arrows  Move (horizontal)
//   Mouse          Look
//   Space          Up
//   C              Down
//   Shift          Sprint
//   Tab            Toggle cursor lock
//   1-6            Teleport to zone
//
// Zones:
//   1  PBR Material Gallery   (origin)
//   2  Multi-Light Arena      (+X)
//   3  Shadow Quality         (-X)
//   4  Water Surface          (+Z)
//   5  Geometry Density       (-Z, +X)
//   6  Thin Geometry / AA     (-Z, -X)
// ============================================================

import { Game, Key, Matrix4, Mesh, Model, Mathf, QualityPreset } from '@bornengine/engine';
import type { Camera3D, Color, SceneNode, Vec3 } from '@bornengine/engine';

// HUD colors (0-255 range, matching the BornEngine Color struct)
const WHITE  = { r: 255, g: 255, b: 255, a: 255 };
const LGRAY  = { r: 200, g: 200, b: 200, a: 255 };
const GRAY   = { r: 130, g: 130, b: 130, a: 255 };
// ---- Constants ----

const SCREEN_W = 1280;
const SCREEN_H = 720;
const MOUSE_SENS = 0.003;
const MOVE_SPEED = 8.0;
const SPRINT_MULT = 2.5;
const PI = 3.14159265;
const TWO_PI = 6.28318530;

type ModelReference = { handle: number; meshCount: number; materialCount: number; transform: number[] };

class RendererTestGame extends Game {
  protected override loop(deltaTime: number): void {
    updateCamera(deltaTime);
  }

  protected override render(): void {
    renderScene();
  }
}

let game: RendererTestGame;
let elapsedSeconds = 0;
const managedModels: (Model | Mesh)[] = new Array<Model | Mesh>(16);
const managedNodes: SceneNode[] = new Array<SceneNode>(2048);
let managedModelCount = 0;
let managedNodeCount = 0;

// ---- Headless / spec-driven mode parsing ----
// When launched with `--spec FILE --out FILE`, we skip the interactive
// loop: read the camera from the spec, render N warmup frames (so
// lighting uniforms & framebuffer are populated), capture a screenshot
// to the given path, then exit. This matches how bloom-reference
// renders the same spec, so the two outputs are directly comparable
// via bloom-diff. Without these flags, the app runs as the normal
// interactive walkthrough with F12 screenshots.

let headlessSpecPath = "";
let headlessOutPath = "";
let headlessMode = false;
let headlessCamX = 0.0;
let headlessCamY = 0.0;
let headlessCamZ = 0.0;
let headlessTargetX = 0.0;
let headlessTargetY = 0.0;
let headlessTargetZ = 0.0;
let headlessFov = 45.0;
let headlessResW = 0;
let headlessResH = 0;
// Auto-capture in interactive mode: render the full scene (all zones,
// HUD, the actual interactive path) for N frames, then screenshot and
// exit. Used to programmatically hunt the TAA+bloom corruption that
// only appears with surface presentation.
let interactiveCaptureFrames = 0;
let interactiveCapturePath = "";
let headlessShadows = false;
let shadowMapDumpPath = "";

declare const process: { argv: string[] };
const argv: string[] = process.argv;
for (let i = 2; i < argv.length; i = i + 1) {
  if (argv[i] === "--spec" && i + 1 < argv.length) {
    headlessSpecPath = argv[i + 1];
    headlessMode = true;
  } else if (argv[i] === "--out" && i + 1 < argv.length) {
    headlessOutPath = argv[i + 1];
  } else if (argv[i] === "--camera" && i + 9 < argv.length) {
    // --camera px py pz tx ty tz fov
    // Primary path for headless mode — avoids JSON array access
    // which has known Perry LLVM backend issues (see Phase 5 notes).
    headlessCamX = parseFloat(argv[i + 1]);
    headlessCamY = parseFloat(argv[i + 2]);
    headlessCamZ = parseFloat(argv[i + 3]);
    headlessTargetX = parseFloat(argv[i + 4]);
    headlessTargetY = parseFloat(argv[i + 5]);
    headlessTargetZ = parseFloat(argv[i + 6]);
    headlessFov = parseFloat(argv[i + 7]);
    headlessMode = true;
  } else if (argv[i] === "--res" && i + 2 < argv.length) {
    // --res W H — overrides the window size for headless captures
    // so validate.sh can match the reference's resolution exactly.
    // Use parseFloat (parseInt has shown odd behavior under Perry's
    // current backend); cast back to int via Math.floor.
    headlessResW = Math.floor(parseFloat(argv[i + 1]));
    headlessResH = Math.floor(parseFloat(argv[i + 2]));
    headlessMode = true;
  } else if (argv[i] === "--interactive-capture" && i + 2 < argv.length) {
    interactiveCaptureFrames = Math.floor(parseFloat(argv[i + 1]));
    interactiveCapturePath = argv[i + 2];
  } else if (argv[i] === "--shadows") {
    headlessShadows = true;
  } else if (argv[i] === "--dump-shadow-map" && i + 1 < argv.length) {
    shadowMapDumpPath = argv[i + 1];
  }
}


// ---- Mesh generation ----

// Compatibility helpers keep the diagnostic scene's procedural geometry easy
// to read while routing every operation through BornEngine's Game-owned API.
function mat4Identity(): number[] { return Matrix4.identity().toArray(); }
function mat4Translate(matrix: number[], offset: Vec3): number[] {
  return new Matrix4(matrix).translated(offset).toArray();
}
function mat4Scale(matrix: number[], scale: Vec3): number[] {
  return new Matrix4(matrix).scaled(scale).toArray();
}
function mat4RotateY(matrix: number[], radians: number): number[] {
  return new Matrix4(matrix).rotatedY(radians).toArray();
}
function clamp(value: number, min: number, max: number): number { return Mathf.clamp(value, min, max); }
function clearBackground(color: Color): void { game.renderer.clear(color); }
function setEnvClearFromHdr(path: string): void { game.renderer.setEnvironmentFromHdr(path); }
function takeScreenshot(path: string): void { game.renderer.screenshot(path); }
function getFPS(): number { return game.renderer.stats.fps; }
function getTime(): number { return elapsedSeconds; }
function isKeyDown(key: number): boolean { return game.input.isKeyDown(key); }
function isKeyPressed(key: number): boolean { return game.input.isKeyPressed(key); }
function getMouseDeltaX(): number { return game.input.getMouseDeltaX(); }
function getMouseDeltaY(): number { return game.input.getMouseDeltaY(); }
function disableCursor(): void { game.input.setCursorCaptured(true); }
function enableCursor(): void { game.input.setCursorCaptured(false); }
function beginMode3D(camera: Camera3D): void { game.renderer.begin3D(camera); }
function endMode3D(): void { game.renderer.end3D(); }
function setFog(r: number, g: number, b: number, density: number, heightReference: number, heightFalloff: number): void {
  game.renderer.setFog({ r: r * 255, g: g * 255, b: b * 255, a: 255 }, density, heightReference, heightFalloff);
}
function setChromaticAberration(strength: number): void { game.renderer.setChromaticAberration(strength); }
function setVignette(strength: number, softness: number): void { game.renderer.setVignette(strength, softness); }
function setFilmGrain(strength: number): void { game.renderer.setFilmGrain(strength); }
function setSunShafts(strength: number, decay: number, r: number, g: number, b: number): void {
  game.renderer.setSunShafts(strength, decay, { r: r * 255, g: g * 255, b: b * 255, a: 255 });
}
function setAutoExposure(enabled: boolean): void { game.renderer.setAutoExposure(enabled); }
function setEnvIntensity(value: number): void { game.renderer.setEnvironmentIntensity(value); }
function setDepthOfField(focusDistance: number, aperture: number): void { game.renderer.setDepthOfField(focusDistance, aperture); }
function setAmbientLight(color: Color, intensity: number): void { game.sceneGraph.setAmbientLight(color, intensity); }
function setDirectionalLight(direction: Vec3, color: Color, intensity: number): void {
  game.sceneGraph.addDirectionalLight(direction, color, intensity);
}
function setShadowsEnabled(enabled: boolean): void { game.sceneGraph.setShadowsEnabled(enabled); }
function enableShadows(): void { setShadowsEnabled(true); }
function dumpShadowMap(path: string): void { game.sceneGraph.dumpShadowMap(path); }
function addDirectionalLight(dx: number, dy: number, dz: number, r: number, g: number, b: number, intensity: number): void {
  game.sceneGraph.addDirectionalLight(
    { x: dx, y: dy, z: dz }, { r: r * 255, g: g * 255, b: b * 255, a: 255 }, intensity,
  );
}
function addPointLight(x: number, y: number, z: number, range: number, r: number, g: number, b: number, intensity: number): void {
  game.sceneGraph.addPointLight(
    { x, y, z }, range, { r: r * 255, g: g * 255, b: b * 255, a: 255 }, intensity,
  );
}
function drawGrid(slices: number, spacing: number): void { game.renderer.drawGrid(slices, spacing); }
function drawText(text: string, x: number, y: number, size: number, color: Color): void {
  game.renderer.drawText(text, { x, y }, size, color);
}
function drawCube(position: Vec3, width: number, height: number, depth: number, color: Color): void {
  game.renderer.drawCube(position, { x: width, y: height, z: depth }, color);
}
function drawModel(reference: ModelReference, position: Vec3, scale: number, tint: Color): void {
  const model = managedModels[reference.handle - 1];
  if (model !== undefined) game.renderer.drawModel(model, position, scale, tint);
}
function createSceneNode(): number {
  const node = game.sceneGraph.createNode();
  managedNodes[managedNodeCount] = node;
  managedNodeCount += 1;
  return managedNodeCount;
}
function sceneNode(handle: number): SceneNode | null { return managedNodes[handle - 1] || null; }
function modelReference(model: Model | Mesh, meshCount: number, materialCount = 0): ModelReference {
  managedModels[managedModelCount] = model;
  managedModelCount += 1;
  return { handle: model.isLoaded ? managedModelCount : 0, meshCount, materialCount, transform: Matrix4.identity().toArray() };
}
function createMesh(vertices: number[], indices: number[]): ModelReference {
  const mesh = new Mesh(game, vertices, indices);
  return modelReference(mesh, 1);
}
function loadModel(path: string): ModelReference {
  const model = new Model(game, path);
  return modelReference(model, model.meshCount, model.materialCount);
}
function attachModelToNode(nodeHandle: number, modelHandle: number, meshIndex = 0): void {
  const node = sceneNode(nodeHandle);
  const model = managedModels[modelHandle - 1];
  if (node !== null && model !== undefined) node.attachModel(model, meshIndex);
}
function setSceneNodeTransform(handle: number, transform: number[]): void { sceneNode(handle)?.setTransform(transform); }
function updateSceneNodeGeometry(handle: number, vertices: number[], indices: number[]): void {
  sceneNode(handle)?.updateGeometry(vertices, indices);
}
function setSceneNodeColor(handle: number, r: number, g: number, b: number, a = 255): void {
  sceneNode(handle)?.setColor({ r, g, b, a });
}
function setSceneNodePbr(handle: number, roughness: number, metalness: number): void {
  sceneNode(handle)?.setPbr(roughness, metalness);
}
function setSceneNodeCastShadow(handle: number, enabled: boolean): void { sceneNode(handle)?.setCastShadow(enabled); }
function setSceneNodeReceiveShadow(handle: number, enabled: boolean): void { sceneNode(handle)?.setReceiveShadow(enabled); }
function setSceneNodeWaterMaterial(handle: number, amplitude: number, speed: number, r: number, g: number, b: number, a: number): void {
  sceneNode(handle)?.setWaterMaterial(amplitude, speed, { r, g, b, a });
}
function setRenderScale(scale: number): void { game.renderer.setRenderScale(scale); }
function setTaaEnabled(enabled: boolean): void { game.renderer.setTaaEnabled(enabled); }
function setUpscaleMode(mode: 'catmull-rom' | 'bilinear'): void { game.renderer.setUpscaleMode(mode); }
function setCasStrength(strength: number): void { game.renderer.setCasStrength(strength); }
function setProfilerEnabled(enabled: boolean): void { game.renderer.setProfilerEnabled(enabled); }
function getProfilerFrameCpuUs(): number { return game.renderer.getProfilerCpuTimeUs(); }
function getProfilerFrameGpuUs(): number { return game.renderer.getProfilerGpuTimeUs(); }
function printProfilerSummary(): void { game.renderer.printProfilerSummary(); }
function setQualityPreset(preset: QualityPreset): void { game.renderer.setQualityPreset(preset); }
function setSsaoEnabled(enabled: boolean): void { game.renderer.setSsaoEnabled(enabled); }
function setSsrEnabled(enabled: boolean): void { game.renderer.setSsrEnabled(enabled); }
function setSsgiEnabled(enabled: boolean): void { game.renderer.setSsgiEnabled(enabled); }

function cubeVertices(width: number, height: number, depth: number): number[] {
  const vertices: number[] = new Array<number>(6 * 4 * 12);
  const halfX = width * 0.5;
  const halfY = height * 0.5;
  const halfZ = depth * 0.5;
  const faces: { normal: Vec3; points: Vec3[] }[] = [
    { normal: { x: 0, y: 0, z: 1 }, points: [{ x: -halfX, y: -halfY, z: halfZ }, { x: halfX, y: -halfY, z: halfZ }, { x: halfX, y: halfY, z: halfZ }, { x: -halfX, y: halfY, z: halfZ }] },
    { normal: { x: 0, y: 0, z: -1 }, points: [{ x: halfX, y: -halfY, z: -halfZ }, { x: -halfX, y: -halfY, z: -halfZ }, { x: -halfX, y: halfY, z: -halfZ }, { x: halfX, y: halfY, z: -halfZ }] },
    { normal: { x: 1, y: 0, z: 0 }, points: [{ x: halfX, y: -halfY, z: halfZ }, { x: halfX, y: -halfY, z: -halfZ }, { x: halfX, y: halfY, z: -halfZ }, { x: halfX, y: halfY, z: halfZ }] },
    { normal: { x: -1, y: 0, z: 0 }, points: [{ x: -halfX, y: -halfY, z: -halfZ }, { x: -halfX, y: -halfY, z: halfZ }, { x: -halfX, y: halfY, z: halfZ }, { x: -halfX, y: halfY, z: -halfZ }] },
    { normal: { x: 0, y: 1, z: 0 }, points: [{ x: -halfX, y: halfY, z: halfZ }, { x: halfX, y: halfY, z: halfZ }, { x: halfX, y: halfY, z: -halfZ }, { x: -halfX, y: halfY, z: -halfZ }] },
    { normal: { x: 0, y: -1, z: 0 }, points: [{ x: -halfX, y: -halfY, z: -halfZ }, { x: halfX, y: -halfY, z: -halfZ }, { x: halfX, y: -halfY, z: halfZ }, { x: -halfX, y: -halfY, z: halfZ }] },
  ];
  let vertexIndex = 0;
  for (const face of faces) {
    for (let index = 0; index < 4; index += 1) {
      const point = face.points[index];
      const offset = vertexIndex * 12;
      vertices[offset] = point.x;
      vertices[offset + 1] = point.y;
      vertices[offset + 2] = point.z;
      vertices[offset + 3] = face.normal.x;
      vertices[offset + 4] = face.normal.y;
      vertices[offset + 5] = face.normal.z;
      vertices[offset + 6] = 1;
      vertices[offset + 7] = 1;
      vertices[offset + 8] = 1;
      vertices[offset + 9] = 1;
      vertices[offset + 10] = index === 1 || index === 2 ? 1 : 0;
      vertices[offset + 11] = index >= 2 ? 1 : 0;
      vertexIndex += 1;
    }
  }
  return vertices;
}
function cubeIndices(): number[] {
  const indices: number[] = new Array<number>(36);
  for (let face = 0; face < 6; face += 1) {
    const base = face * 4;
    const offset = face * 6;
    indices[offset] = base;
    indices[offset + 1] = base + 1;
    indices[offset + 2] = base + 2;
    indices[offset + 3] = base;
    indices[offset + 4] = base + 2;
    indices[offset + 5] = base + 3;
  }
  return indices;
}
function genMeshCube(width: number, height: number, depth: number): ModelReference {
  return createMesh(cubeVertices(width, height, depth), cubeIndices());
}

function makeSphereVertices(radius: number, segs: number, rings: number): number[] {
  const v: number[] = new Array<number>((segs + 1) * (rings + 1) * 12);
  for (let r = 0; r <= rings; r = r + 1) {
    const phi = PI * r / rings;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let s = 0; s <= segs; s = s + 1) {
      const theta = TWO_PI * s / segs;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      const x = sp * ct;
      const y = cp;
      const z = sp * st;
      const offset = (r * (segs + 1) + s) * 12;
      v[offset] = x * radius;
      v[offset + 1] = y * radius;
      v[offset + 2] = z * radius;
      v[offset + 3] = x;
      v[offset + 4] = y;
      v[offset + 5] = z;
      v[offset + 6] = 1;
      v[offset + 7] = 1;
      v[offset + 8] = 1;
      v[offset + 9] = 1;
      v[offset + 10] = s / segs;
      v[offset + 11] = r / rings;
    }
  }
  return v;
}

function makeSphereIndices(segs: number, rings: number): number[] {
  const idx: number[] = new Array<number>(segs * rings * 6);
  for (let r = 0; r < rings; r = r + 1) {
    for (let s = 0; s < segs; s = s + 1) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      const offset = (r * segs + s) * 6;
      idx[offset] = a;
      idx[offset + 1] = b;
      idx[offset + 2] = a + 1;
      idx[offset + 3] = b;
      idx[offset + 4] = b + 1;
      idx[offset + 5] = a + 1;
    }
  }
  return idx;
}

function makePlaneVertices(w: number, d: number): number[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    -hw, 0, -hd,  0, 1, 0,  1, 1, 1, 1,  0, 0,
     hw, 0, -hd,  0, 1, 0,  1, 1, 1, 1,  1, 0,
     hw, 0,  hd,  0, 1, 0,  1, 1, 1, 1,  1, 1,
    -hw, 0,  hd,  0, 1, 0,  1, 1, 1, 1,  0, 1,
  ];
}

function makePlaneIndices(): number[] {
  return [0, 2, 1, 0, 3, 2];
}

// ---- Shared mesh handles (initialized after Game construction) ----

let sphereHandle = 0;
let cubeHandle = 0;

function initSharedMeshes(): void {
  const sv = makeSphereVertices(0.5, 24, 16);
  const si = makeSphereIndices(24, 16);
  sphereHandle = createMesh(sv, si).handle;
  cubeHandle = genMeshCube(1, 1, 1).handle;
}

// ---- Helpers ----

function placeNode(
  modelHandle: number, meshIdx: number,
  px: number, py: number, pz: number,
  sx: number, sy: number, sz: number,
): number {
  const node = createSceneNode();
  attachModelToNode(node, modelHandle, meshIdx);
  let m = mat4Identity();
  m = mat4Translate(m, { x: px, y: py, z: pz });
  m = mat4Scale(m, { x: sx, y: sy, z: sz });
  setSceneNodeTransform(node, m);
  setSceneNodeCastShadow(node, true);
  setSceneNodeReceiveShadow(node, true);
  return node;
}

function placeSphere(
  px: number, py: number, pz: number,
  scale: number,
  cr: number, cg: number, cb: number,
  roughness: number, metalness: number,
): number {
  const node = placeNode(sphereHandle, 0, px, py, pz, scale, scale, scale);
  setSceneNodeColor(node, cr * 255, cg * 255, cb * 255);
  setSceneNodePbr(node, roughness, metalness);
  return node;
}

function placeCube(
  px: number, py: number, pz: number,
  sx: number, sy: number, sz: number,
  cr: number, cg: number, cb: number,
  roughness: number, metalness: number,
): number {
  const node = placeNode(cubeHandle, 0, px, py, pz, sx, sy, sz);
  setSceneNodeColor(node, cr * 255, cg * 255, cb * 255);
  setSceneNodePbr(node, roughness, metalness);
  // Thin horizontal slabs (floors) should receive but not cast
  // shadows — otherwise they fill the shadow map with their own
  // depth and everything reads as "in shadow of the ground".
  if (sy <= 0.3) {
    setSceneNodeCastShadow(node, false);
  }
  return node;
}

// ============================================================
// Zone 1: PBR Material Gallery (centered at origin)
// ============================================================
// 7 columns = roughness steps, 5 rows = different materials.
// This is the single most important zone for renderer quality
// verification. When SSR, GI, or better BRDF lands, the
// difference will be immediately visible on these spheres.

function setupMaterialGallery(): void {
  const roughSteps = [0.05, 0.15, 0.3, 0.45, 0.6, 0.8, 1.0];

  // Row colors [r, g, b] and metalness
  // Metals (metalness=1): reflections, Fresnel, specular color = albedo
  // Dielectrics (metalness=0): diffuse dominant, white specular
  const rows: number[][] = [
    //  R     G     B    metal
    [1.00, 0.76, 0.33, 1.0],  // Gold
    [0.95, 0.64, 0.54, 1.0],  // Copper
    [0.91, 0.92, 0.92, 1.0],  // Silver / Chrome
    [0.80, 0.05, 0.05, 0.0],  // Red plastic
    [0.90, 0.88, 0.82, 0.0],  // White ceramic
  ];

  // Pedestal under the gallery
  placeCube(0, -0.15, 0, 14, 0.3, 10, 0.15, 0.15, 0.17, 0.9, 0.0);

  for (let row = 0; row < 5; row = row + 1) {
    const mat = rows[row];
    for (let col = 0; col < 7; col = col + 1) {
      const x = (col - 3) * 1.8;
      const z = (row - 2) * 1.8;
      placeSphere(x, 0.6, z, 1.0, mat[0], mat[1], mat[2], roughSteps[col], mat[3]);
    }
  }
}

// ============================================================
// Zone 2: Multi-Light Arena (centered at x=28)
// ============================================================
// White/gray objects lit by multiple colored point lights.
// Tests light accumulation, specular from multiple sources,
// shadow interaction. Animated lights orbit the center.

function setupLightArena(): void {
  const cx = 28.0;

  // Central pillar
  placeCube(cx, 2.5, 0, 1.5, 5, 1.5, 0.85, 0.85, 0.85, 0.3, 0.0);

  // Surrounding spheres (white, varying roughness)
  const count = 8;
  for (let i = 0; i < count; i = i + 1) {
    const angle = TWO_PI * i / count;
    const x = cx + Math.cos(angle) * 6;
    const z = Math.sin(angle) * 6;
    const roughness = 0.05 + 0.95 * i / (count - 1);
    placeSphere(x, 0.8, z, 1.4, 0.9, 0.9, 0.9, roughness, 0.0);
  }

  // Floor disc (dark, metallic — to catch reflections when SSR lands)
  placeCube(cx, -0.05, 0, 16, 0.1, 16, 0.05, 0.05, 0.07, 0.1, 1.0);

  // Smaller metallic accents
  placeSphere(cx - 3, 0.5, -3, 0.8, 0.95, 0.93, 0.88, 0.05, 1.0);
  placeSphere(cx + 3, 0.5, 3, 0.8, 1.0, 0.76, 0.33, 0.1, 1.0);
  placeSphere(cx, 0.5, -5, 0.8, 0.95, 0.64, 0.54, 0.15, 1.0);
}

// ============================================================
// Zone 3: Shadow Quality (centered at x=-28)
// ============================================================
// Pillars at different heights, small objects casting fine
// shadows, floating platforms. Tests cascade transitions,
// shadow resolution, PCF quality, contact shadows.

function setupShadowTest(): void {
  // Ground — bright warm-white floor, receive-only
  const floor = placeCube(0, -0.05, 0, 50, 0.1, 50, 0.95, 0.93, 0.88, 0.85, 0.0);
  setSceneNodeCastShadow(floor, false);

  // Central pillar — warm stone
  placeCube(0, 4, 0, 1.5, 8, 1.5, 0.82, 0.78, 0.72, 0.5, 0.0);

  // Surrounding pillars at varying heights
  placeCube(6, 2.5, 0, 1.0, 5, 1.0, 0.85, 0.8, 0.74, 0.4, 0.0);
  placeCube(-5, 1.5, 3, 0.8, 3, 0.8, 0.78, 0.75, 0.7, 0.6, 0.0);
  placeCube(3, 3, -5, 1.2, 6, 1.2, 0.8, 0.76, 0.7, 0.5, 0.0);

  // Spheres
  placeSphere(-3, 1.2, -2, 1.2, 0.9, 0.82, 0.72, 0.3, 0.0);
  placeSphere(4, 0.8, 4, 0.8, 0.95, 0.93, 0.88, 0.1, 1.0);

  // Low wall / bench — casts a long thin shadow
  placeCube(0, 0.5, 7, 8, 1, 0.3, 0.75, 0.72, 0.68, 0.7, 0.0);

  // Fence posts
  for (let i = -4; i <= 4; i = i + 1) {
    placeCube(i * 2, 0.75, -8, 0.1, 1.5, 0.1, 0.6, 0.58, 0.55, 0.5, 1.0);
  }
  // Fence rail
  placeCube(0, 1.4, -8, 8.1, 0.08, 0.08, 0.6, 0.58, 0.55, 0.5, 1.0);
}

// ============================================================
// Zone 4: Water Surface (centered at z=25)
// ============================================================
// Large water plane with objects above and partially submerged.
// Tests water material, and will test reflections, refraction,
// caustics, foam, and volumetric fog when those land.

function setupWater(): void {
  const cz = 25.0;

  // Water plane
  const waterNode = createSceneNode();
  const wv = makePlaneVertices(30, 20);
  const wi = makePlaneIndices();
  updateSceneNodeGeometry(waterNode, wv, wi);
  const wm = mat4Translate(mat4Identity(), { x: 0, y: 0.2, z: cz });
  setSceneNodeTransform(waterNode, wm);
  setSceneNodeWaterMaterial(waterNode, 0.15, 1.5, 26, 77, 128, 153);
  setSceneNodeReceiveShadow(waterNode, true);

  // Rocks / objects sticking out of water
  placeSphere(3, 0.8, cz - 3, 1.5, 0.45, 0.42, 0.4, 0.8, 0.0);
  placeSphere(-4, 0.5, cz + 2, 1.2, 0.5, 0.45, 0.4, 0.9, 0.0);
  placeSphere(6, 1.2, cz + 4, 2.0, 0.4, 0.38, 0.35, 0.7, 0.0);

  // Pillar rising from water
  placeCube(0, 2, cz, 1, 4, 1, 0.55, 0.5, 0.48, 0.4, 0.0);

  // Metallic sphere floating above (for reflection testing)
  placeSphere(0, 4.5, cz, 1.0, 0.95, 0.93, 0.88, 0.05, 1.0);

  // Shore / ground under water extending outward
  placeCube(0, -0.5, cz - 12, 40, 0.1, 8, 0.6, 0.55, 0.45, 0.8, 0.0);
}

// ============================================================
// Zone 5: Geometry Density (centered at x=25, z=-25)
// ============================================================
// 10x10 grid of small objects to stress-test draw calls,
// culling, batching, and future LOD / virtualized geometry.

function setupGeometryDensity(): void {
  const cx = 25.0;
  const cz = -25.0;

  // Ground
  placeCube(cx, -0.05, cz, 22, 0.1, 22, 0.2, 0.22, 0.25, 0.6, 0.0);

  for (let row = 0; row < 10; row = row + 1) {
    for (let col = 0; col < 10; col = col + 1) {
      const x = cx - 9 + col * 2;
      const z = cz - 9 + row * 2;
      const height = 0.5 + Math.sin(row * 1.3 + col * 0.7) * 0.3;

      // Alternate cubes and spheres
      if ((row + col) % 2 === 0) {
        const r = 0.3 + col * 0.07;
        const g = 0.3 + row * 0.07;
        const b = 0.5;
        placeCube(x, height / 2, z, 0.8, height, 0.8, r, g, b, 0.5, 0.0);
      } else {
        const r = 0.5;
        const g = 0.3 + col * 0.07;
        const b = 0.3 + row * 0.07;
        placeSphere(x, height / 2 + 0.25, z, 0.6, r, g, b, 0.4, 0.2);
      }
    }
  }
}

// ============================================================
// Zone 6: Thin Geometry / Anti-Aliasing (centered at x=-25, z=-25)
// ============================================================
// Thin bars at various angles to test aliasing. When TAA,
// MSAA, or TSR lands, improvements will be immediately visible
// on this zone — shimmering and crawling on thin geometry is
// the hardest temporal stability test.

function setupThinGeometry(): void {
  const cx = -25.0;
  const cz = -25.0;

  // Ground
  placeCube(cx, -0.05, cz, 20, 0.1, 16, 0.3, 0.3, 0.32, 0.5, 0.0);

  // Vertical fence posts
  for (let i = 0; i < 20; i = i + 1) {
    const x = cx - 9.5 + i * 1.0;
    placeCube(x, 1.0, cz - 5, 0.06, 2.0, 0.06, 0.35, 0.35, 0.38, 0.4, 1.0);
  }

  // Horizontal fence rail
  placeCube(cx, 1.8, cz - 5, 20, 0.08, 0.08, 0.35, 0.35, 0.38, 0.4, 1.0);
  placeCube(cx, 0.6, cz - 5, 20, 0.08, 0.08, 0.35, 0.35, 0.38, 0.4, 1.0);

  // Diagonal bars (worst case for aliasing)
  for (let i = 0; i < 12; i = i + 1) {
    const x = cx - 5.5 + i * 1.0;
    const node = createSceneNode();
    attachModelToNode(node, cubeHandle, 0);
    setSceneNodeColor(node, 153, 153, 158);
    setSceneNodePbr(node, 0.3, 1.0);
    setSceneNodeCastShadow(node, true);
    setSceneNodeReceiveShadow(node, true);
    let m = mat4Identity();
    m = mat4Translate(m, { x: x, y: 1.5, z: cz + 2 });
    m = mat4RotateY(m, 0.3 + i * 0.15);
    m = mat4Scale(m, { x: 0.05, y: 3.0, z: 0.05 });
    setSceneNodeTransform(node, m);
  }

  // Grid of very thin wires (subpixel test)
  for (let i = 0; i < 30; i = i + 1) {
    const x = cx - 7 + i * 0.5;
    placeCube(x, 1.0, cz + 6, 0.02, 2.0, 0.02, 0.7, 0.7, 0.72, 0.2, 1.0);
  }
}

// ============================================================
// Ground plane & sky reference objects
// ============================================================

function setupGround(): void {
  // Ground plane — sy=0.1 ≤ 0.3, so placeCube auto-disables cast_shadow.
  placeCube(0, -0.3, 0, 120, 0.1, 120, 0.25, 0.27, 0.22, 0.85, 0.0);

  // Bright sphere high up — tests tone mapping / bloom when those land
  placeSphere(0, 20, -10, 3.0, 5.0, 4.8, 4.0, 0.1, 0.0);

  // Dark reference sphere (test shadow/AO in crevices)
  placeSphere(10, 0.5, 10, 1.0, 0.02, 0.02, 0.02, 0.9, 0.0);

  // Mid-gray reference (linear 0.18 — 18% gray card for exposure)
  placeCube(12, 0.75, 10, 1.5, 1.5, 0.1, 0.18, 0.18, 0.18, 0.9, 0.0);
}

// ============================================================
// Zone 7: glTF Reality Check (DamagedHelmet)
// ============================================================
// Canonical Khronos PBR test model. If renderer upgrades look good
// here, they'll look good on real game art. This is where procedural
// cubes/spheres stop being a meaningful test.
//
// Uses immediate-mode drawModel() inside the render loop, matching
// how david/garden render glTF — the scene graph attach path has
// issues we haven't debugged yet.

let gltfModel: ModelReference = { handle: 0, meshCount: 0, materialCount: 0, transform: Matrix4.identity().toArray() };

function setupGltfModel(): void {
  gltfModel = loadModel("assets/DamagedHelmet.glb");
  // Pedestal (still rendered via scene graph)
  placeCube(0, 0.1, -30, 6, 0.2, 6, 0.15, 0.15, 0.17, 0.9, 0.0);
}

// ============================================================
// Camera state
// ============================================================

// Spawn high above zone 3 looking down at the floor. From this
// angle the shadows cast by the pillars appear clearly as
// separate dark streaks on the white floor, rather than joining
// visually onto each pillar's base.
let camX = 0.0;
let camY = 4.0;
let camZ = 16.0;
let camYaw = 0.0;
let camPitch = -0.2;
let cursorLocked = true;
let lookX = 0.0;
let lookY = 0.0;
let lookZ = 0.0;

// Zone teleport positions [x, y, z, yaw]
const zones: number[][] = [
  [0, 4, 16, 0],              // 1: Material gallery
  [28, 4, 16, 0],             // 2: Light arena
  [-28, 4, 16, 0],            // 3: Shadow test
  [0, 6, 40, 0],              // 4: Water
  [25, 6, -14, PI],           // 5: Geometry density
  [-25, 4, -14, PI],          // 6: Thin geometry
  [0, 3.5, -24, PI],          // 7: glTF reality check
];

const zoneNames: string[] = [
  "PBR Materials",
  "Multi-Light",
  "Shadows",
  "Water",
  "Geometry Density",
  "Thin Geo / AA",
  "glTF Reality Check",
];

// ============================================================
// Init
// ============================================================

// Use --res override when provided (validation/CI), otherwise the
// interactive walkthrough size.
const winW = headlessResW > 0 ? headlessResW : SCREEN_W;
const winH = headlessResH > 0 ? headlessResH : SCREEN_H;
game = new RendererTestGame({
  window: { width: winW, height: winH, title: 'BornEngine Renderer Test' },
  targetFps: 60,
});
if (!headlessMode) {
  game.input.setCursorCaptured(true);
}


// Initialize shared meshes (requires engine)
initSharedMeshes();

// In headless mode, seed the clear color from the HDR env map so
// the background color matches the path-traced reference. Proper
// sky rendering (equirect sample per background pixel) comes in a
// follow-up — this first-pass "solid color from env average" already
// closes most of the background-gap RMSE.
// Always load the HDR env map — needed for IBL and for the sky pass
// to render anything other than the default clear color.
setEnvClearFromHdr("assets/outdoor.hdr");

// Build the scene. In headless mode we draw ONLY the glTF model at
// origin so the view matches what bloom-reference renders from the
// same spec. Interactive mode builds all seven zones for walking
// around and eyeballing.
if (headlessMode && headlessShadows) {
  // Shadow headless: isolated shadow scene for clean validation
  setupShadowTest();
} else if (headlessMode) {
  setupGltfModel();
} else {
  setupGround();
  setupMaterialGallery();
  setupLightArena();
  setupShadowTest();
  setupWater();
  setupGeometryDensity();
  setupThinGeometry();
  setupGltfModel();
}

if (!headlessMode || headlessShadows) {
  enableShadows();
}

if (headlessShadows) {
  // Shadow showcase: moderate env so shadows have clear contrast
  setEnvIntensity(0.4);
  setAutoExposure(true);
  setFog(0.72, 0.78, 0.85, 0.004, 0.0, 0.06);
  setVignette(0.15, 0.12);
  setFilmGrain(0.0);
  setChromaticAberration(0.0);
  setSunShafts(0.3, 0.97, 1.0, 0.95, 0.85);
} else if (!headlessMode) {
  setEnvIntensity(0.3);
  setAutoExposure(true);
  setFog(0.65, 0.72, 0.80, 0.02, 0.0, 0.18);
  setVignette(0.35, 0.30);
  setFilmGrain(0.025);
  setChromaticAberration(0.0025);
  setSunShafts(0.6, 0.97, 1.0, 0.92, 0.78);
  // DoF available but disabled — aperture 0 = off.
  // Enable with: setDepthOfField(20.0, 0.003);
  setDepthOfField(0, 0);
}

// ============================================================
// Main loop
// ============================================================

let headlessFrame = 0;
const HEADLESS_WARMUP_FRAMES = 30;

function updateCamera(dt: number): void {
  elapsedSeconds += dt;

  // ---- Camera controls ----

  if (headlessMode) {
    // No input — the spec's camera pose is applied directly below.
  } else if (cursorLocked) {
    camYaw = camYaw - getMouseDeltaX() * MOUSE_SENS;
    camPitch = camPitch - getMouseDeltaY() * MOUSE_SENS;
    camPitch = clamp(camPitch, -1.4, 1.4);
  }

  // Movement
  const speed = isKeyDown(Key.LEFT_SHIFT) ? MOVE_SPEED * SPRINT_MULT : MOVE_SPEED;
  const fwdX = -Math.sin(camYaw);
  const fwdZ = -Math.cos(camYaw);
  const rightX = Math.cos(camYaw);
  const rightZ = -Math.sin(camYaw);

  if (isKeyDown(Key.W) || isKeyDown(Key.UP)) {
    camX = camX + fwdX * speed * dt;
    camZ = camZ + fwdZ * speed * dt;
  }
  if (isKeyDown(Key.S) || isKeyDown(Key.DOWN)) {
    camX = camX - fwdX * speed * dt;
    camZ = camZ - fwdZ * speed * dt;
  }
  if (isKeyDown(Key.A) || isKeyDown(Key.LEFT)) {
    camX = camX - rightX * speed * dt;
    camZ = camZ - rightZ * speed * dt;
  }
  if (isKeyDown(Key.D) || isKeyDown(Key.RIGHT)) {
    camX = camX + rightX * speed * dt;
    camZ = camZ + rightZ * speed * dt;
  }
  if (isKeyDown(Key.SPACE)) {
    camY = camY + speed * dt;
  }
  if (isKeyDown(Key.C)) {
    camY = camY - speed * dt;
  }

  // Cursor toggle
  if (isKeyPressed(Key.TAB)) {
    cursorLocked = !cursorLocked;
    if (cursorLocked) {
      disableCursor();
    } else {
      enableCursor();
    }
  }

  // F12 → screenshot for visual comparison against the reference renderer
  if (isKeyPressed(Key.F12)) {
    takeScreenshot("renderer-test-screenshot.png");
  }

  // Zone teleport (keys 1-7)
  for (let zi = 0; zi < 7; zi = zi + 1) {
    // Key.ONE = 49, Key.TWO = 50, ...
    if (isKeyPressed(49 + zi)) {
      const z = zones[zi];
      camX = z[0];
      camY = z[1];
      camZ = z[2];
      camYaw = z[3];
      camPitch = -0.2;
    }
  }

  // Look target
  lookX = camX + Math.cos(camPitch) * (-Math.sin(camYaw)) * 100;
  lookY = camY + Math.sin(camPitch) * 100;
  lookZ = camZ + Math.cos(camPitch) * (-Math.cos(camYaw)) * 100;

}

function renderScene(): void {
  const t = getTime();
  // Interactive mode: explicit dark clear color matching the spec
  // scenes. Headless mode uses the HDR env average seeded at init
  // time, so we skip clearBackground to preserve that color.
  if (!headlessMode || headlessShadows) {
    clearBackground({ r: 12, g: 14, b: 22, a: 255 });
  }

  // Global lighting — set only outside headless mode. The shared
  // helmet spec (`specs/helmet.json`) has `sun: null`, so the
  // bloom-reference path tracer renders env-only. Adding a sun +
  // ambient here would skew the realtime brighter and warmer than
  // the reference for no good reason during validation.
  if (headlessShadows) {
    setAmbientLight({ r: 140, g: 150, b: 170, a: 255 }, 0.3);
    // ~30° late-afternoon sun — long dramatic shadows
    setDirectionalLight(
      { x: -0.65, y: 0.5, z: 0.35 },
      { r: 255, g: 240, b: 210, a: 255 },
      2.5,
    );
  } else if (!headlessMode) {
    setAmbientLight({ r: 70, g: 80, b: 100, a: 255 }, 0.25);
    // ~45° afternoon sun — shadows roughly pillar-length.
    setDirectionalLight(
      { x: -0.5, y: 0.7, z: 0.3 },
      { r: 255, g: 248, b: 235, a: 255 },
      2.0,
    );
  }

  // Zone 2 animated point lights — irrelevant in headless mode
  // (camera is on the helmet, point lights are 28+ units away with
  // range 18 so they can't reach), and adding them risks unstable
  // diff numbers when light state leaks into the shader's counters.
  if (!headlessMode) {
    const lightRadius = 7.0;
    addPointLight(
      28 + Math.cos(t * 0.8) * lightRadius,
      3.0,
      Math.sin(t * 0.8) * lightRadius,
      18, 1.0, 0.25, 0.08, 4.0
    );
    addPointLight(
      28 + Math.cos(t * 0.8 + 2.09) * lightRadius,
      3.0,
      Math.sin(t * 0.8 + 2.09) * lightRadius,
      18, 0.08, 0.4, 1.0, 4.0
    );
    addPointLight(
      28 + Math.cos(t * 0.8 + 4.19) * lightRadius,
      3.0,
      Math.sin(t * 0.8 + 4.19) * lightRadius,
      18, 0.15, 1.0, 0.25, 4.0
    );

    // Additional warm fill light near shadow zone
    addPointLight(-28, 6, 5, 20, 1.0, 0.9, 0.7, 1.5);
  }

  // 3D rendering. Headless mode uses the spec's camera/fov verbatim
  // and draws the helmet at origin so both renderers see the same
  // transform. Interactive mode uses the FPS camera and zone 7's
  // world-space position.
  if (headlessMode) {
    beginMode3D({
      position: { x: headlessCamX, y: headlessCamY, z: headlessCamZ },
      target: { x: headlessTargetX, y: headlessTargetY, z: headlessTargetZ },
      up: { x: 0, y: 1, z: 0 },
      fovy: headlessFov,
      projection: "perspective",
    });
    // TEMP: visual sanity check — a bright cube at origin. If this
    // shows but the glTF helmet doesn't, the issue is in the glTF
    // model load, not the render pass.
    drawCube({ x: 0, y: 0, z: 0 }, 0.8, 0.8, 0.8, { r: 255, g: 100, b: 100, a: 255 });
    if (gltfModel.handle !== 0) {
      drawModel(gltfModel, { x: 0, y: 0, z: 0 }, 1.0, { r: 255, g: 255, b: 255, a: 255 });
    }
  } else {
    beginMode3D({
      position: { x: camX, y: camY, z: camZ },
      target: { x: lookX, y: lookY, z: lookZ },
      up: { x: 0, y: 1, z: 0 },
      fovy: 60,
      projection: "perspective",
    });
    drawGrid(60, 2.0);
    // Zone 7: glTF helmet drawn in immediate mode
    if (gltfModel.handle !== 0) {
      drawModel(gltfModel, { x: 0, y: 2.5, z: -30 }, 2.0, { r: 255, g: 255, b: 255, a: 255 });
    }
  }
  endMode3D();

  // ---- HUD ---- (skipped in headless — reference never shows text)

  if (!headlessMode) {
    drawText("BornEngine Renderer Test", 10, 10, 22, WHITE);
    drawText("FPS: " + getFPS().toString(), 10, 38, 16, LGRAY);

    drawText("WASD move / Mouse look / Shift sprint / Tab cursor", 10, SCREEN_H - 50, 14, GRAY);
    drawText("Press 1-6 to teleport to zones", 10, SCREEN_H - 30, 14, GRAY);

    // Zone legend
    const legendX = SCREEN_W - 220;
    drawText("Zones:", legendX, 10, 16, LGRAY);
    for (let i = 0; i < 7; i = i + 1) {
      const label = (i + 1).toString() + "  " + zoneNames[i];
      drawText(label, legendX, 32 + i * 20, 14, GRAY);
    }
  }

  // Headless: after warmup frames, capture the frame to --out and
  // exit. Capture after rendering so the platform presenter can flush it.
  if (headlessMode) {
    headlessFrame = headlessFrame + 1;
    if (headlessFrame === HEADLESS_WARMUP_FRAMES && headlessOutPath.length > 0) {
      takeScreenshot(headlessOutPath);
      if (shadowMapDumpPath.length > 0) {
        dumpShadowMap(shadowMapDumpPath);
      }
    }
    if (headlessFrame > HEADLESS_WARMUP_FRAMES) {
      game.stop();
      return;
    }
  } else if (interactiveCaptureFrames > 0) {
    headlessFrame = headlessFrame + 1;
    if (headlessFrame === interactiveCaptureFrames) {
      takeScreenshot(interactiveCapturePath);
    }
    if (headlessFrame > interactiveCaptureFrames) {
      game.stop();
      return;
    }
  }

}

// Game.run owns the native frame loop and orderly resource cleanup.
game.run();
