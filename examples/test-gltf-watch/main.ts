// glTF loader sample for watchOS and native targets.
import { Game, Model } from '@bornengine/engine';

const game = new Game({
  window: { width: 800, height: 600, title: 'BornEngine glTF Watch' },
  targetFps: 30,
});
game.sceneGraph.addDirectionalLight(
  { x: -0.5, y: -0.8, z: -0.3 },
  { r: 255, g: 255, b: 255, a: 255 },
  1.2,
);
// Some watchOS post-processing backends are unavailable; these calls remain
// game-scoped and report whether the current renderer accepted the setting.
game.renderer.setVignette(0.5, 0.3);
// game.renderer.setChromaticAberration(6.0);
// game.renderer.setFilmGrain(0.1);

const buggy = new Model(game, 'assets/Buggy.glb');
const root = game.sceneGraph.createNode({ name: 'Buggy' });
if (buggy.isLoaded) root.attachModel(buggy);

let elapsed = 0;
const camera = {
  position: { x: 0, y: 1, z: 4 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 50,
  projection: 'perspective' as const,
};

game.run({
  update(deltaTime) {
    elapsed += deltaTime;
    const cosine = Math.cos(elapsed * 0.4);
    const sine = Math.sin(elapsed * 0.4);
    const scale = 0.015;
    root.setTransform([
      cosine * scale, 0, sine * scale, 0,
      0, scale, 0, 0,
      -sine * scale, 0, cosine * scale, 0,
      0, -1.5, 0, 1,
    ]);
  },
  render() {
    game.renderer.clear({ r: 20, g: 24, b: 32, a: 255 });
    if (!game.renderer.begin3D(camera)) return;
    game.renderer.end3D();
  },
  onStop: () => game.dispose(),
});
