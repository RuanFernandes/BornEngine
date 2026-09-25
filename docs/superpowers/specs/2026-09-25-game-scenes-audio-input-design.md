# Game Scenes, Audio Manager, and Input Actions

## Goal

Add an optional object-oriented layer for scene lifecycle, named audio assets,
and action-based input. Game authors can manage gameplay through classes while
the existing handle-based modules remain available for direct control.

## Existing architecture

`GameObject`, `GameComponent`, and `GameScene` already provide subclassable
gameplay objects, hierarchy, lifecycle callbacks, and explicit adapters. The
renderer scene module separately owns retained scene-node handles and exposes
functions such as `createSceneNode`, `setSceneNodeParent`, and
`setSceneNodeTransform`. `SceneNodeComponent` currently wraps an existing
renderer handle and synchronizes it with a `GameObject` transform.

Audio already has sound/music handles, SFX/music/UI buses, 3D voices, and
per-voice controls. The shared Rust mixer can unload sounds, but TypeScript has
no public unload function; music has no per-asset unload operation. Core input
provides polling for keyboard, mouse, gamepad, and touch. The current gamepad
wrappers do not select a controller by ID.

## Design

Keep the procedural engine API as the low-level foundation. Add classes in
TypeScript that compose the existing systems and pass only handles and
primitive values through native boundaries.

The initial scene policy is one active scene at a time. Changing scenes exits
and unloads the current scene before activating the replacement. There is no
retained scene stack or push/pop behavior in this version.

### Scene and SceneManager

Export `Scene` from `@bornengine/engine/game` as a subclass of `GameScene`.
This preserves all current update, hierarchy, physics-sync, and destruction
semantics. Add `addNode<T extends GameObject>(node: T): T | null` as an OOP
alias for `add`, so user subclasses keep their concrete type:

~~~ts
class Player extends GameObject {}

class LevelOne extends Scene {
  onEnter(): void {
    this.addNode(new Player({ name: 'Player' }));
  }
}

const scenes = new SceneManager();
scenes.changeTo(new LevelOne());
runGame((dt) => scenes.update(dt));
~~~

`Scene` provides `onEnter`, `onPause`, `onResume`, `onExit`, and `onUnload`
hooks, plus an idempotent `unload()` operation. Its state is `ready`, `active`,
`paused`, or `unloaded`. `pause` and `resume` preserve the scene and its
renderer nodes; they stop or resume gameplay updates without pausing rendering.
Calling `unload()` from inside one of these lifecycle hooks returns `false`,
and `destroy()` is a no-op there; manager transitions requested from lifecycle
hooks are also rejected to keep callbacks ordered.
A scene can own additional resources through `own(resource)`. On each manager
tick while a scene is active or paused, `SceneManager.update(dt)` calls
`update(dt)` on owned resources that implement it. It updates game objects
only while the scene is active. This lets a scene-owned `SoundManager` advance
cooldowns and music streams without a second loop hook, including while
gameplay is paused. If an owned resource changes scenes during its update, the
manager does not continue ticking the unloaded scene. A manager kept outside
the scene is updated by the caller.
Unload calls exit/unload hooks while its objects and resources are still
available, destroys its `GameObject` roots (thereby running component cleanup),
then disposes owned resources in reverse registration order. Calling
`destroy()` on a `Scene` has the same cleanup semantics as `unload()`.
`own()` rejects a resource instance already owned by this or another scene.

Objects added before activation keep `GameScene` semantics: their `onAwake`
runs when `addNode` attaches them. `onEnter` runs when the manager activates
the scene. Objects added inside `onEnter` awaken immediately as they are
attached.

`SceneManager` exposes `currentScene`, `changeTo`, `pause`, `resume`, `update`,
`updateFixed`, physics synchronization delegates, and `unloadCurrent`. It
validates the replacement before unloading the current scene. Passing the
current scene again is a successful no-op. `pause()` only succeeds from
`active`, and `resume()` only succeeds from `paused`; each changes the state
before invoking its hook. A scene can be entered once; an
unloaded scene cannot be reactivated, and one scene cannot be managed by two
managers at once. `onEnter` runs once after the manager publishes the new
current scene; `onExit` runs when an active or paused scene leaves; `onUnload`
runs once for every scene being unloaded, including one that was never
activated. A transition requested while a lifecycle transition is already
running returns `false`; a transition requested during `update` or `updateFixed`
takes effect immediately, and the replacement starts updating on the next
manager tick. The manager never steps a physics world,
opens a render pass, or takes over `runGame`; game code keeps those explicit
steps in its loop. The transition order is: validate replacement, destroy the
previous scene (exit hook, unload hook, objects, then owned resources), publish
the replacement as current, mark it active, and call its enter hook. `pause`,
`resume`, and `unloadCurrent` use the same reentrancy guard. While paused,
game-object updates, fixed-update, and physics-sync delegates do nothing; owned
resource updates continue. Game code must also skip its own `physics.step` call
if it wants the simulation paused.
If the current scene is unloaded directly, `currentScene` reports `null` on the
next query and the manager accepts a fresh scene.

The intended TypeScript surface is:

~~~ts
export type SceneState = 'ready' | 'active' | 'paused' | 'unloaded';

export interface SceneOptions { name?: string; }
export interface SceneOwnedResource {
  update?(dt: number): void;
  dispose(): void;
}

export class Scene extends GameScene {
  constructor(options?: SceneOptions);
  readonly name: string;
  readonly state: SceneState;
  addNode<T extends GameObject>(node: T): T | null;
  own<T extends SceneOwnedResource>(resource: T): T | null;
  unload(): boolean;
  onEnter(): void;
  onPause(): void;
  onResume(): void;
  onExit(): void;
  onUnload(): void;
}

export class SceneManager {
  readonly currentScene: Scene | null;
  changeTo<T extends Scene>(scene: T): boolean;
  pause(): boolean;
  resume(): boolean;
  update(dt: number): void;
  updateFixed(fixedDt: number): void;
  syncPhysicsBeforeStep(world: WorldHandle, fixedDt: number): void;
  syncPhysicsAfterStep(world: WorldHandle): void;
  unloadCurrent(): boolean;
}
~~~

`Scene.destroy()` overrides the base method and uses the same idempotent
cleanup path as `unload()`.

### OOP renderer nodes

Extend `SceneNodeComponent` with a `create()` factory for an engine-owned node and
instance methods for common renderer operations such as visibility, material
color/PBR, texture, and model attachment. Preserve the current constructor that
wraps a caller-supplied handle, with borrowed ownership as its default. The
component continues to take its transform and parent from its owning
`GameObject`; callers do not set a second independent transform on the
renderer node.

The factory returns an owned empty node. The existing handle-based constructor
continues to default to borrowed ownership. Instance methods return `this` for
fluent configuration and do not create additional renderer handles.

The proposed additions are:

~~~ts
static create(): SceneNodeComponent | null;
setVisible(visible: boolean): this;
setColor(r: number, g: number, b: number, a?: number): this;
setPbr(roughness: number, metalness: number): this;
setTexture(textureIndex: number): this;
attachModel(model: Model, meshIndex?: number): this;
~~~

`Scene.addNode` accepts `GameObject` instances and subclasses. Rendering is
added to a gameplay object by attaching a `SceneNodeComponent`; a scene does
not accept raw numbers or arbitrary objects without a lifecycle contract.
Existing functions in `@bornengine/engine/scene` remain public and unchanged.
Owned renderer handles are destroyed with their component; borrowed handles
are detached and survive, matching current ownership rules.

### SoundManager

Add an instance-based `SoundManager` in the audio API. It registers effects and
music by caller-provided names, reuses a registration for repeated loads of
the same name and path, and rejects a conflicting path for an existing name.
It offers named play/stop and volume operations, music playback controls,
master/bus gain, and spatial playback that returns the existing voice handle.
Sound options can set the existing bus, reverb send, and low-pass values, a
per-event cooldown, and per-play pitch/volume multiplier ranges. The cooldown
prevents repeated triggers until the configured time has elapsed. `update(dt)`
advances that clock and forwards the existing music-stream update call for
registered music. A scene-owned manager is updated by `SceneManager`; a manager
kept outside a scene is updated by the caller. Each 2D play uses a controllable
voice where the platform supports it so variations affect only that playback.
Targets without controllable 2D voices retain ordinary 2D playback and ignore
the variation ranges. The shared mixer gains a non-spatial voice entry point;
existing voice volume and pitch controls apply to that handle.

`SoundManager.dispose()` stops playback it owns and unloads its registered
sound and music handles. It does not initialize or close the global audio
device. Add public low-level `unloadSound` and `unloadMusic` functions so
callers outside the manager can also release individual resources. Unloading
music stops its active voice before freeing its generational handle; stale
handles cannot affect a later asset. Unloading a sound removes its routing and
volume settings while voices already playing retain decoded data until they
finish. Declare and register the new native symbols for every supported target,
including Web. `playSoundEx` returns a per-play 2D voice ID where supported;
the manager applies its randomized volume/pitch multipliers to that voice and
falls back to ordinary 2D playback when the target returns no controllable
voice. The manager tracks spatial voice IDs returned by `play3D` so it can stop
them when a named sound stops or the manager is disposed. Starting a named
music track stops the manager's previously active music track; sound/music
handle operations from another manager remain unaffected. Master volume and
bus gains belong to the shared mixer and therefore affect all managers.
Calling `stopMusic()` without a name stops all music registered with this
manager.

A scene may own a `SoundManager` as a disposable resource. Applications may
instead keep one manager outside scenes when music or assets should survive a
scene change. Resource scope is explicit; changing scenes does not close the
global audio device. Handles returned by a manager's `loadSound` and
`loadMusic` are manager-owned; release them through that manager's named unload
methods so its registry cannot retain a stale handle.

The intended TypeScript surface is:

~~~ts
export interface ManagedSoundOptions {
  bus?: number;
  volume?: number;
  reverbSend?: number;
  lowpassHz?: number;
  cooldownSeconds?: number;
  volumeRange?: [number, number];
  pitchRange?: [number, number];
}

export interface ManagedMusicOptions { volume?: number; }
export interface SpatialSoundOptions {
  looping?: boolean;
  refDist?: number;
  maxDist?: number;
  rolloff?: number;
}

export class SoundManager {
  loadSound(name: string, path: string, options?: ManagedSoundOptions): Sound | null;
  loadMusic(name: string, path: string, options?: ManagedMusicOptions): Music | null;
  playSound(name: string): boolean;
  stopSound(name: string): boolean;
  setSoundVolume(name: string, volume: number): boolean;
  unloadSound(name: string): boolean;
  playMusic(name: string): boolean;
  stopMusic(name?: string): boolean;
  setMusicVolume(name: string, volume: number): boolean;
  unloadMusic(name: string): boolean;
  play3D(name: string, position: Vec3, options?: SpatialSoundOptions): number;
  setMasterVolume(volume: number): void;
  setBusGain(bus: number, gain: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function unloadSound(sound: Sound): void;
export function unloadMusic(music: Music): void;
export function playSoundEx(sound: Sound): number;
~~~

Effect and music names are stored in separate registries. Repeating a load
with the same name and path returns the cached handle; a different path under
an existing name returns `null` and leaves the original registration intact.
Options from the first successful load remain in effect. Playback ranges are
inclusive multipliers around the sound's base volume and pitch 1.0; each
defaults to `[1, 1]`. Invalid ranges (non-finite values, negative volume, or
pitch outside the supported 0.25–4 range, or minimum greater than maximum)
reject the load. Cooldown must be finite and non-negative. A cooldown of zero
disables rate limiting; cooldown is shared by 2D and 3D plays of that named
effect and advances only through `update(dt)`. Each play samples its ranges
with the engine's `randomFloat`. Named unload operations stop the named playback,
free the asset, and remove its registry entry. The manager returns `false` for
an unknown name, an unloaded asset, or a play blocked by cooldown. Disposed
managers reject new loads and playback operations.

### InputActionMap

Add an `InputActionMap` to a new `@bornengine/engine/input` subpath. An instance
binds names to one or more keyboard, mouse, gamepad-button, or touch-region
bindings and defines named axes from negative/positive bindings with optional
gamepad-axis input. Multiple digital bindings for one action are combined as
an OR. Axis values are clamped to `[-1, 1]`; digital and analog input can be
combined. Binding names must be non-empty; invalid device indices, rectangles,
scales, or deadzones are rejected without replacing an existing binding.

The caller invokes `update()` once per frame before querying the map. Queries
read the latest completed snapshot and do not poll hardware themselves. The map
then exposes `isDown`, `wasPressed`, `wasReleased`, `readAxis`, and
`readVector2`; it also supports adding, removing, and clearing bindings at
runtime. Edge queries are derived from the map's prior and current snapshots,
including for touch-region bindings. Bindings are plain data and can be saved
by a game, but automatic file persistence and a rebinding UI are out of scope.
Changing an action's bindings resets its edge snapshot so a key that was
already held before the rebind does not create a phantom `wasPressed` event;
the next update adopts the new physical state as its baseline. Axis digital
contribution is positive-held minus negative-held, so holding both directions
cancels them. A gamepad-axis deadzone is rescaled from its threshold to full
range before `scale` is applied.
Gamepad bindings use the engine's current primary-controller behavior because
the low-level API does not yet route reads by gamepad ID.

The intended TypeScript surface is:

~~~ts
export type ActionButtonBinding =
  | { kind: 'key'; key: number }
  | { kind: 'mouse'; button: number }
  | { kind: 'gamepad'; button: number }
  | { kind: 'touch-region'; rect: Rect };

export interface ActionAxisBinding {
  negative?: ActionButtonBinding[];
  positive?: ActionButtonBinding[];
  gamepadAxis?: { axis: number; scale?: number; deadzone?: number };
}

export class InputActionMap {
  bindAction(name: string, bindings: ActionButtonBinding | ActionButtonBinding[]): boolean;
  unbindAction(name: string): boolean;
  bindAxis(name: string, binding: ActionAxisBinding): boolean;
  unbindAxis(name: string): boolean;
  clear(): void;
  update(): void;
  isDown(name: string): boolean;
  wasPressed(name: string): boolean;
  wasReleased(name: string): boolean;
  readAxis(name: string): number;
  readVector2(horizontal: string, vertical: string): Vec2;
}
~~~

`bindAction` appends bindings that are not semantically identical to existing
bindings; `bindAxis` replaces the named axis. Action and axis names use
separate namespaces. A touch-region binding is down while any active touch is
inside its rectangle in the coordinate space returned by the engine's
touch-position functions. A gamepad axis contribution is multiplied by
`scale`, defaults to 1, and passes through a deadzone that defaults to 0.15:
values inside it become zero, and the remaining range is rescaled to `[0, 1]`
before preserving sign and applying scale. The final value is combined with
digital contributions and clamped to `[-1, 1]`. `readVector2` returns the
horizontal and vertical values without normalizing diagonal input.

The low-level `isKeyDown`, mouse, gamepad, touch, and mobile virtual-control
APIs remain available. `InputActionMap` does not take over frame ownership or
install hidden global callbacks.

## Compatibility and boundaries

- Keep existing imports and behavior for `GameScene`, `SceneNodeComponent`,
  `@bornengine/engine/scene`, `@bornengine/engine/audio`, and `@bornengine/engine/core`.
- Export `Scene`, `SceneManager`, and renderer-component additions from
  `@bornengine/engine/game`; export `SoundManager` and individual unload
  functions from the audio API; add `@bornengine/engine/input` for
  `InputActionMap`.
- Keep all new class instances in Perry-compiled TypeScript. FFI receives only
  numeric handles, scalar settings, and existing plain transform/input data.
- Preserve asynchronous and native ownership constraints from the existing
  audio, renderer, physics, and mobile systems.
- Update API documentation with imports, lifecycle order, loop integration,
  ownership rules, action snapshots, and the distinction between the OOP layer
  and the low-level functions.

## Failure behavior

Invalid scene changes, duplicate object attachment, unknown audio names, and
invalid action bindings return `false` or `null` and leave the prior state
unchanged. Releasing a resource or unloading a scene is idempotent. Queries
for an unknown input action return `false` or zero. A missing/unreadable audio
asset returns `null`; it must not register handle zero as a valid asset.

## Acceptance criteria

1. A user can subclass `Scene`, add a `GameObject` subclass with `addNode`,
   change the active scene, pause/resume it, and unload all owned objects and
   resources in a deterministic order.
2. A user can create an owned renderer node through `SceneNodeComponent`, set
   material/visibility through instance methods, and have its transform follow
   the owning `GameObject`; the old handle constructor still compiles.
3. A `SoundManager` can register and play named effects/music, limit rapid
   repeats, vary per-play pitch/volume where controllable voices are supported,
   configure buses and spatial voices, then unload its assets without closing
   audio used by other managers.
4. A user can bind an action to multiple devices, query stable press/hold/release
   states after one `update()` per frame, read a digital/analog axis, and change
   bindings at runtime.
5. Existing function-based APIs and the current GameObject runtime remain
   compatible.
6. Every supported Perry target exposes the required native audio symbols,
   with unsupported controllable-voice features using the documented fallback.

## Review focus

- Reentrant scene changes requested from `onEnter`, update, or teardown hooks
  must not unload the replacement or dispatch callbacks out of order.
- Scene-owned resources must be disposed once in reverse order, after object
  component cleanup, even when unload is requested more than once.
- Unloading a currently playing music handle must stop its voice and prevent
  stale handles from targeting a later asset.
- `wasPressed` and `wasReleased` must be stable when several physical bindings
  overlap, when a binding changes during a frame, and when touch slots are
  sparse.
- Scene-node parenting must apply a `GameObject` transform once, preserve
  borrowed/owned lifetime semantics, and not leak class instances across FFI.

## Non-goals

Scene stacks, additive loading, cross-fades, asset bundles, save-game
serialization, automatic editor integration, networking, a global singleton
for audio or input, and automatic integration with `runGame` are deferred.
