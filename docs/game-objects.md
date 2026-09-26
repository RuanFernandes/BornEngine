# Game Objects and Scenes

BornEngine gameplay objects are ordinary TypeScript classes. `GameObject` provides a transform, parent/child relationships, component composition, and lifecycle callbacks. `GameScene` organizes objects; `SceneManager` transitions between higher-level `Scene` instances.

## Define an object

```ts
import { Game, GameObject, GameScene } from '@bornengine/engine';

const game = new Game();

class Player extends GameObject {
  speed = 180;

  constructor() {
    super({ name: 'Player', position: { x: 0, y: 0, z: 0 } });
  }

  update(deltaTime: number): void {
    this.transform.position.x += this.speed * deltaTime;
  }
}

const scene = new GameScene(game);
scene.add(new Player());
```

Attach reusable behavior with `GameComponent`. A component can belong to one object at a time. Removing a component or destroying its object runs its destruction lifecycle and releases resources owned by its adapters. Removing an object from a scene only detaches it; it remains reusable until explicitly destroyed.

## Run a scene

```ts
import { Colors, Game, GameObject, GameScene } from '@bornengine/engine';

const game = new Game({ window: { title: 'Scene sample' } });
const scene = new GameScene(game);
scene.add(new GameObject({ name: 'Marker' }));

game.run({
  update(deltaTime) {
    scene.update(deltaTime);
  },
  render() {
    game.renderer.clear(Colors.BLACK);
  },
  onStop: () => game.dispose(),
});
```

`Game.run()` advances platform input/audio/network services. It does not choose how your game structures its gameplay update, so call `scene.update(deltaTime)` or `game.scenes.update(deltaTime)` from the update callback. Use `GameScene` as a direct object container and `Scene` when the scene manager should own activation and transitions:

```ts
import { Game, Scene } from '@bornengine/engine';

const game = new Game();

class MenuScene extends Scene {
  constructor(game: Game) { super(game, { name: 'Menu' }); }
  onEnter(): void { console.log('menu entered'); }
}

game.scenes.changeTo(new MenuScene(game));
```

## Ownership rules

A scene, object adapter, and engine resource must belong to the same `Game`. A scene rejects foreign-owner resources before they reach the native renderer or physics system. Removing an object from a `GameScene` detaches it so it can be reused; call `destroy()` when it should run its destruction lifecycle and release owned adapters. `game.dispose()` is the final fallback for every resource still registered with the game.

Transforms expose local and world-space values, and parenting preserves the child world transform by default. `GameObject` ids identify TypeScript objects only; they are not native renderer or physics handles.
