# BornEngine embedded scripting — v1 design

## Goal

Let a game host user-authored JavaScript behaviors with a small, explicit BornEngine API. The first slice proves that an embedded runtime can execute and interrupt guest code on native and Web/WASM, and lets a behavior read and move only its own `GameObject`.

## Runtime and ownership

- Use `rquickjs` / QuickJS-NG in `native/shared`, with one JavaScript runtime per script component so each component has its own heap, globals, memory limit, and lifecycle.
- `Game` owns a `ScriptRuntime` service. A `ScriptComponent` attached to a `GameObject` owns one guest module. Guest code never receives the host `Game`, renderer, native handles, filesystem, process, or network objects.
- Guest modules are ES modules with one default-exported hooks object: optional `onStart(context)`, `update(context, deltaTime)`, and `onDestroy(context)` functions. v1 has no module loader or dynamic imports; packages contain self-contained JavaScript modules.
- Guest code sees only host functions granted by its explicit capability list. The initial capabilities are `log`, `self.read`, `self.transform.write`, and `self.particles.emit`.
- `ScriptContext` exposes `self.id`, a copied `self.position`, `self.setPosition(x, y, z)`, `self.moveBy(x, y, z)`, `log(message)`, and `particles.emitBurst(count, directionX?, directionY?)`; each method is installed only when its capability is granted. The particle API targets a `ParticleEmitter2D` attached to the same object.
- The host buffers guest commands during a callback and applies them after control returns. Initial commands are transform `moveBy` / `setPosition`, log entries, and a burst through an attached `ParticleEmitter2D`.

## Limits and failures

- Apply configurable heap, stack, and interrupt-check limits to every guest runtime. Invalid configuration, syntax errors, guest exceptions, memory exhaustion, and interrupted loops become status/error data; they do not throw through Perry FFI or stop the host game.
- Omit Node, QuickJS `std`/`os`, filesystem, networking, workers, and module loading from the guest context. Capability denial is enforced by not installing the corresponding host function.
- v1 is an in-process containment layer for accidental or untrusted game content, not a claim of a formally secure boundary against a JavaScript VM vulnerability or a modified multiplayer client. Authoritative servers must still validate actions.
- Native Rust and Web/WASM are required v1 backends. Other platform backends expose an explicit unsupported result until their runtime link is verified; watchOS keeps link-safe stubs.

## Authoring and packaging

- Guest code is JavaScript. BornEngine host code remains TypeScript compiled by Perry.
- A package uses `bornengine.script.json` with `format: "bornengine-script-v1"`, `apiVersion: 1`, one package-relative `.js`/`.mjs` `entry`, and a sorted list of `permissions`.
- `bornengine script check` validates the package manifest, entry path, declared permissions, and module files without executing user code.
- `bornengine script pack` copies only validated declared modules and emits a deterministic script manifest for the game to load.

## Non-goals for v1

- Running TypeScript inside the shipped game, arbitrary npm imports, editor/IDE tooling, multi-entity world mutation, network/file access, authoritative multiplayer gameplay, hot reload, and support claims for every engine target.
- Replacing the existing 3D animation stack or changing `Game`'s frame ownership.
