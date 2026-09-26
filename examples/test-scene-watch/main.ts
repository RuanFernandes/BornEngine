// Minimal retained-mode scene graph sample for watchOS and native targets.
import { Colors, Game } from '@bornengine/engine';

function cubeVerts(size: number): number[] {
  const verts: number[] = [];
  const faces: [number[], number[]][] = [
    [[0, 0, 1], [1, 1, 1, 1]], [[0, 0, -1], [1, 1, 1, 1]],
    [[1, 0, 0], [1, 1, 1, 1]], [[-1, 0, 0], [1, 1, 1, 1]],
    [[0, 1, 0], [1, 1, 1, 1]], [[0, -1, 0], [1, 1, 1, 1]],
  ];
  const quadUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const cornerFor = (normal: number[], index: number): number[] => {
    if (normal[2] === 1) return [[-size, -size, size], [size, -size, size], [size, size, size], [-size, size, size]][index];
    if (normal[2] === -1) return [[size, -size, -size], [-size, -size, -size], [-size, size, -size], [size, size, -size]][index];
    if (normal[0] === 1) return [[size, -size, size], [size, -size, -size], [size, size, -size], [size, size, size]][index];
    if (normal[0] === -1) return [[-size, -size, -size], [-size, -size, size], [-size, size, size], [-size, size, -size]][index];
    if (normal[1] === 1) return [[-size, size, size], [size, size, size], [size, size, -size], [-size, size, -size]][index];
    return [[-size, -size, -size], [size, -size, -size], [size, -size, size], [-size, -size, size]][index];
  };
  for (const [normal, color] of faces) {
    for (let index = 0; index < 4; index += 1) {
      const point = cornerFor(normal, index);
      verts.push(point[0], point[1], point[2], normal[0], normal[1], normal[2],
        color[0], color[1], color[2], color[3], quadUvs[index][0], quadUvs[index][1]);
    }
  }
  return verts;
}

function cubeIndices(): number[] {
  const indices: number[] = [];
  for (let face = 0; face < 6; face += 1) {
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return indices;
}

const game = new Game({
  window: { width: 800, height: 600, title: 'BornEngine Scene Watch' },
  targetFps: 30,
});
game.sceneGraph.addDirectionalLight(
  { x: -0.5, y: -1, z: -0.3 },
  { r: 255, g: 255, b: 255, a: 255 },
  0.9,
);

const vertices = cubeVerts(1);
const indices = cubeIndices();
const first = game.sceneGraph.createNode({ name: 'Red cube' });
first.updateGeometry(vertices, indices);
first.setColor({ r: 220, g: 60, b: 60, a: 255 });
first.setPbr(0.4, 0);
const second = game.sceneGraph.createNode({ name: 'Blue cube' });
second.updateGeometry(vertices, indices);
second.setColor({ r: 60, g: 160, b: 220, a: 255 });
second.setPbr(0.2, 0.9);

let elapsed = 0;
const camera = {
  position: { x: 0, y: 3, z: 8 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective' as const,
};

game.run({
  update(deltaTime) {
    elapsed += deltaTime;
    const cosine = Math.cos(elapsed);
    const sine = Math.sin(elapsed);
    first.setTransform([
      cosine, 0, sine, 0,
      0, 1, 0, 0,
      -sine, 0, cosine, 0,
      -2, 0, 0, 1,
    ]);
    second.setTransform([
      cosine, 0, -sine, 0,
      0, 1, 0, 0,
      sine, 0, cosine, 0,
      2, 0, 0, 1,
    ]);
  },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.begin3D(camera);
    game.renderer.end3D();
  },
  onStop: () => game.dispose(),
});
