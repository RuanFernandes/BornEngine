/**
 * Perry R3F Bridge Example.
 *
 * The Perry bridge translates React Three Fiber intrinsic descriptions into
 * retained scene nodes. BornEngine owns the native window, frame loop,
 * renderer, lighting, and input around that integration.
 */

import { Colors, Game } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';
import { buildR3FIntrinsic } from 'perry-react-three-fiber';

const game = new Game({
  window: { width: 1280, height: 720, title: 'BornEngine — R3F Bridge Demo' },
  targetFps: 60,
});
game.sceneGraph.setAmbientLight(Colors.WHITE, 0.25);
game.sceneGraph.setShadowsEnabled(true);

// Perry generates these intrinsic descriptions from JSX such as:
// <mesh castShadow receiveShadow>
//   <boxGeometry args={[5, 3, 0.2]} />
//   <meshStandardMaterial color="white" roughness={0.8} />
// </mesh>
buildR3FIntrinsic('mesh', { castShadow: true, receiveShadow: true }, null);
buildR3FIntrinsic('boxGeometry', { args: [5, 3, 0.2] }, null);
buildR3FIntrinsic('meshStandardMaterial', { color: 0xf2f2ee, roughness: 0.8 }, null);

buildR3FIntrinsic('mesh', { castShadow: true, receiveShadow: true }, null);
buildR3FIntrinsic('boxGeometry', { args: [0.2, 3, 4] }, null);
buildR3FIntrinsic('meshStandardMaterial', { color: 0xeeeee8, roughness: 0.8 }, null);

buildR3FIntrinsic('mesh', { receiveShadow: true }, null);
buildR3FIntrinsic('planeGeometry', { args: [10, 10] }, null);
buildR3FIntrinsic('meshStandardMaterial', { color: 0xccccbb, roughness: 0.6 }, null);

buildR3FIntrinsic('directionalLight', {
  position: [5, 10, 3],
  intensity: 0.7,
  color: 0xfffff0,
  castShadow: true,
}, null);

// Scene lighting remains owned by the Game and is refreshed each frame.
game.sceneGraph.onFrame(() => {
  game.sceneGraph.addDirectionalLight(
    { x: 0.5, y: 1, z: 0.3 },
    { r: 255, g: 242, b: 230, a: 255 },
    0.6,
  );
  game.sceneGraph.addDirectionalLight(
    { x: -0.3, y: 0.5, z: -0.7 },
    { r: 204, g: 217, b: 242, a: 255 },
    0.2,
  );
}, 5);

let angle = 0;
const camera: Camera3D = {
  position: { x: 10, y: 6, z: 0 },
  target: { x: 0, y: 1.5, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective',
};

game.run({
  update(deltaTime) {
    angle += deltaTime * 0.2;
    camera.position.x = Math.cos(angle) * 10;
    camera.position.z = Math.sin(angle) * 10;
  },
  render() {
    game.renderer.clear(Colors.SNOW);
    if (game.renderer.begin3D(camera)) {
      game.renderer.drawGrid(20, 1);
      game.renderer.end3D();
    }

    game.renderer.drawText('Perry R3F Bridge Demo', { x: 10, y: 10 }, 20, Colors.DARKGRAY);
    game.renderer.drawText('Retained nodes generated from R3F intrinsics', { x: 10, y: 35 }, 16, Colors.GRAY);
    game.renderer.drawText('Game owns the native loop, input, lighting, and rendering', { x: 10, y: 55 }, 16, Colors.GRAY);
  },
  onStop: () => game.dispose(),
});
