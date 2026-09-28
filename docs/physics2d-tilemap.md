# Physics2D and tilemaps

`PhysicsWorld2D` is a portable TypeScript fixed-step solver for small 2D games. It supports dynamic, static, and kinematic box or circle bodies, basic collision response, trigger contacts, queries, and per-body collision filters. Shape rotation, joints, continuous collision detection, and polygon colliders are outside this first implementation.

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
