# BornEngine TypeScript API Design

BornEngine presents a class-first TypeScript API for building native and Web/WASM games. A `Game` is the ownership boundary for one engine runtime. It creates the host window and exposes the services used by gameplay code:

- `game.window` manages the native window or an embedded host surface.
- `game.renderer` owns drawing commands and render-pass state.
- `game.input` polls devices and creates action maps.
- `game.audio` owns audio playback and resources.
- `game.assets` caches textures and creates preload groups.
- `game.scenes` manages gameplay scenes and lifecycle.
- `game.sceneGraph` is the retained renderer scene. Construct physics with `new PhysicsWorld(game)`; UI, mobile controls, and VFX are also owned by their game-facing instances.

`game.input.createActionMap()` creates a binding map whose `toData()` and `loadData()` methods round-trip keyboard, mouse, gamepad, and touch bindings for rebinding screens.

## Start with a Game

```ts
import { Colors, Game } from '@bornengine/engine';

class ExampleGame extends Game {
  protected override loop(deltaTime: number): void {
    // Advance simulation using elapsed seconds.
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawText('Arena', { x: 24, y: 24 }, 24, Colors.WHITE);
  }
}

const game = new ExampleGame({ window: { title: 'Arena', width: 960, height: 640 } });
if (!game.isReady) console.error(game.error || 'Engine startup failed');

game.run();
```

`Game.run()` owns frame setup and teardown. It calls `update(deltaTime)` and then `render()` once per frame; application code does not call `beginDrawing()` or `endDrawing()`. Native builds use the engine loop, while Web/WASM uses the browser frame scheduler.

## Ownership and lifecycle

Native state is process-global on current targets, so only one active `Game` runtime can exist at a time. A second `Game` reports `isReady === false` and exposes a readable `error`. Dispose the active game before creating another.

Create runtime resources with their owner, for example `new Texture(game, path)`, `new Model(game, path)`, `new PhysicsWorld(game)`, or `new ColyseusClient(game, endpoint)`. The owner checks that resources are used by the correct game. Resources expose `isLoaded` and `error` where loading can fail and an idempotent `dispose()` method when they own native state. `game.dispose()` releases resources still owned by the game.

`game.assets.createGroup(name)` returns a preload batch. Add texture, sound, and music paths before calling `load()`, then inspect group progress and per-entry status. A group keeps references to resources; `AssetManager` or `AudioSystem` remains responsible for disposing them.

```ts
async function preloadBootAssets() {
  const preload = game.assets.createGroup('boot');
  if (preload !== null) {
    preload.addTexture('assets/player.png');
    preload.addSound('assets/jump.wav');
    const result = await preload.load();
    console.log(result, preload.progress, preload.entries);
  }
}
```

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

## Save data

Create storage with an application ID and optional slot. `write`, `read`, `exists`, and `remove` return status objects; check `status === 'unsupported'` on targets without a verified user-data adapter. Storage accepts JSON-safe payloads and keeps game-specific save schemas with the game.

```ts
import { createGameStorage } from '@bornengine/engine';

const saves = createGameStorage('com.example.arena', 'profile-1');
saves.write('settings', { music: 0.7, sfx: 0.9 });
const loaded = saves.read<{ music: number; sfx: number }>('settings');
if (loaded.ok && loaded.value !== null) console.log(loaded.value.music);
```

The built-in adapter currently supports Web through one atomic `localStorage` key per record. It reports `unsupported` on macOS, Windows, Linux, Android, iOS, tvOS, visionOS, and watchOS. It never saves to the working directory or an asset path. JSON-safe World2D documents can be saved directly; custom serializers can pass their JSON text as a string. To persist a 3D `WorldDocument`, pass `WorldData.serialize(document)` so the world's custom serializer is preserved.

Use `InputActionMap.toData()` and `loadData()` to persist rebindable controls. Import validates the complete versioned record before replacing current bindings and suppresses input edges until held controls return to neutral.

```ts
import type { InputActionMapData } from '@bornengine/engine';

const controls = game.input.createActionMap();
controls.bindAction('jump', { kind: 'key', key: 32 });
const storedControls = saves.read<InputActionMapData>('controls');
if (storedControls.ok && storedControls.value !== null) controls.loadData(storedControls.value);
saves.write('controls', controls.toData());
```

## 2D spatial audio

Use the listener shared by the Game and attach an emitter to a `GameObject` in the XY world plane. The emitter maps world `(x, y)` to audio `(x, 0, y)`, follows movement, and controls only the voice it created.

```ts
import { AudioEmitter2D, GameObject } from '@bornengine/engine';

const sound = game.audio.loadSound('assets/waterfall.wav');
const listener = game.audio.listener2D; // follows the active Scene's Camera2D
const waterfall = new GameObject({ position: { x: 40, y: 12, z: 0 } });
const emitter = new AudioEmitter2D(sound, listener, { looping: true, refDist: 2 });
waterfall.addComponent(emitter);
scene.add(waterfall);
emitter.play();
```

Set `listener.setPosition({ x, y })` for an explicit location or call `followCamera()` to resume camera tracking. Disabling an emitter stops its active voice; destroying its object stops and releases that voice without disposing the shared `Sound`.

## Native integration stays behind the facade

BornEngine compiles TypeScript through Perry and calls platform-specific Rust code through FFI. Rust receives scalar values, arrays, and private numeric handles. TypeScript classes remain in TypeScript: a `Texture` stores its native identity privately, checks its owning `Game`, and delegates drawing to `game.renderer`.

This keeps the platform ABI explicit while giving application code stable names, context, and lifecycle. Package root and subpath barrels expose documented classes, types, enums, and constants; native operation adapters are implementation details.

## Choose the right level

Start with `Game`, its services, and resource classes. Use `GameObject`, `GameComponent`, and `GameScene` when gameplay benefits from object identity, transforms, components, and lifecycle callbacks. Use `SceneGraph` for retained renderer nodes, `WorldData` for serialized worlds, and `PhysicsWorld` for simulation. The classes compose with each other and share the same `Game` owner; they are not separate runtimes.
