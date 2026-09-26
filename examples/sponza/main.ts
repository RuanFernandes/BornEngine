// ============================================================
// BornEngine Sponza Showcase
// ============================================================
// The Khronos Sponza atrium — industry-standard PBR benchmark.
// 260K triangles, 25 materials, architectural columns + arches.
// Tests: shadows through columns, AO in arches, IBL on marble,
// auto-exposure in bright courtyard vs shadowed corridors.

import { Game, Key, Matrix4, Model, Mathf } from '@bornengine/engine';

const SCREEN_W = 800;
const SCREEN_H = 450;
const MOUSE_SENS = 0.003;
const MOVE_SPEED = 5.0;
const SPRINT_MULT = 2.5;

// Auto-capture args
declare const process: { argv: string[] };
const argv: string[] = process.argv;
let captureFrames = 0;
let capturePath = "";
let frameCount = 0;
let frameDeltaTime = 1 / 60;
let initYaw = 0.0;
let taaOverride = -1; // -1 = default, 0 = force off, 1 = force on
for (let i = 2; i < argv.length; i = i + 1) {
  if (argv[i] === "--capture" && i + 2 < argv.length) {
    captureFrames = Math.floor(parseFloat(argv[i + 1]));
    capturePath = argv[i + 2];
  }
  if (argv[i] === "--yaw" && i + 1 < argv.length) {
    initYaw = parseFloat(argv[i + 1]);
  }
  if (argv[i] === "--taa" && i + 1 < argv.length) {
    taaOverride = parseInt(argv[i + 1]);
  }
}

// ---- Init ----
const game = new Game({ window: { width: SCREEN_W, height: SCREEN_H, title: "BornEngine Sponza" }, targetFps: 60 });
game.renderer.setEnvironmentFromHdr("assets/outdoor.hdr");
game.sceneGraph.setShadowsEnabled(true);

// Sponza ceilings face down = dark IBL. High env_intensity
// compensates for lack of GI bounce.
game.renderer.setEnvironmentIntensity(1.5);
game.renderer.setAutoExposure(true);
if (taaOverride === 0) { game.renderer.setTaaEnabled(false); }
if (taaOverride === 1) { game.renderer.setTaaEnabled(true); }
// Warm indoor haze catches the atrium light. Density kept low so
// corridors don't wash out; height falloff keeps upper-wall detail.
game.renderer.setFog({ r: 0.86 * 255, g: 0.82 * 255, b: 0.72 * 255, a: 255 }, 0.010, 0.0, 0.12);
game.renderer.setSunShafts(0.35, 0.97, { r: 1.0 * 255, g: 0.92 * 255, b: 0.78 * 255, a: 255 });
game.renderer.setVignette(0.25, 0.25);
game.renderer.setChromaticAberration(0.001);

// ---- Load Sponza into scene graph ----
const sponza = new Model(game, "assets/Sponza.glb");
const identity = Matrix4.identity().toArray();
for (let i = 0; sponza.isLoaded && i < sponza.meshCount; i = i + 1) {
  const node = game.sceneGraph.createNode();
  node.attachModel(sponza, i);
  node.setTransform(identity);
}

// ---- Camera ----
// Sponza courtyard center, looking down the main axis
let camX = 0.0;
let camY = 2.0;
let camZ = 0.0;
let camYaw = initYaw;
let camPitch = 0.0;
let cursorLocked = false;

// ---- Main loop ----
game.run({
  update(dt) {
    frameDeltaTime = dt;

    // Camera controls
    if (cursorLocked) {
      camYaw = camYaw - game.input.getMouseDeltaX() * MOUSE_SENS;
      camPitch = camPitch - game.input.getMouseDeltaY() * MOUSE_SENS;
      camPitch = Mathf.clamp(camPitch, -1.4, 1.4);
    }

    const speed = game.input.isKeyDown(Key.LEFT_SHIFT) ? MOVE_SPEED * SPRINT_MULT : MOVE_SPEED;
    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);

    if (game.input.isKeyDown(Key.W) || game.input.isKeyDown(Key.UP))    { camX = camX + fwdX * speed * dt; camZ = camZ + fwdZ * speed * dt; }
    if (game.input.isKeyDown(Key.S) || game.input.isKeyDown(Key.DOWN))   { camX = camX - fwdX * speed * dt; camZ = camZ - fwdZ * speed * dt; }
    if (game.input.isKeyDown(Key.A) || game.input.isKeyDown(Key.LEFT))   { camX = camX - rightX * speed * dt; camZ = camZ - rightZ * speed * dt; }
    if (game.input.isKeyDown(Key.D) || game.input.isKeyDown(Key.RIGHT))  { camX = camX + rightX * speed * dt; camZ = camZ + rightZ * speed * dt; }
    if (game.input.isKeyDown(Key.SPACE))        { camY = camY + speed * dt; }
    if (game.input.isKeyDown(Key.C))            { camY = camY - speed * dt; }

    if (game.input.isKeyPressed(Key.TAB)) {
      cursorLocked = !cursorLocked;
      game.input.setCursorCaptured(cursorLocked);
    }

    const lookX = camX + Math.cos(camPitch) * fwdX * 100;
    const lookY = camY + Math.sin(camPitch) * 100;
    const lookZ = camZ + Math.cos(camPitch) * fwdZ * 100;

    // ---- Rendering ----
  },
  render() {

    game.sceneGraph.setAmbientLight({ r: 160, g: 165, b: 180, a: 255 }, 0.3);
    game.sceneGraph.addDirectionalLight({ x: 0.6, y: 0.8, z: 0.3 }, { r: 255, g: 245, b: 230, a: 255 }, 1.5);
    // Gentle fill from below — safety net for ceilings that SSGI
    // bounce light might not fully reach. Kept very low (0.5) since
    // SSGI now provides natural indirect diffuse bounce from the
    // sunlit floor.
    game.sceneGraph.addDirectionalLight({ x: 0.0, y: -1.0, z: 0.0 }, { r: 127.5, g: 140.25, b: 165.75, a: 255 }, 0.5);

    game.renderer.begin3D({
      position: { x: camX, y: camY, z: camZ },
      target: { x: lookX, y: lookY, z: lookZ },
      up: { x: 0, y: 1, z: 0 },
      fovy: 60,
      projection: "perspective",
    });

    // Scene graph handles all rendering (shadows + PBR). No
    // drawModel needed — it would double-render without shadows.

    game.renderer.end3D();

    // HUD
    game.renderer.drawText("BornEngine Sponza", { x: 10, y: 10 }, 20, { r: 255, g: 255, b: 255, a: 255 });
    const fps = frameDeltaTime > 0 ? 1 / frameDeltaTime : 0;
    const ms = fps > 0.0 ? 1000.0 / fps : 0.0;
    // Color the FPS line based on perf bucket so glances give
    // instant feedback during stress tests.
    const fpsColor = fps >= 55.0
      ? { r: 120, g: 230, b: 120, a: 255 }
      : fps >= 30.0
        ? { r: 230, g: 220, b: 120, a: 255 }
        : { r: 230, g: 120, b: 120, a: 255 };
    const fpsText = `FPS ${Math.round(fps)}  (${ms.toFixed(1)} ms)`;
    game.renderer.drawText(fpsText, { x: 10, y: 35 }, 16, fpsColor);
    game.renderer.drawText("WASD move / Mouse look / Tab cursor", { x: 10, y: SCREEN_H - 30 }, 14, { r: 180, g: 180, b: 180, a: 255 });

    // Auto-capture for automated testing
    if (captureFrames > 0) {
      frameCount = frameCount + 1;
      if (frameCount >= captureFrames) {
        game.renderer.screenshot(capturePath);
        game.stop();
      }
    }
  },
  onStop: () => game.dispose(),
});
