// ============================================================
// BornEngine Bistro Validation Scene
// ============================================================
// Amazon Lumberyard Bistro — Parisian street corner scene. Different
// profile from Sponza: outdoor lighting dominated by a single sun,
// varied materials (stone, brick, painted wood, glass, fabric awnings,
// metal fixtures, foliage), and long sight lines. A good cross-check
// that the rendering pipeline doesn't over-fit to Sponza's atrium
// geometry and IBL.
//
// Assets aren't shipped with the repo — they total ~1.2 GB. To set
// up this scene, clone zeux/niagara_bistro (MIT-licensed glTF
// conversion of NVIDIA's Bistro) into `assets/`:
//
//   cd examples/bistro
//   git clone https://github.com/zeux/niagara_bistro.git assets
//
// The scene loads `assets/bistro.gltf` (exterior). An interior
// variant `assets/bistrox.gltf` also exists — swap the filename
// below to open that one instead.

import { Game, Key, Matrix4, Model, Mathf } from '@bornengine/engine';

const SCREEN_W = 800;
const SCREEN_H = 450;
const MOUSE_SENS = 0.003;
const MOVE_SPEED = 5.0;
const SPRINT_MULT = 2.5;

// Auto-capture args (matches the sponza examples' CLI)
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
const game = new Game({ window: { width: SCREEN_W, height: SCREEN_H, title: "BornEngine Bistro" }, targetFps: 60 });
game.renderer.setEnvironmentFromHdr("assets/outdoor.hdr");
game.sceneGraph.setShadowsEnabled(true);

// Open-air street scene: the sky is the dominant IBL source. 1.2×
// env intensity gives colourful ambient reflection without washing
// out direct sunlight (now at 3.0 below).
game.renderer.setEnvironmentIntensity(1.2);
game.renderer.setAutoExposure(false);
game.renderer.setManualExposure(1.0);
if (taaOverride === 0) { game.renderer.setTaaEnabled(false); }
if (taaOverride === 1) { game.renderer.setTaaEnabled(true); }

// Warm Parisian haze — cream-white with a slight yellow shift.
// Lower density than the first attempt so distant buildings still
// register texture and colour rather than fading into flat blue fog.
game.renderer.setFog({ r: 0.92 * 255, g: 0.90 * 255, b: 0.84 * 255, a: 255 }, 0.006, 0.0, 0.05);
// Subtle shafts — exterior scene so the sun is usually off-frame or
// clipped by buildings. Lower strength than Sponza's atrium.
game.renderer.setSunShafts(0.25, 0.96, { r: 1.0 * 255, g: 0.94 * 255, b: 0.82 * 255, a: 255 });
game.renderer.setVignette(0.10, 0.30);
game.renderer.setChromaticAberration(0.0005);

// ---- Load Bistro into scene graph ----
// `bistro.gltf` = exterior street corner. Swap to `bistrox.gltf`
// for the interior wine-bar variant.
const bistro = new Model(game, "assets/bistro.gltf");
const identity = Matrix4.identity().toArray();
for (let i = 0; bistro.isLoaded && i < bistro.meshCount; i = i + 1) {
  const node = game.sceneGraph.createNode();
  node.attachModel(bistro, i);
  node.setTransform(identity);
}

// ---- Camera ----
// Matches the preset glTF camera in zeux/niagara_bistro (translation
// -26.43, 3.16, 11.17 aimed toward the bistro façade near the world
// origin). Gives a clean opening frame showing the signature corner
// with the lantern, awning, and cobble street.
let camX = -26.43;
let camY = 3.16;
let camZ = 11.17;
let camYaw = initYaw !== 0.0 ? initYaw : -1.17; // ≈ 67° left of -Z
let camPitch = 0.0;
let cursorLocked = false;

// ---- Main loop ----
game.run({
  update(dt) {
    frameDeltaTime = dt;

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

  },
  render() {

    game.sceneGraph.setAmbientLight({ r: 150, g: 160, b: 180, a: 255 }, 0.3);
    // Parisian afternoon sun — warm, angled slightly from the side.
    // 3.0 intensity gives a stronger sun-to-ambient ratio, matching
    // the Cycles reference's dominant directional light (Cycles uses
    // ~5 W/m² sun vs 1.2× HDR env — our ratio was previously too
    // flat, leaving sunlit and shaded surfaces in a narrow tonal band).
    game.sceneGraph.addDirectionalLight({ x: -0.5, y: 0.75, z: 0.4 }, { r: 255, g: 240, b: 220, a: 255 }, 3.0);
    // Tiny fill from below — same trick as Sponza, keeps overhangs
    // and awnings from bottoming out when SSGI misses them.
    game.sceneGraph.addDirectionalLight({ x: 0.0, y: -1.0, z: 0.0 }, { r: 127.5, g: 140.25, b: 178.5, a: 255 }, 0.4);

    game.renderer.begin3D({
      position: { x: camX, y: camY, z: camZ },
      target: { x: lookX, y: lookY, z: lookZ },
      up: { x: 0, y: 1, z: 0 },
      fovy: 60,
      projection: "perspective",
    });

    game.renderer.end3D();

    // HUD
    game.renderer.drawText("BornEngine Bistro", { x: 10, y: 10 }, 20, { r: 255, g: 255, b: 255, a: 255 });
    const fps = frameDeltaTime > 0 ? 1 / frameDeltaTime : 0;
    const ms = fps > 0.0 ? 1000.0 / fps : 0.0;
    const fpsColor = fps >= 55.0
      ? { r: 120, g: 230, b: 120, a: 255 }
      : fps >= 30.0
        ? { r: 230, g: 220, b: 120, a: 255 }
        : { r: 230, g: 120, b: 120, a: 255 };
    const fpsText = `FPS ${Math.round(fps)}  (${ms.toFixed(1)} ms)`;
    game.renderer.drawText(fpsText, { x: 10, y: 35 }, 16, fpsColor);
    game.renderer.drawText("WASD move / Mouse look / Tab cursor", { x: 10, y: SCREEN_H - 30 }, 14, { r: 180, g: 180, b: 180, a: 255 });

    if (captureFrames > 0) {
      frameCount = frameCount + 1;
      if (frameCount >= captureFrames) {
        game.renderer.screenshot(capturePath);
        game.stop();
      }
    }
  },
  onStop() {
    game.dispose();
  },
});
