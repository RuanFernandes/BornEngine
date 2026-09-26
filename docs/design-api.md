# BornEngine TypeScript API Design

BornEngine presents a class-first TypeScript API for building native and Web/WASM games. A `Game` is the ownership boundary for one engine runtime. It creates the host window and exposes the services used by gameplay code:

- `game.window` manages the native window or an embedded host surface.
- `game.renderer` owns drawing commands and render-pass state.
- `game.input` polls devices and creates action maps.
- `game.audio` owns audio playback and resources.
- `game.scenes` manages gameplay scenes and lifecycle.
- `game.sceneGraph` is the retained renderer scene. Construct physics with `new PhysicsWorld(game)`; UI, mobile controls, and VFX are also owned by their game-facing instances.

## Start with a Game

```ts
import { Colors, Game } from '@bornengine/engine';

const game = new Game({ window: { title: 'Arena', width: 960, height: 640 } });
if (!game.isReady) console.error(game.error || 'Engine startup failed');

game.run({
  update(deltaTime) {
    // Advance simulation using elapsed seconds.
  },
  render() {
    game.renderer.clear(Colors.DARKBLUE);
    game.renderer.drawText('Arena', { x: 24, y: 24 }, 24, Colors.WHITE);
  },
  onStop() {
    game.dispose();
  },
});
```

`Game.run()` owns frame setup and teardown. It calls `update(deltaTime)` and then `render()` once per frame; application code does not call `beginDrawing()` or `endDrawing()`. Native builds use the engine loop, while Web/WASM uses the browser frame scheduler.

## Ownership and lifecycle

Native state is process-global on current targets, so only one active `Game` runtime can exist at a time. A second `Game` reports `isReady === false` and exposes a readable `error`. Dispose the active game before creating another.

Create runtime resources with their owner, for example `new Texture(game, path)`, `new Model(game, path)`, `new PhysicsWorld(game)`, or `new ColyseusClient(game, endpoint)`. The owner checks that resources are used by the correct game. Resources expose `isLoaded` and `error` where loading can fail and an idempotent `dispose()` method when they own native state. `game.dispose()` releases resources still owned by the game.

Value-only utilities remain static or plain data. `Vec3`, `Quat`, and `Matrix4` represent values and do not need a game context. This keeps runtime identity on stateful objects while keeping math easy to use and serialize.

## Failures are inspectable

Perry-compiled applications should not rely on catching exceptions from native operations. Startup and resource constructors report failure through `isReady`, `isLoaded`, and `error`; operations that can fail return `false`, `null`, or an empty result. Async operations such as matchmaking return promises and reject when the operation cannot complete.

```ts
import { Game, Texture } from '@bornengine/engine';

const game = new Game();
const player = new Texture(game, 'assets/player.png');
if (!player.isLoaded) {
  console.error(player.error);
  game.dispose();
}
```

## Native integration stays behind the facade

BornEngine compiles TypeScript through Perry and calls platform-specific Rust code through FFI. Rust receives scalar values, arrays, and private numeric handles. TypeScript classes remain in TypeScript: a `Texture` stores its native identity privately, checks its owning `Game`, and delegates drawing to `game.renderer`.

This keeps the platform ABI explicit while giving application code stable names, context, and lifecycle. Package root and subpath barrels expose documented classes, types, enums, and constants; native operation adapters are implementation details.

## Choose the right level

Start with `Game`, its services, and resource classes. Use `GameObject`, `GameComponent`, and `GameScene` when gameplay benefits from object identity, transforms, components, and lifecycle callbacks. Use `SceneGraph` for retained renderer nodes, `WorldData` for serialized worlds, and `PhysicsWorld` for simulation. The classes compose with each other and share the same `Game` owner; they are not separate runtimes.
