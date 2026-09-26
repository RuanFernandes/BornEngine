import { Colors, Game } from '@bornengine/engine';

const game = new Game({
  window: { width: 800, height: 600, title: 'BornEngine 3D Test' },
  targetFps: 60,
});
const camera = {
  position: { x: 10, y: 10, z: 10 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective' as const,
};

game.run({
  update() {},
  render() {
    game.renderer.clear(Colors.SNOW);
    if (!game.renderer.begin3D(camera)) return;
    game.renderer.drawCube({ x: 0, y: 1, z: 0 }, { x: 2, y: 2, z: 2 }, { r: 200, g: 50, b: 50, a: 255 });
    game.renderer.drawGrid(10, 1);
    game.renderer.end3D();
    game.renderer.drawText('BornEngine 3D Test', { x: 10, y: 10 }, 20, Colors.BLACK);
  },
  onStop: () => game.dispose(),
});
