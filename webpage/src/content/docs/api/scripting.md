---
title: Embedded JavaScript
description: Attach capability-limited JavaScript behavior modules to BornEngine game objects.
section: API / Scripting
order: 36
---

`Game.scripting` owns embedded JavaScript behaviors. Attach a `ScriptComponent` to a `GameObject` to run a self-contained ES module during that object's lifecycle. Each component gets a private runtime and heap; the guest receives only capabilities that the host explicitly grants.

QuickJS is opt-in for native builds. To include it on Linux, scaffold with `bornengine new MyGame --native-features scripting`, or add `native_features = ["scripting"]` under `[bornengine]` in `perry.toml`, then build with the BornEngine CLI. The default native 2D profile keeps the FFI API but does not compile QuickJS; creation then reports an unsupported runtime. Web/WASM keeps its existing scripting behavior without this native feature. Other native targets may retain an unsupported runtime stub; check `game.scripting.isSupported` before enabling script-driven content.

## Attach a behavior

`ScriptComponent` accepts JavaScript source text and an optional capability list. It must use the `ScriptRuntime` owned by the same `Game` as the target scene.

```ts
import { Game, GameObject, Scene, ScriptComponent } from '@bornengine/engine';

const game = new Game();
const guestSource = `export default {
  onStart(ctx) {
    ctx.log('Player behavior started');
  },
  update(ctx, deltaTime) {
    ctx.self.moveBy(48 * deltaTime, 0, 0);
  },
};`;

if (game.isReady) {
  const player = new GameObject({ name: 'Player' });
  const behavior = new ScriptComponent(game.scripting, guestSource, {
    permissions: ['log', 'self.read', 'self.transform.write'],
  });
  player.addComponent(behavior);

  const scene = new Scene(game, { name: 'Level' });
  scene.add(player);
  game.scenes.changeTo(scene);
}
```

The component becomes active with its `GameObject`. `onStart(ctx)` runs once when the component starts, `update(ctx, deltaTime)` runs each active scene update, and `onDestroy(ctx)` runs when a started component is destroyed or disposed. Delta time is in seconds. The host still advances scene components explicitly from `Game.loop()` using `this.scenes.update(deltaTime)`.

Inspect `behavior.status`, `behavior.error`, `behavior.memoryUsed`, and `behavior.lastCallbackMs` from host TypeScript. Call `behavior.dispose()` if you created a component that will not be attached; it is safe to call more than once. Disposing a `Game` releases its script runtimes.

## Guest module hooks

A guest file is a self-contained JavaScript ES module with a default export object. All hooks are optional. Hooks may be ordinary functions; they receive the capability-filtered context as their first parameter, and `update` also receives `deltaTime`.

```js
export default {
  onStart(ctx) {
    ctx.log('Module ready for object ' + ctx.self.id);
    ctx.particles.emitBurst(10, 0, -1);
  },
  update(ctx, deltaTime) {
    ctx.self.moveBy(30 * deltaTime, 0, 0);
  },
  onDestroy(ctx) {
    ctx.log('Module stopped');
  },
};
```

Module evaluation errors and hook failures are exposed through `status` and `error`; they do not escape through Perry's native boundary. Guest module state remains private to that component's runtime.

## Capabilities

Capabilities are denied by default. The host passes a list to `ScriptComponent`; methods that the list does not grant are not installed in the guest context.

| Capability | Guest API | Effect |
| --- | --- | --- |
| `log` | `ctx.log(message)` | Queue a message for the host logger. |
| `self.read` | `ctx.self.id`, `ctx.self.position` | Read the object's identifier and a copied world-position snapshot. |
| `self.transform.write` | `ctx.self.setPosition(x, y, z)`, `ctx.self.moveBy(x, y, z)` | Queue changes to the owning object's world position. |
| `self.particles.emit` | `ctx.particles.emitBurst(count, directionX?, directionY?)` | Request a burst from a `ParticleEmitter2D` on the same `GameObject`. |

Commands are buffered while guest code runs and applied after a synchronous callback succeeds. Hooks that throw or return a Promise report an error and discard commands queued during that hook. A particle request has no target unless that object owns a `ParticleEmitter2D`. To emit through the existing 3D `ParticleSystem`, call it from trusted host TypeScript; v1 does not give guest scripts 3D VFX access.

The guest does not receive the `Game`, renderer, native resource handles, or other engine services. Node APIs, QuickJS `std` and `os`, filesystem, process, network, workers, dynamic imports, and external module loading are not enabled.

## Execution limits and failures

Each component owns an isolated QuickJS runtime. Default limits are 16 MiB of guest heap, 256 KiB of stack, and 10,000 execution interrupt checks per hook. The host may override these in `limits`; maxima are 64 MiB, 256 KiB, and 1,000,000 checks. The stack maximum is also the default to leave host stack headroom on supported targets; hosts may select a smaller stack. Source is limited to 1 MiB. Hooks must be synchronous. `ScriptComponent` reports invalid limits, syntax errors, runtime failures, memory exhaustion, and interrupted execution as status/error data. Failed components remain visible to the Inspector until disposed or removed.

```ts
const behavior = new ScriptComponent(game.scripting, guestSource, {
  permissions: ['self.read'],
  limits: {
    maxMemoryBytes: 8 * 1024 * 1024,
    maxStackBytes: 128 * 1024,
    maxInterruptChecks: 5_000,
  },
});
```

To inspect scripts during development, enable the optional Dear ImGui panel in the `Game` options:

```ts
const game = new Game({
  debug: { enabled: true, scripts: true },
});
```

The Scripts panel lists each known component's owner, status, guest memory use, most recent callback cost, and current error. It is part of the desktop debug UI and is not available on every target.

## Loading script source

Scripting v1 accepts JavaScript source text in `ScriptComponent`; the engine does not resolve package directories or load a script manifest. The BornEngine CLI currently has no `script check` or `script pack` commands. Your project is responsible for validating, loading, or embedding the source and passing the resulting string to the component. The [scripted actor example](https://github.com/RuanFernandes/BornEngine/tree/main/examples/scripted-actor) keeps a guest `.js` file and uses a small build step to embed its source for Perry.

## Platform support and security

Linux native and Web/WASM are the validated v1 targets. Other native targets and watchOS report scripting as unsupported through `game.scripting.isSupported` until their runtime links are verified. Check this property before offering script-driven content.

This is an in-process containment layer for game content, not a formally secure boundary against a JavaScript VM vulnerability or a modified multiplayer client. Do not treat a guest callback as an authority boundary: multiplayer servers still need to validate gameplay actions.
