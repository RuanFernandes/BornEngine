# Game Scenes and OOP Renderer Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subclassable scenes, one-active-scene transitions, scene-owned resources, and an OOP wrapper for renderer nodes.

**Architecture:** `Scene` extends the existing `GameScene`; `SceneManager` owns transition policy and delegates updates without taking over the game loop or physics step. Scene-owned resources are managed by `Scene`, while `SceneNodeComponent` remains the bridge between `GameObject` transforms and retained scene-node handles.

**Tech Stack:** Perry TypeScript, current GameObject runtime, existing scene-node API, Node docs checks, `perry run` and `perry check`.

**Spec:** `docs/superpowers/specs/2026-09-25-game-scenes-audio-input-design.md` (Scene and SceneManager; OOP renderer nodes)

## Global Constraints

- Keep the procedural engine API as the low-level foundation.
- Keep all new class instances in Perry-compiled TypeScript. FFI receives only numeric handles, scalar settings, and existing plain transform/input data.
- Preserve asynchronous and native ownership constraints from the existing audio, renderer, physics, and mobile systems.
- Existing functions in `@bornengine/engine/scene` remain public and unchanged.
- Update API documentation with imports, lifecycle order, loop integration, ownership rules, action snapshots, and the distinction between the OOP layer and the low-level functions.

## Review Focus

- A transition requested from a lifecycle hook returns `false` without replacing the current scene.
- A transition during `update` or `updateFixed` stops dispatching the unloaded scene and begins the replacement on the next manager tick.
- Repeated unload disposes scene resources once, in reverse order, after GameObject/component cleanup.
- A resource instance owned by one scene cannot be owned by a second scene.
- Owned renderer nodes are destroyed; borrowed handles survive, and a GameObject transform is applied once.

---

### Task 1: Add Scene lifecycle and owned resources

**Files:**
- Create: `src/game/scene.ts`
- Create: `tests/game-runtime/scenes.ts`
- Modify: `src/game/index.ts`

**Interfaces:**
- Consumes: `GameScene`, `GameObject`, and `GameComponent`.
- Produces: `SceneState`, `SceneOptions`, `SceneOwnedResource`, and `Scene extends GameScene` with `addNode`, `own`, `unload`, lifecycle hooks, and `destroy`.

- [ ] **Step 1: Add a failing cleanup-order fixture**

Create `tests/game-runtime/scenes.ts` with these imports, local `expect(value, label)` helper, and test body:

~~~ts
import { GameComponent, GameObject, Scene } from '../../src/game';

function expect(value: boolean, label: string): void {
  if (!value) { console.error('FAIL: ' + label); process.exit(1); }
}
const events: string[] = [];
class ComponentProbe extends GameComponent {
  onDestroy(): void { events.push('component'); }
}
class ObjectProbe extends GameObject {
  onAwake(): void { events.push('awake'); }
  onDestroy(): void { events.push('object'); }
}
class ResourceProbe {
  constructor(private readonly name: string) {}
  dispose(): void { events.push(`dispose:${this.name}`); }
}
class ProbeScene extends Scene {
  onUnload(): void { events.push('unload'); }
}
const scene = new ProbeScene({ name: 'test' });
const actor = new ObjectProbe();
actor.addComponent(new ComponentProbe());
scene.addNode(actor);
const firstResource = new ResourceProbe('first');
scene.own(firstResource);
scene.own(new ResourceProbe('second'));
expect(new Scene().own(firstResource) === null, 'a resource cannot belong to two scenes');
expect(scene.unload(), 'ready scene unloads');
scene.unload();
expect(events.join(',') === 'awake,unload,object,component,dispose:second,dispose:first',
  'cleanup order is stable and idempotent');
const destroyAlias = new Scene();
destroyAlias.destroy();
expect(destroyAlias.state === 'unloaded', 'destroy uses the same terminal cleanup path');
~~~

- [ ] **Step 2: Run the fixture to confirm it fails**

Run: `perry run macos tests/game-runtime/scenes.ts`

Expected: it fails to compile because `Scene` is not exported yet.

- [ ] **Step 3: Implement and export Scene**

Create `src/game/scene.ts` with the approved lifecycle state machine. Set `name` from `SceneOptions.name` (empty string when omitted). Implement `addNode` as a type-preserving alias for `GameScene.add`; reject a resource instance owned by this or another scene; run `onUnload`, `super.destroy()`, and reverse-order `dispose()` exactly once. `onExit` runs only after activation. Public `unload()` returns `false` inside lifecycle hooks; `destroy()` uses the same cleanup path and is a no-op inside those hooks. Export `Scene` and its types from `src/game/index.ts`.

- [ ] **Step 4: Rerun the fixture**

Run: `perry run macos tests/game-runtime/scenes.ts`

Expected: the cleanup sequence matches the assertion and existing GameScene assertions remain unchanged.

- [ ] **Step 5: Commit this unit**

~~~sh
git add src/game/scene.ts src/game/index.ts tests/game-runtime/scenes.ts
git commit -m "feat: add scene lifecycle ownership"
~~~

### Task 2: Add SceneManager transition policy

**Files:**
- Create: `src/game/scene-manager.ts`
- Modify: `src/game/scene.ts`
- Modify: `src/game/index.ts`
- Modify: `tests/game-runtime/scenes.ts`

**Interfaces:**
- Consumes: Task 1 `Scene`/resource types and physics `WorldHandle`.
- Produces: `SceneManager.currentScene`, `changeTo`, `pause`, `resume`, `update`, `updateFixed`, physics-sync delegates, and `unloadCurrent`.

- [ ] **Step 1: Add a failing transition/reentrancy assertion**

Import `SceneManager` from `../../src/game`. Add a fixture where `FirstScene.onEnter()`, `onPause()`, and `onExit()` each call `manager.changeTo(new Scene())`. Assert all nested calls return `false`, `currentScene` remains `FirstScene` until the outer operation completes, pause/resume changes state, and switching to a fresh scene marks the first unloaded.

- [ ] **Step 2: Run the fixture to confirm the API is missing**

Run: `perry run macos tests/game-runtime/scenes.ts`

Expected: compilation fails because `SceneManager` is not exported.

- [ ] **Step 3: Implement the manager**

Create `src/game/scene-manager.ts`. Validate a fresh `ready` replacement that is not managed elsewhere before unloading the current scene. Guard lifecycle callbacks against nested transitions. Publish the replacement before `onEnter`; update state before `onPause`/`onResume`. Tick owned resources while active or paused; dispatch GameScene updates only while active. If a transition occurs during a tick, do not continue dispatching the old scene. Physics-sync delegates do nothing while paused and never call `step`. If a scene unloads itself directly, report `currentScene` as `null` on the next query.

- [ ] **Step 4: Verify pause and callback interruption**

Extend the fixture with a resource that records `update(dt)`, an object whose `update()` requests a replacement, and a second object's `fixedUpdate()` that requests a replacement. Assert paused scenes tick resources but not objects, transitions stop callbacks from both update phases, and the replacement starts on the next manager tick.

Run: `perry run macos tests/game-runtime/scenes.ts`

Expected: transition order, reentrancy, paused behavior, and direct-unload reporting pass.

- [ ] **Step 5: Commit this unit**

~~~sh
git add src/game/scene.ts src/game/scene-manager.ts src/game/index.ts tests/game-runtime/scenes.ts
git commit -m "feat: add scene manager transitions"
~~~

### Task 3: Add OOP renderer-node creation and controls

**Files:**
- Modify: `src/game/adapters/scene-node-component.ts`
- Modify: `src/game/index.ts` and `src/index.ts`
- Modify: `tests/game-runtime/adapters.ts` and `tests/game-runtime/perry-compat.ts`

**Interfaces:**
- Consumes: existing `createSceneNode`, `destroySceneNode`, material setters, and `attachModelToNode`.
- Produces: `SceneNodeComponent.create()`, `setVisible`, `setColor`, `setPbr`, `setTexture`, and `attachModel`.

- [ ] **Step 1: Add compile-time usage and ownership assertions**

In `perry-compat.ts`, import `Scene`, `SceneManager`, and `SceneNodeComponent` from `../../src/game`, then instantiate a scene, add a `GameObject` subclass, create a renderer component, and chain `.setVisible(true).setColor(1, 1, 1, 1).setPbr(0.5, 0.1).setTexture(0)`. In `adapters.ts`, verify an owned created node is destroyed with its component, a borrowed node survives, fluent methods return the component, model attachment forwards the supplied model and mesh index, and a parent/child GameObject transform reaches its renderer nodes once through the scene sync.

- [ ] **Step 2: Implement the component wrappers**

`create()` calls `createSceneNode()` and returns `null` for handle `0`; otherwise it constructs the component with owned ownership. Instance methods forward the existing scene calls and return `this`. Preserve borrowed constructor default and current parent/transform synchronization.

- [ ] **Step 3: Verify runtime and target signatures**

Run:

~~~sh
perry run macos tests/game-runtime/adapters.ts
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: ownership checks pass and every Perry target accepts the public APIs.

- [ ] **Step 4: Commit this unit**

~~~sh
git add src/game/adapters/scene-node-component.ts src/game/index.ts src/index.ts tests/game-runtime/adapters.ts tests/game-runtime/perry-compat.ts
git commit -m "feat: add OOP scene node controls"
~~~

### Task 4: Document scene lifecycle and renderer components

**Files:**
- Modify: `webpage/src/content/docs/api/game.md`
- Modify: `webpage/src/data/docs-coverage.mjs`
- Modify: `webpage/tests/docs-coverage.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 public APIs.
- Produces: examples for subclassing `Scene`, switching/pausing scenes, owning resources, and attaching a renderer component.

- [ ] **Step 1: Add required API sections to docs coverage**

Require `Scene manager` and `OOP renderer nodes` in the `game` entry in `docs-coverage.mjs`.

Run: `cd webpage && node --test tests/docs-coverage.test.mjs`

Expected: the game API page fails until both headings and TypeScript examples exist.

- [ ] **Step 2: Update the Game API page**

Document imports from `@bornengine/engine/game`, a subclass adding a `Player`, transition/pause loop integration, resource cleanup order, and `SceneNodeComponent.create()` attached to a `GameObject`. State that direct scene functions remain available.

- [ ] **Step 3: Run docs checks and build**

Run: `cd webpage && npm test && npm run check && npm run build && npm run validate:dist`

Expected: docs tests, Astro checks, static build, and link validation pass.

- [ ] **Step 4: Commit this unit**

~~~sh
git add webpage/src/content/docs/api/game.md webpage/src/data/docs-coverage.mjs webpage/tests/docs-coverage.test.mjs
git commit -m "docs: explain scene manager and renderer components"
~~~
