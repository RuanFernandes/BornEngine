---
title: Embedded JavaScript
description: Run capability-limited JavaScript behavior modules next to your game objects.
section: API
order: 36
---

A `ScriptComponent` runs a small JavaScript module, called the guest, next to one `GameObject`. Use it for behavior that content authors or players may supply, such as an enemy routine loaded from a data file. The guest runs in its own QuickJS runtime, a small JavaScript engine, with its own memory and globals, and it can use only the capabilities you grant.

`game.scripting` is the `ScriptRuntime` that every script component of a `Game` belongs to. Scripts are not available on every platform, so read "Platform support and security" at the end of this page before you plan around them. Check `game.scripting.isSupported` at run time.

On native Linux, scripting needs the `scripting` native feature. Add it when you create a project, or add it to `native_features` under `[bornengine]` in `perry.toml`:

```sh
bornengine new MyGame --native-features scripting
```

## Attach a behavior

`new ScriptComponent(runtime, source, options)` takes the runtime from the same `Game` that owns the scene, the module source as a string, and an options object. `options.permissions` lists the capabilities the guest receives. The default is none.

```ts
import { Colors, Game, GameComponent, GameObject, Renderer, Scene, ScriptComponent, Vec3 } from '@bornengine/engine';

const guestSource = `export default {
  onStart(ctx) {
    ctx.log('Started object ' + ctx.self.id);
  },
  update(ctx, deltaTime) {
    ctx.self.moveBy(48 * deltaTime, 0, 0);
  },
};`;

class Square extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawRectangle({ x: position.x, y: position.y, width: 32, height: 32 }, Colors.ORANGE);
  }
}

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'level' });

    const actor = new GameObject({ name: 'Actor', position: new Vec3(40, 200, 0) });
    actor.addComponent(new Square());

    const behavior = new ScriptComponent(game.scripting, guestSource, {
      permissions: ['log', 'self.read', 'self.transform.write'],
    });
    if (behavior.status === 'ready') {
      actor.addComponent(behavior);
    } else {
      console.error('Script not attached:', behavior.error);
      behavior.dispose();
    }
    this.addNode(actor);
  }
}

class ScriptDemo extends Game {
  constructor() {
    super({ window: { title: 'Scripted actor', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Level(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new ScriptDemo().run();
```

How the pieces work:

- The constructor never throws. It loads the module right away and reports problems through `status` and `error`. If the status is `'error'` or `'unsupported'` right after construction, the component has no runtime and cannot be attached: `addNode` returns `null` for an object that carries it.
- The component runs with its object. The guest's `onStart` runs once, before its first `update`. The guest's `update` runs each time the scene updates the component, so your `loop()` must call `this.scenes.update(deltaTime)`. A disabled component or an inactive object does not update.
- When the object is destroyed or its scene unloads, the guest's `onDestroy` runs, if `onStart` ran, and then the runtime is freed. Call `behavior.dispose()` yourself for a component you never attach. It is safe to call more than once. Disposing the `Game` releases every script runtime it owns.
- A component works only with scenes of the `Game` that owns its `ScriptRuntime`.
- `ScriptRuntime` also has `isSupported`, `isDisposed`, `scriptCount` (the components it currently tracks), and `dispose()`.

## Guest module hooks

The guest is a self-contained ES module with a default export object. The export has up to three optional hooks. A hook that is present must be a function.

```js
export default {
  onStart(ctx) {
    ctx.log('Ready: object ' + ctx.self.id);
    ctx.particles.emitBurst(10, 0, -1);
  },
  update(ctx, deltaTime) {
    ctx.self.moveBy(30 * deltaTime, 0, 0);
  },
  onDestroy(ctx) {
    ctx.log('Stopped');
  },
};
```

- `onStart(ctx)` runs once when the component starts.
- `update(ctx, deltaTime)` runs on each scene update. `deltaTime` is in seconds and is limited to the range 0 to 60.
- `onDestroy(ctx)` runs when a started component is destroyed or disposed.
- Hooks must be synchronous. A hook that returns a Promise, such as an `async` function, fails with an error.
- The module has no way to import other modules, and `import` statements fail to load. Put everything in one file.
- Module-level variables and properties of the exported object keep their values between calls. Each component has its own copy.
- `ctx` is built fresh for every callback. Do not store it for later.

`ctx` contains only what the component's permissions allow. The next section lists what each permission adds. Calling a method you were not granted fails, because the method does not exist. In TypeScript helper code, `ScriptContext` describes the shape of `ctx`, with each capability optional.

## Capabilities

Capabilities are denied by default. Each entry in `permissions` adds one group of methods to `ctx`:

| Permission | Guest API | Effect |
| --- | --- | --- |
| `log` | `ctx.log(message)` | Queues a message. The host prints it with `console.log` as `[BornEngine script <id>] message`. Messages are cut at 4096 characters. |
| `self.read` | `ctx.self.id`, `ctx.self.position` | `id` is the object's ID as a string. `position` is a `{ x, y, z }` copy of its world position taken when the callback starts. |
| `self.transform.write` | `ctx.self.setPosition(x, y, z)`, `ctx.self.moveBy(x, y, z)` | Queues a change to the object's world position. Values must be finite numbers within 1,000,000,000 of zero, or the call is ignored. |
| `self.particles.emit` | `ctx.particles.emitBurst(count, directionX?, directionY?)` | Asks the first `ParticleEmitter2D` on the same object for a burst. `count` is capped at 4096. Nothing happens if the object has no such emitter. |

Guest calls do not change the game while the hook runs. They are queued and applied after the hook returns, in order, up to 1024 queued calls per callback. If the hook throws or returns a Promise, everything it queued is discarded. Reading `ctx.self.position` after a `moveBy` in the same callback still returns the position from the start of the callback.

The guest never receives the `Game`, the renderer, native handles, or any other engine service. Node APIs, the QuickJS `std` and `os` modules, files, network access, workers, and module loading are not provided. To trigger the 3D `ParticleSystem`, call it from your own TypeScript; scripts have no access to 3D effects.

## Execution limits and failures

Each component has three limits. Set any of them with `options.limits`:

| Option | Default | Allowed range |
| --- | --- | --- |
| `maxMemoryBytes` | 16 MiB | 64 KiB to 64 MiB |
| `maxStackBytes` | 256 KiB | 16 KiB to 256 KiB |
| `maxInterruptChecks` | 10,000 | 1 to 1,000,000 |

All three must be whole numbers. `DEFAULT_SCRIPT_LIMITS` holds the defaults. The execution budget, `maxInterruptChecks`, counts how often QuickJS stops to check for an interrupt. It is refilled before the module loads and before every hook, so an endless loop in a hook ends with an error instead of freezing the game. The module source must be a non-empty string of at most 1 MiB.

```ts
import { Game, ScriptComponent } from '@bornengine/engine';

function createBehavior(game: Game, source: string): ScriptComponent | null {
  if (!game.scripting.isSupported) return null;

  const behavior = new ScriptComponent(game.scripting, source, {
    permissions: ['self.read'],
    limits: {
      maxMemoryBytes: 8 * 1024 * 1024,
      maxStackBytes: 128 * 1024,
      maxInterruptChecks: 5_000,
    },
  });
  if (behavior.status === 'error') {
    console.error('Script rejected:', behavior.error);
    behavior.dispose();
    return null;
  }
  return behavior;
}

function reportScript(behavior: ScriptComponent): void {
  console.log(behavior.status, behavior.memoryUsed + ' bytes', behavior.lastCallbackMs + ' ms');
  if (behavior.error !== null) console.warn(behavior.error);
}
```

Failures never reach the game as exceptions. They show up on the component:

| `status` | Meaning |
| --- | --- |
| `ready` | The module loaded. No hook has run yet. |
| `running` | `onStart` has run and the component is updating. |
| `error` | Creating, loading, or running the module failed. `error` holds the message. |
| `unsupported` | This target has no script runtime. |
| `disposed` | The component was disposed or its object was destroyed. |

- `error` holds the reason: invalid permissions or limits, a syntax error, an exception thrown by a hook (with the guest stack), `script execution exceeded its instruction budget`, `script exceeded its memory limit`, or a hook that returned a Promise. Guest messages are cut at 1024 bytes.
- After a failure the guest's `update` hook is not called again. Remove the object or call `dispose()`.
- `memoryUsed` is the guest heap in bytes after the latest callback, and `lastCallbackMs` is how long that callback took, including the time to apply its queued calls.
- A failed component stays registered with `game.scripting`, and the inspector keeps listing it, until you dispose or remove it. With `debug: { enabled: true, scripts: true }` in the `Game` options, the inspector's Scripts panel lists each component's owner, status, memory, callback time, and error. See [Debug tools](../debug-ui/) for the build requirements.

## Loading script source

`ScriptComponent` accepts the module source as a string. The engine does not resolve script packages or read a script manifest. You decide how the string reaches the component:

- Embed the source in your TypeScript build. The `scripted-actor` example (`examples/scripted-actor/main.ts`) keeps its module in `scripts/actor.js` and runs a small Node step, `npm run prepare:script`, that writes the source into `src/actor-script.ts` as a string constant. This works on every target that supports scripting.
- Read a text file when the game starts. `game.input.readFile(path)` returns the file's text, or an empty string when it cannot read the file. On Linux the path is relative to the working directory. On Web the file is fetched from the page's server. `ScriptComponent` rejects an empty source, so the failure shows up in `status`.

The BornEngine CLI currently has no `script check` or `script pack` commands. Your project is responsible for validating, loading, or embedding the source. The `bornengine.script.json` file in the example is project metadata only. The CLI does not read it, and the permissions that apply are the ones you pass to `ScriptComponent` in your code.

## Platform support and security

| Target | Scripts available |
| --- | --- |
| Web/WASM | Yes. |
| Linux | Yes, when the game is built with the `scripting` native feature. |
| macOS, Windows, Android, iOS, tvOS, visionOS, watchOS | No. `game.scripting.isSupported` is `false` and components report `unsupported`. |

Check `game.scripting.isSupported` before you offer script-driven content, and keep a path that works without it.

The guest runs inside the game process. The runtime is a containment layer for untrusted or accidental content, with limited capabilities and strict budgets. It is not a security boundary against a flaw in the JavaScript engine, and it does not protect a multiplayer game from a modified client. Do not treat what a guest does as proof that a rule was followed. An authoritative server must still validate every gameplay action.

## Next steps

- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the lifecycle that script hooks follow.
- [Debug tools](../debug-ui/) shows the inspector that lists script components.
- [Sprites](../sprites/) covers `ParticleEmitter2D`, the target of `ctx.particles.emitBurst`.
