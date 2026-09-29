# Physics2D and tilemaps

`PhysicsWorld2D` is a portable TypeScript fixed-step solver for small 2D games. It supports dynamic and kinematic boxes/circles, static boxes/circles/segments/convex polygons, collision response, trigger contacts, queries, and per-body collision filters. Shapes are axis aligned or specified by local vertices. Joints, rotational dynamics, and dynamic polygon bodies are outside this solver.

```ts
import { Game, GameObject, Scene } from '@bornengine/engine';
import { PhysicsWorld2D } from '@bornengine/engine/physics2d';

class Level extends Scene {
  readonly physics: PhysicsWorld2D;
  readonly player: GameObject;

  constructor(game: Game) {
    super(game, { name: 'Level' });
    this.physics = this.own(new PhysicsWorld2D(game, {
      gravity: { x: 0, y: 900 },
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    }))!;

    this.player = new GameObject({ position: { x: 100, y: 60, z: 0 } });
    this.player.addComponent(this.physics.createBody({
      type: 'dynamic',
      shape: { type: 'box', width: 24, height: 30 },
      friction: 0.4,
    }));
    this.add(this.player);
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    this.physics.step(deltaTime);
  }
}
```

Call `step(deltaTime)` from the active scene's update. The accumulator runs at the configured fixed interval; a long frame is capped at `fixedTimeStep * maxSubSteps`. `droppedTime` reports time beyond that catch-up budget. `Scene.own(world)` releases all its bodies when the scene unloads. The world is not stepped automatically, so pausing a scene also pauses its simulation.

Attach `world.createBody(options)` to a `GameObject` like another component. Dynamic bodies write their simulated x/y position back to the object and preserve its z coordinate. Static and kinematic bodies sample the object's world position before each substep. Set a kinematic body's velocity explicitly with `setVelocity()` when it should impart motion in collisions. Bodies without an object keep their own position and can be used for non-rendered geometry. If an attached object is inactive or detached from a scene, its body is skipped until it becomes active in a scene again. Colliders are axis-aligned; a GameObject's rotation and scale do not rotate or resize its physics shape.

```ts
body.onCollisionEnter = ({ other, normal, point }) => {
  console.log('hit', other.gameObject?.name, normal, point);
};

const hit = physics.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 500);
const nearby = physics.overlapCircle({ x: 80, y: 60 }, 24);
const contacts = physics.popContacts();
```

Body layer and mask values are 31-bit category flags. A pair is accepted only when each body's mask includes the other's layer. Ray and overlap queries take an optional `layerMask` and `includeSensors` object. Contacts are queued until `popContacts()` drains them. Collision and trigger enter, stay, and exit callbacks are oriented from the receiving body.

## Slopes, one-way surfaces, and fast bodies

Static `segment` shapes use two distinct finite local endpoints. Static `convex` shapes require at least three finite vertices in either winding order, with no degenerate edges, concavity, or crossing edges. The body position translates local points into world coordinates. Created shapes and the values returned by `body.shape` are copies, so changing a source vertex or a returned point does not change collision geometry. Dynamic and kinematic bodies continue to use boxes or circles.

```ts
const ramp = physics.createBody({
  type: 'static',
  shape: { type: 'segment', start: { x: -64, y: 32 }, end: { x: 64, y: -32 } },
  position: { x: 320, y: 300 },
});

const bridge = physics.createBody({
  type: 'static',
  shape: { type: 'segment', start: { x: -80, y: 0 }, end: { x: 80, y: 0 } },
  position: { x: 500, y: 250 },
  oneWay: { normal: { x: 0, y: -1 }, tolerance: 0.01 },
});

const projectile = physics.createBody({
  type: 'dynamic',
  shape: { type: 'circle', radius: 4 },
  position: { x: 0, y: 280 },
  velocity: { x: 2400, y: 0 },
  gravityScale: 0,
  ccd: true,
  ccdThreshold: 4,
});
```

The optional `oneWay` setting belongs to a static surface. Its finite nonzero outward normal is normalized at creation; `tolerance` defaults to zero and is measured in world units. A body collides only when its prior support point was on the normal side of the surface within tolerance and its step movement approaches the surface. For a horizontal platform in positive-Y-down coordinates, `{ x: 0, y: -1 }` allows a fall from above and passage upward from below. Use `ccd: true` on a fast dynamic body when it may cross a thin surface in one fixed step. `ccdThreshold` defaults to zero and activates the sweep when that body's travel during a fixed step meets the threshold. CCD takes the earliest static hit, slides along it for the remaining fixed-step time, and repeats for subsequent surfaces. Ordinary bodies use discrete overlap resolution.

Contacts and collision callbacks are ordered by the pair's body creation IDs. When two CCD surfaces are hit at the same time, the earlier created body wins. Contact normals have unit length and point from `bodyA` to `bodyB`; character normals point outward from the obstacle toward the character. `CharacterBody2D.moveAndSlide()` projects remaining motion along a ramp and classifies floor, wall, and ceiling from the contact normal. A slope steeper than 45 degrees is treated as a wall. The fixed-step catch-up cap still applies to CCD bodies, and their threshold is evaluated separately on each fixed step.

## Atlas-backed tilemaps

`Tilemap` is a render component that draws non-empty grid cells through a `SpriteSheet`. It keeps row-major integer tile IDs, with ID 0 reserved for empty cells. Tile definitions can name an atlas frame, mark a full tile as solid, or provide a custom collision rectangle measured from the cell's top-left corner.

```ts
import { SpriteSheet, Texture } from '@bornengine/engine';
import { Tilemap } from '@bornengine/engine/tilemap';

const texture = new Texture(game, 'assets/tiles.png');
const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16, spacing: { x: 1, y: 1 } });
const floor = new Tilemap(sheet, {
  columns: 24,
  rows: 12,
  tileWidth: 16,
  tileHeight: 16,
  tiles: [
    { id: 1, frame: sheet.gridFrame(0, 0)!, solid: true },
    { id: 2, frame: sheet.gridFrame(1, 0)!, collision: { x: 0, y: 8, width: 16, height: 8 } },
  ],
  data: levelData,
});

const mapObject = new GameObject();
mapObject.addComponent(floor);
scene.add(mapObject);

for (const tile of floor.getSolidTiles()) {
  // tile.bounds is in map-local units; create static bodies from those bounds.
}
```

`getSolidTiles()` returns row-major collision rectangles in tilemap-local coordinates. It is data only: when map cells change, update or rebuild their matching physics bodies explicitly. Use unrotated tilemaps for these axis-aligned colliders. The renderer draws visible cells automatically with the scene; the map follows its GameObject's translation, scale, and z rotation.

See [`examples/physics2d-tilemap`](../examples/physics2d-tilemap) for a small scene with a falling body and a solid atlas-backed floor.
