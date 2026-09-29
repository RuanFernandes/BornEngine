import { Colors, Game } from '@bornengine/engine';

class Test3DGame extends Game {
  protected override render(): void {
    this.renderer.clear(Colors.SNOW);
    if (!this.renderer.begin3D(camera)) return;
    this.renderer.drawCube({ x: 0, y: 1, z: 0 }, { x: 2, y: 2, z: 2 }, { r: 200, g: 50, b: 50, a: 255 });
    this.renderer.drawGrid(10, 1);
    this.renderer.end3D();
    this.renderer.drawText('BornEngine 3D Test', { x: 10, y: 10 }, 20, Colors.BLACK);
  }
}

const game = new Test3DGame({
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

game.run();
