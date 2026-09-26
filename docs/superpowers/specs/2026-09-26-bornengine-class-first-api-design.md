# BornEngine Class-First TypeScript API

**Status: proposed for review**  
**Date: 2026-09-26**

## Problem

BornEngine's public TypeScript surface is mostly a large collection of free
functions that operate on unscoped numeric handles. Users must initialize
global state, remember which module owns each handle, pair begin/end calls, and
manually keep related resources together. The optional `GameObject` runtime is
class-based, but it currently sits beside the function-based API rather than
providing the engine's main programming model. Documentation and consumer
examples consequently teach two different shapes.

The project also has useful class-based work on
`feature/game-scenes-audio-input` that is not present on `origin/main`. The
multiplayer example uses that branch's scene and object APIs, while pinning the
engine's current `main` revision. The engine branch, documentation, and example
therefore need to converge as part of this change.

## Goals

1. Make classes and instance methods the only public way to operate the engine.
2. Give each engine service and resource an explicit `Game` context, so state
   and ownership are discoverable from the object that uses them.
3. Keep native FFI functions and numeric handles internal to the TypeScript
   facade; preserve the existing native ABI unless a wrapper cannot otherwise
   express the new API.
4. Integrate the current scene, input-action, and sound-manager work from
   `origin/feature/game-scenes-audio-input` with the current `origin/main`.
5. Migrate the BornEngine documentation and multiplayer example to the new
   API, with one consistent quickstart and migration path.
6. Keep the public TypeScript compatible with Perry's current constraints:
   failures are inspectable through state or return values, and engine code
   must not rely on reachable exceptions or pass TypeScript class instances
   through FFI.

## Non-goals

- Replacing Rust renderer, platform, audio, or physics implementations.
- Changing the binary FFI ABI merely to make the TypeScript facade look more
  object-oriented.
- Adding an ECS, reflection, automatic serialization of user subclasses, or
  implicit network authority.
- Supporting the old public free-function API as a compatibility layer. This is
  an intentional breaking migration.
- Editing the user's dirty `MeuGame` checkout. Its current local changes remain
  intact; the clean multiplayer example is the consuming project in scope.

## API principles

- `Game` is the root context for one engine runtime. It owns the window and
  exposes its renderer, input, audio, and scene services. Native engine state is
  process-global today, so the implementation must document and enforce the
  one-active-runtime constraint rather than imply that multiple independent
  windows can run concurrently.
- Services are reached from their owning context (`game.renderer`,
  `game.input`, `game.audio`, `game.scenes`). They do not depend on imported
  mutable module-level state.
- Engine resources are classes constructed with their owning `Game` and
  released with an idempotent `dispose()` method. Resources report
  `isLoaded`/`error` instead of throwing on native load failure. The owning
  `Game` disposes any still-live resources at shutdown.
- Stateful drawing, input, audio, physics, and window operations are instance
  methods. Pure calculations are value-class instance or static methods.
- Renderer methods are the canonical place for draw commands and render-pass
  state. Renderable resources also expose context-bound conveniences such as
  `texture.draw(...)`; these delegate to the owning renderer and do not
  duplicate renderer state.
- Native FFI declarations, handle registries, and raw handle conversion live
  behind private implementation modules and are not package exports.
- Public failures use `false`, `null`, `isLoaded`, `isReady`, or a queryable
  error string; no public call depends on catching a Perry-compiled exception.

## Proposed entry point and lifecycle

The main entry point creates the engine context and all stateful work flows
through that context:

```ts
import { Colors, Game, GameObject, GameScene, Texture } from '@bornengine/engine';

const game = new Game({
  window: { title: 'Arena', width: 960, height: 640 },
  targetFps: 60,
});

const playerTexture = new Texture(game, 'assets/player.png');
const scene = new GameScene(game);
scene.add(new GameObject({ name: 'Player' }));
game.scenes.changeTo(scene);

game.run({
  update(dt) {
    game.scenes.update(dt);
  },
  render() {
    game.renderer.clear(Colors.NAVY);
    playerTexture.draw({ x: 80, y: 80 });
  },
  onStop() {
    game.dispose();
  },
});
```

`Game` creates and owns its `Window`, exposes `isReady`, `isRunning`, and
an inspectable startup error, and owns the frame boundary used by `run()`. The
runtime invokes `update(dt)` and then `render()` once per frame; it opens and
closes the renderer frame around those callbacks. `stop()` requests loop
shutdown, and `dispose()` is idempotent, releases remaining owned resources,
and closes the engine. `onStop` runs once after an orderly stop or native window
close. On web, where the browser owns the animation loop, applications call
`game.stop()` when they want an orderly stop and final cleanup. The
user-hosted native-surface path remains available through instance methods on
`game.window`; host-driven frames use the same renderer and resource context.

Exact option names may be refined while implementing against Perry, but the
ownership and lifecycle contract above must remain stable. A public example
must not need `initWindow`, `runGame`, `beginDrawing`, or `endDrawing`.

## Public class inventory

| Area | Public owner and representative types | Migration direction |
|---|---|---|
| Application/window/frame loop | `Game`, `Window` | Move initialization, loop, timing, resize, title, fullscreen, embedding, and shutdown onto `Game`/`Window`. |
| Rendering and drawing | `Renderer`, `Camera2D`, `Camera3D`, `Color` | Move shape, text, model, camera-mode, lighting, post-processing, picking, screenshot, and profiler operations onto `game.renderer` or its retained-scene facade. |
| Textures and images | `Texture`, `RenderTexture`, `ImageData` | Constructors load through a `Game`; instance methods own filtering, transforms, mipmaps, `draw(...)`, and disposal. |
| Text and fonts | `Font`, renderer text methods | Font loading, measuring, drawing, and disposal become `Font`/`Renderer` methods. |
| Models and materials | `Model`, `Mesh`, `Material`, `Animation` | Constructors load/compile resources; instances expose their data and release methods; draw and lighting commands live on `Renderer`. |
| Input | `InputSystem`, `InputActionMap`, `Key`, `MouseButton` | Polling, injected host input, clipboard, file dialogs, gamepad, touch, and action state become `game.input` methods. |
| Audio | `AudioSystem`, `Sound`, `Music`, `SoundManager`, `AudioSourceComponent` | Device/mixer controls live on `game.audio`; resource playback and cleanup are instance methods. Preserve named manager, buses, spatial voices, and async/staged loading behavior. |
| Gameplay scenes | `GameScene`/`Scene`, `SceneManager`, `GameObject`, `GameComponent`, `Transform` | Bind scenes and their adapters to a `Game`; keep lifecycle, parenting, activation, and explicit physics-step ordering. |
| Retained renderer scene | `SceneGraph`, `SceneNode`, `Light`, renderer components | Wrap renderer nodes and lighting/picking/post-FX controls; keep this distinct from the gameplay `GameScene`. |
| Physics | `PhysicsWorld`, `RigidBody`, collider classes, `Joint` | World configuration/step/query methods belong to a world instance; bodies, colliders, and joints own their handles and dispose explicitly. |
| Math and collisions | `Vec2`, `Vec3`, `Vec4`, `Quat`, `Matrix4`, `Ray`, `BoundingBox`, `Collision` | Use value classes and static helpers for pure calculations; keep data convertible to primitive fields before FFI. |
| Worlds and prefabs | `WorldData`, `WorldInstance`, `Prefab` | Move load, validate, serialize, instantiate, and terrain operations to the owning data/runtime objects or static pure-data methods. |
| Mobile controls | `VirtualJoystick`, `VirtualButton`, `TouchControls` | Construction and update/draw/reset methods live on objects bound to `game.input` and `game.renderer`. |
| UI and debug UI | `game.ui`, `game.debugUi` | Replace module-level `ui`/`debugUi` command objects with per-game service instances. |
| Multiplayer | `ColyseusClient`, `Room` | Keep the existing client/room class API; register polling with the game update lifecycle so consumers do not call a top-level pump function. |

Enums, immutable constants, option/result interfaces, and structural data types
may remain named exports. Package subpaths remain available as organizational
barrels, but they export classes, types, enums, and constants only. No
operational top-level free-function exports remain from the root or a subpath.

## Ownership and failure behavior

- A `Game` is the owner token for its window, services, and native resources.
  Resources from one game cannot be passed to another game's renderer/audio
  service.
- Constructors that load native resources return a usable class instance even
  when loading fails. The instance exposes `isLoaded === false`, an `error`
  description when available, and a safe no-op/false result from operations
  that require a live native handle.
- `dispose()` is idempotent. Disposing a resource clears its live state and
  releases its native handle once. Game shutdown disposes remaining resources
  in reverse creation order; scenes may also own scoped disposables, with
  idempotence preventing duplicate release.
- A child object/component or adapter can only be attached to one live owner at
  a time. Adapters receive resource instances, not public numeric handles.
- Native handles remain implementation details. If an advanced extension
  boundary proves it needs a handle, it must be an explicitly named unsafe or
  interop API, not a leak into the normal quickstart.

## Integration of existing work

Start from `origin/main` and integrate the code in
`origin/feature/game-scenes-audio-input`: gameplay `Scene`/`SceneManager`,
`InputActionMap`, `SoundManager`, scene-node adapter changes, and their current
behavior. Refactor these APIs to use the new `Game` context and class-only
surface rather than preserving their temporary free-function dependencies.
Keep platform audio behavior and Perry compatibility covered by the existing
implementation constraints. The native FFI manifest remains private behind
the TypeScript classes.

## Breaking migration

- Remove procedural operation exports and function-shaped aliases from the
  package root and all package subpaths in the same release.
- Keep module subpaths but update their exports to the class-oriented owners.
- Treat the release as a breaking pre-1.0 API increment (`0.6.0` from the
  current `0.5.1` package version); update package metadata consistently.
- Replace the old flat-API rationale in `docs/design-api.md` and
  `webpage/src/content/docs/concepts/api-shape.md` with the class-first
  architecture and lifecycle rationale.
- Migrate all public website guides, API references, root README/quickstart,
  migration reference, internal source examples, and the clean multiplayer
  demo. Remove examples that teach the old function API.
- Do not modify the dirty `MeuGame` checkout; its local `README.md`, `main.ts`,
  `package.json`, lockfile, and assets remain untouched as previously agreed.
- The multiplayer demo's engine dependency must resolve to this API revision
  using the repository's normal pinned-dependency policy. Do not commit an
  absolute local path or a guessed/unpublished commit hash.

## Documentation requirements

The documentation must answer, with runnable examples:

1. How to create, configure, run, stop, embed, and dispose `Game`.
2. How `Game` owns resources and what happens after failed loads or disposal.
3. How to draw 2D/3D content through `Renderer`, including textures, text,
   models, render passes, cameras, lighting, screenshots, and profiler access.
4. How to build gameplay with `GameObject`, `GameComponent`, scenes, input
   actions, physics synchronization, and scene-owned resources.
5. How to use `Sound`, `Music`, `SoundManager`, UI, mobile controls, worlds,
   materials, VFX, and Colyseus through instances.
6. How to migrate from 0.5 function calls to 0.6 class instances without
   relying on compatibility aliases.

The root README quickstart and website quickstart must show the same lifecycle
and must build from the documented project directory. API navigation and
coverage metadata must agree with the actual class modules.

## Delivery phases

1. Integrate `origin/main` and `feature/game-scenes-audio-input`; reconcile
   overlapping source/docs edits and preserve the feature branch's intended
   behavior.
2. Implement `Game`, `Window`, renderer, input, and audio context ownership;
   add context-bound resource classes for textures, fonts, models, and related
   renderer resources.
3. Convert scene graph, physics, world, VFX, mobile, UI, debug UI, and
   multiplayer polling operations into class methods; remove public function
   exports and raw handle types where they leak through the package boundary.
4. Migrate the complete public documentation and internal code examples;
   replace the API-shape docs and write the 0.5-to-0.6 migration guide.
5. Migrate `BornEngine-ExampleMultiPlayer`, including its README, client source,
   package manifest, patch, and lockfile. Keep the local `MeuGame` changes
   intact.
6. Review the package export map, Perry native manifest boundary, and every
   remaining public export to confirm the class-only policy is consistent.

## Acceptance criteria

- A new game can be created, rendered, stopped, and disposed through `Game`,
  `Window`, and `Renderer` instances without importing procedural operations.
- Texture, font, model, sound/music, physics, scene graph, world, mobile, and UI
  resources have explicit class ownership and idempotent disposal.
- No package root or public subpath exports operational top-level functions;
  native FFI declarations are not reachable through package exports.
- Existing `GameObject` lifecycle, input action, audio manager, renderer
  adapter, and multiplayer behaviors are preserved under the unified context.
- BornEngine's docs and the multiplayer demo teach only the new API; the demo
  dependency resolves according to the pinned-dependency policy.
- The engine checkout that had a dirty lockfile and all listed local
  `MeuGame` changes remain unmodified.
- Public failure behavior follows Perry constraints and never requires an
  exception to be caught.
