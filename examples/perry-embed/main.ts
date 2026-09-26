// Render BornEngine into a native view owned by a Perry UI host.
// The host owns frame scheduling; Game.runFrame manages each drawing boundary.

import { App, VStack, Text, BloomView, bloomViewGetNativeHandle, onFrame } from 'perry/ui';
import { Colors, Game } from '@bornengine/engine';

const VIEW_W = 820;
const VIEW_H = 480;
const view = BloomView(VIEW_W, VIEW_H);
const game = new Game({
  window: { mode: 'embedded', width: VIEW_W, height: VIEW_H },
});

let attached = false;
let attachAttempted = false;
let elapsed = 0;

const callbacks = {
  update(deltaTime: number) {
    elapsed += deltaTime;
  },
  render() {
    game.renderer.clear({ r: 18, g: 22, b: 34, a: 255 });
    const cameraX = Math.cos(elapsed * 0.6) * 9;
    const cameraZ = Math.sin(elapsed * 0.6) * 9;
    const camera = {
      position: { x: cameraX, y: 6, z: cameraZ },
      target: { x: 0, y: 0.5, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective' as const,
    };
    if (!game.renderer.begin3D(camera)) return;

    game.renderer.drawCube({ x: 0, y: -0.6, z: 0 }, { x: 40, y: 0.4, z: 40 }, { r: 40, g: 50, b: 70, a: 255 });
    const count = 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + elapsed;
      const x = Math.cos(angle) * 4;
      const z = Math.sin(angle) * 4;
      const height = 1.2 + Math.sin(elapsed * 2 + index) * 0.6;
      game.renderer.drawCube(
        { x, y: height * 0.5, z },
        { x: 0.9, y: height, z: 0.9 },
        { r: 120 + index * 14, g: 200 - index * 10, b: 240, a: 255 },
      );
    }
    game.renderer.drawSphere({ x: 0, y: 1.4, z: 0 }, 1.1, { r: 255, g: 210, b: 120, a: 255 });
    game.renderer.end3D();
  },
};

function frame(_timestampMs: number, deltaMs: number): void {
  if (!attached && !attachAttempted) {
    const handle = bloomViewGetNativeHandle(view);
    if (handle !== 0) {
      attachAttempted = true;
      attached = game.window.attachNativeSurface(handle, VIEW_W, VIEW_H);
      if (attached) {
        game.sceneGraph.addDirectionalLight(
          { x: 0.6, y: 0.9, z: 0.4 },
          { r: 255, g: 235, b: 205, a: 255 },
          0.85,
        );
      } else {
        console.error(game.error || 'BornEngine could not attach to the host surface.');
      }
    }
  }

  if (attached) game.runFrame(deltaMs / 1000, callbacks);
  onFrame(frame);
}

onFrame(frame);

App({
  title: 'Perry UI × BornEngine',
  width: 880,
  height: 600,
  body: VStack(10, [
    Text('BornEngine rendering inside a Perry UI app'),
    view,
  ]),
});
