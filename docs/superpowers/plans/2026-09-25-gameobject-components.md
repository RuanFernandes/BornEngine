# Runtime GameObjects and Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a Perry-compatible class-based runtime where game authors can subclass GameObject, attach components, manage transforms and hierarchy, and explicitly synchronize existing renderer, physics, and audio handles.

**Architecture:** Keep GameObject, Transform, GameComponent, GameScene, and all user subclasses inside TypeScript. GameScene owns only runtime-created gameplay objects; three explicit adapters bridge objects to existing numeric renderer, physics, and voice handles. Stable per-phase snapshots define callback order and mutation behavior; no class instance crosses FFI.

**Tech Stack:** TypeScript compiled by Perry 0.5.1022; existing BornEngine core/math/scene/physics/audio APIs; Perry native, Apple, Android, Windows, Linux, and Web/WASM targets.

**Spec:** docs/superpowers/specs/2026-09-25-gameobject-components-design.md

## Global Constraints

- GameObject, Transform, GameComponent, GameScene, and user subclasses stay entirely in Perry-compiled TypeScript.
- Native APIs receive only numeric handles and primitive/math values through FFI; no class instances cross FFI.
- Do not add decorators, runtime metadata reflection, dynamic prototype mutation, generic reflection registries, or runtime code generation.
- Existing renderer scene graph, physics APIs, audio APIs, WorldData, its schema, serialized entity format, and instantiateWorld behavior remain backward-compatible.
- GameScene is a gameplay owner separate from the renderer-facing scene API.
- GameScene.updateFixed dispatches callbacks only; it never steps a physics world.
- Physics synchronization is explicit and uses scene.updateFixed(fixedDt), scene.syncPhysicsBeforeStep(world, fixedDt), physics.step(world, fixedDt), then scene.syncPhysicsAfterStep(world).
- GameObject.id is a TypeScript runtime identity and is never sent through FFI.
- Perry compatibility for class declarations, constructors, extends, super, overrides, instanceof, component generics, readonly properties, subclass returns, and subclass arrays must pass on macOS, Windows, Linux, iOS, tvOS, watchOS, Android, visionOS, and Web/WASM before publishing the API.
- Do not add built-in Player, NPC, prefab integration, global scene management, transitions, automatic runGame integration, editor integration, networking, subclass serialization, dependency injection, or native GameObject types.
- No new native FFI functions or runtime dependencies are part of this feature.

## Review Focus

- **Singular or shear-producing parent transform:** preserve-world reparenting must return failure without changing hierarchy or either transform; test in Task 4.
- **Remove and re-add during one callback pass:** stale scene snapshot entries must not dispatch the object twice; test in Task 5.
- **Activation changes mid-pass:** disabling an ancestor or component before its callback must suppress it in that same pass; test in Task 5.
- **Subtree detached while its child is later in the snapshot:** the detached child must not receive another callback; test in Task 4 and Task 5.
- **Mismatched or borrowed adapter handles:** the scene must ignore another physics world and must not destroy borrowed renderer/body handles; test in Task 6 and Task 7.

---

## File Map

| File | Responsibility |
|---|---|
| Create: tests/game-runtime/perry-compat.ts | Perry language and type compatibility fixture, independent of game runtime implementation. |
| Create: tests/game-runtime/perry-override-keyword.ts | Optional probe for the TypeScript override modifier; its failure does not block method overriding. |
| Create: tests/game-runtime/transform.ts | Perry-run assertions for local TRS defaults, mutation, and local matrices. |
| Create: tests/game-runtime/main.ts | Perry-run runtime assertions for hierarchy, lifecycle, component ownership, and mutation. |
| Create: tests/game-runtime/adapters.ts | Native integration assertions for existing renderer, physics, and audio handle APIs. |
| Create: tests/game-runtime/make-tone.py | Generate a tiny local WAV fixture for AudioSourceComponent integration checks. |
| Create: src/game/transform.ts | Local TRS, world TRS accessors, matrices, and atomic world/local conversion. |
| Create: src/game/game-component.ts | GameComponent base class, lifecycle surface, and typed component-constructor type. |
| Create: src/game/game-object.ts | GameObject identity, active flags, component collection, parent/child collection, and destruction state. |
| Create: src/game/game-scene.ts | Scene ownership, insertion ordering, snapshots, lifecycle dispatch, fixed phase, adapter synchronization, and destruction. |
| Create: src/game/adapters/scene-node-component.ts | Borrowed/owned renderer node wrapper and parent/local/world transform synchronization. |
| Create: src/game/adapters/rigid-body-component.ts | Borrowed/owned body wrapper and explicit per-world physics synchronization. |
| Create: src/game/adapters/audio-source-component.ts | Shared Sound wrapper, owned live voice, and world-position following. |
| Create: src/game/index.ts | Public @bornengine/engine/game exports. |
| Modify: src/index.ts | Root exports for game runtime classes and types. |
| Modify: package.json | Add the ./game package export without changing the nativeLibrary manifest. |
| Modify: README.md | List the new Game runtime module. |
| Modify: docs/design-api.md | Correct the class/FFI rationale for this opt-in TypeScript gameplay façade. |
| Create: docs/game-objects.md | Public guide for subclasses, components, transforms, lifecycle, adapters, and explicit physics steps. |

Test entry points use Perry directly because the repository has no root TypeScript unit-test runner. Runtime-only tests must not initialize a window or call native functions. Adapter tests run as a separate native integration fixture because they exercise existing FFI handles.

## API Contract To Implement

~~~ts
export interface GameObjectOptions {
  name?: string;
  active?: boolean;
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export interface ParentOptions {
  preserveWorldTransform?: boolean;
}

export type GameComponentType<T extends GameComponent> =
  new (...args: any[]) => T;

export class GameObject {
  constructor(options?: GameObjectOptions);
  readonly id: number;
  name: string;
  active: boolean;
  readonly activeInHierarchy: boolean;
  readonly destroyed: boolean;
  readonly scene: GameScene | null;
  readonly parent: GameObject | null;
  readonly children: readonly GameObject[];
  readonly transform: Transform;

  addChild<T extends GameObject>(child: T, options?: ParentOptions): T | null;
  removeChild(child: GameObject, options?: ParentOptions): boolean;
  addComponent<T extends GameComponent>(component: T): T | null;
  getComponent<T extends GameComponent>(type: GameComponentType<T>): T | null;
  getComponents<T extends GameComponent>(type: GameComponentType<T>): T[];
  removeComponent(component: GameComponent): boolean;
  destroy(): boolean;

  onAwake(): void;
  onStart(): void;
  update(dt: number): void;
  fixedUpdate(dt: number): void;
  onDestroy(): void;
}

export class GameComponent {
  readonly gameObject: GameObject | null;
  enabled: boolean;
  readonly isActiveAndEnabled: boolean;
  readonly destroyed: boolean;

  onAwake(): void;
  onStart(): void;
  update(dt: number): void;
  fixedUpdate(dt: number): void;
  onDestroy(): void;
}

export class GameScene {
  readonly objects: readonly GameObject[];
  add<T extends GameObject>(object: T): T | null;
  remove(object: GameObject): boolean;
  update(dt: number): void;
  updateFixed(dt: number): void;
  syncPhysicsBeforeStep(world: WorldHandle, fixedDt: number): void;
  syncPhysicsAfterStep(world: WorldHandle): void;
  destroy(): void;
}

export interface TransformOptions {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export class Transform {
  constructor(options?: TransformOptions);
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  readonly worldPosition: Vec3;
  readonly worldRotation: Quat;
  readonly worldScale: Vec3;
  readonly localMatrix: Mat4;
  readonly worldMatrix: Mat4;
  setWorldPosition(position: Vec3): boolean;
  setWorldRotation(rotation: Quat): boolean;
}
~~~

Use null/false for ordinary invalid operations; do not throw for validation. getComponents returns a new array in component attachment order. GameScene.objects and GameObject.children return snapshots. Preserve the exact subclass type through GameScene.add and GameObject.addChild.

Parenting preserves world transform by default. A transform conversion that requires shear or inversion of a singular parent fails atomically. Scene insertion order is assigned on attachment; reparenting in the same scene leaves order unchanged; removal followed by re-add appends a new insertion. Component callbacks use attachment order.

The Perry gate may require adjusting a signature before implementation. If generic constructor types plus instanceof fail on any target, stop and revise the design; do not add a registry as an unreviewed fallback.

---

### Task 1: Prove Perry class and generic compatibility before adding runtime code

**Files:**
- Create: tests/game-runtime/perry-compat.ts

**Consumes:** None.

**Produces:** A compile-and-run fixture that proves whether the public subclass and typed component-constructor shape is supportable by the installed Perry compiler.

- [ ] **Step 1: Write the isolated compatibility fixture**

Create tests/game-runtime/perry-compat.ts with no BornEngine imports and no native calls:

~~~ts
class Base {
  readonly baseValue: number;

  constructor(value: number) {
    this.baseValue = value;
  }

  read(): number {
    return this.baseValue;
  }
}

class Middle extends Base {
  constructor(value: number) {
    super(value + 1);
  }

  read(): number {
    return super.read() + 1;
  }
}

class Leaf extends Middle {
  constructor(value: number) {
    super(value + 1);
  }
}

function identity<T>(value: T): T {
  return value;
}

function requireTrue(value: boolean, label: string): void {
  if (!value) {
    console.error('Perry compatibility failure: ' + label);
    process.exit(1);
  }
}

const leaf = new Leaf(3);
const leafAgain: Leaf = identity(leaf);
const values: Base[] = [leafAgain];
const first: Base = values[0];

requireTrue(first instanceof Leaf, 'multi-level instanceof');
requireTrue(first instanceof Middle, 'parent instanceof');
requireTrue(first.read() === 6, 'constructors, super, and override');
requireTrue(leafAgain.baseValue === 5, 'readonly property and subclass return');
console.log('Perry compatibility fixture passed');
~~~

Add this constructor-based component lookup to the same fixture so the exact generic shape is checked without importing runtime files that do not exist yet:

~~~ts
class ComponentBase {}

class HealthProbe extends ComponentBase {
  value: number;

  constructor(value: number) {
    super();
    this.value = value;
  }
}

type ComponentConstructor<T extends ComponentBase> =
  new (...args: any[]) => T;

function findComponent<T extends ComponentBase>(
  components: ComponentBase[],
  type: ComponentConstructor<T>,
): T | null {
  for (let i = 0; i < components.length; i++) {
    if (components[i] instanceof type) {
      return components[i] as T;
    }
  }
  return null;
}

const componentList: ComponentBase[] = [new HealthProbe(80)];
const healthProbe: HealthProbe | null =
  findComponent(componentList, HealthProbe);
requireTrue(healthProbe !== null && healthProbe.value === 80,
  'generic constructor lookup and instanceof');
~~~

- [ ] **Step 2: Run Perry's strict target compatibility check**

Run the fixture with perry check for every repository game platform:

~~~sh
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: every target reports no compatibility errors for class syntax, constructor forwarding, method overriding, generics, readonly fields, instanceof, subclass returns, and arrays. The probe intentionally omits the optional TypeScript override modifier.

- [ ] **Step 3: Probe the optional override modifier separately**

Create tests/game-runtime/perry-override-keyword.ts with this reduced syntax probe:

~~~ts
class OverrideBase {
  update(dt: number): number {
    return dt;
  }
}

class OverrideChild extends OverrideBase {
  override update(dt: number): number {
    return super.update(dt) + 1;
  }
}

const probe: number = new OverrideChild().update(1);
console.log(probe);
~~~

Run the following on every target:

~~~sh
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-override-keyword.ts
done
~~~

If every target accepts the modifier, the user guide may show it. If any target rejects only the modifier while the unmarked method override passes, record that result and omit the modifier from all examples; continue the class API gate. Treat a failed command as a probe result, not a regression, after confirming the unmarked fixture passes on that same target.

- [ ] **Step 4: Compile and execute the fixture on the native host**

Run:

~~~sh
perry run macos tests/game-runtime/perry-compat.ts
~~~

Expected: exit code 0 and the final line says Perry compatibility fixture passed.

- [ ] **Step 5: Compile the fixture to Web/WASM**

Run:

~~~sh
perry compile --target web tests/game-runtime/perry-compat.ts
~~~

Expected: the compiler produces the Web/WASM output without a class, constructor, instanceof, or generic-codegen error. `perry run web` also compiles this fixture, but this local runner cannot launch its generated HTML; the spec requires a Web/WASM compile, while executable runtime assertions run on the native host.

- [ ] **Step 6: Stop on an unsupported required feature**

If constructor generics or instanceof fail for any supported target, do not create GameObject or component API files. Record the compiler version, target, reduced failing source, and compiler output; revise the spec and obtain review of the revised API before implementation.

- [ ] **Step 7: Commit the compatibility gate**

~~~sh
git add tests/game-runtime/perry-compat.ts tests/game-runtime/perry-override-keyword.ts
git commit -m "test: add Perry game runtime compatibility fixture"
~~~

---

### Task 2: Implement Transform and exact world/local conversion rules

**Files:**
- Create: src/game/transform.ts
- Create: tests/game-runtime/transform.ts

**Consumes:** Task 1 compatibility result.

**Produces:** Transform with local mutable TRS, world helpers, matrix composition, and failure-atomic world setters/reparent conversion primitives.

- [ ] **Step 1: Add the standalone local Transform assertions**

Create tests/game-runtime/transform.ts. Construct a standalone Transform for local math assertions; GameObject remains the only type that can attach a Transform into a hierarchy:

~~~ts
import { Transform } from '../../src/game/transform';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const transform = new Transform({
  position: { x: 2, y: 3, z: 4 },
});

expect(transform.position.x === 2, 'constructor copies local position');
expect(transform.rotation.w === 1, 'rotation defaults to identity');
expect(transform.scale.y === 1, 'scale defaults to one');
expect(transform.localMatrix[12] === 2, 'local matrix stores translation');
const matrixCopy = transform.localMatrix;
matrixCopy[12] = 99;
expect(transform.localMatrix[12] === 2, 'matrix getter returns a copy');
const positionCopy = transform.worldPosition;
positionCopy.x = 99;
expect(transform.worldPosition.x === 2, 'world position getter returns a copy');
transform.position.x = 5;
expect(transform.localMatrix[12] === 5, 'local matrix reflects mutable local Vec3');
~~~

The constructor accepts only TransformOptions; it never accepts or changes a parent. GameObject links the owned instance to its hierarchy through internal state.

- [ ] **Step 2: Run the Transform fixture to establish a failing test**

Run:

~~~sh
perry run macos tests/game-runtime/transform.ts
~~~

Expected: compilation fails because Transform does not exist yet.

- [ ] **Step 3: Add local TRS storage and matrix getters**

Implement src/game/transform.ts. Store position, rotation, and scale as mutable Vec3/Quat values initialized by copied options. Implement localMatrix in the renderer's existing column-major convention. Return fresh Vec3, Quat, and Mat4 values from world accessors; do not expose a mutable cached array.

- [ ] **Step 4: Add hierarchy-based world accessors**

Store a private parent-Transform reference and expose an internal setter that only GameObject calls. Compute worldMatrix as parent.worldMatrix multiplied by localMatrix; compute worldPosition from the resulting translation; compose worldRotation from normalized parent/local quaternions; compute worldScale as component-wise parent/local scale. Task 3 wires the Transform parent whenever GameObject hierarchy changes.

- [ ] **Step 5: Implement safe parent inversion and TRS decomposition**

Implement internal helpers in transform.ts for matrix inversion that returns success/failure rather than substituting identity for a singular parent, and decomposition that reports shear/non-TRS results. setWorldPosition and setWorldRotation return false without changing local state when conversion is impossible.

- [ ] **Step 6: Add transform conversion tests**

Add assertions for identity rotation, quaternion-to-matrix composition, non-uniform scale in localMatrix, returned matrix/vector copies, and mutation of local Vec3/Quat values. Add parent-world setters, singular-parent rejection, and shear-producing relative-matrix assertions in Task 4 once GameObject parenting exists. Verify every failed setter leaves position/rotation/scale unchanged.

- [ ] **Step 7: Run the focused fixture**

Run:

~~~sh
perry run macos tests/game-runtime/transform.ts
~~~

Expected: all local TRS and matrix cases pass.

- [ ] **Step 8: Commit Transform**

~~~sh
git add src/game/transform.ts tests/game-runtime/transform.ts
git commit -m "feat: add runtime transform primitives"
~~~

---

### Task 3: Add GameComponent and subclassable GameObject base classes

**Files:**
- Create: src/game/game-component.ts
- Create: src/game/game-object.ts
- Create: src/game/index.ts
- Create: tests/game-runtime/main.ts

**Consumes:** Transform from Task 2.

**Produces:** GameComponent and GameObject with constructor options, runtime id, activation, explicit lifecycle methods, typed component ownership/lookup, and subclass-preserving component addition.

- [ ] **Step 1: Add failing subclass and component tests**

Create tests/game-runtime/main.ts with a minimal assertion helper, then add:

~~~ts
import { GameComponent, GameObject } from '../../src/game';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

class Player extends GameObject {
  constructor(name: string) {
    super({ name });
  }
}

class Health extends GameComponent {
  value = 100;
}

const player = new Player('Player');
const health = new Health();
expect(player.addComponent(health) === health, 'addComponent returns same component');
expect(player.getComponent(Health) === health, 'getComponent finds the exact type');
expect(player.getComponents(GameComponent).length === 1, 'getComponents finds base class');
expect(health.gameObject === player, 'component reports its owner');
expect(player.id !== new GameObject().id, 'runtime identities are distinct');

const other = new GameObject();
expect(other.addComponent(health) === null, 'one component cannot have two owners');
~~~

Add duplicate Health components and assert getComponent returns the first while getComponents returns both in attachment order.

- [ ] **Step 2: Run the fixture to verify the API is missing**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: FAIL at compile time because GameComponent and GameObject are not exported yet.

- [ ] **Step 3: Implement GameComponent**

Implement readonly ownership access through an internal setter used only by GameObject. Keep gameObject set until onDestroy returns, then clear it. Add enabled defaulting to true, destroyed, awake, and started state; add no-op onAwake, onStart, update, fixedUpdate, and onDestroy methods. Make normal methods overridable without decorators or runtime discovery.

- [ ] **Step 4: Implement GameObject construction and identity**

Add GameObjectOptions, name, module-scoped monotonically increasing id, active, activeInHierarchy, destroyed, scene, parent, children, and owned Transform. Copy constructor TRS inputs so mutating an options object later cannot alter the GameObject.

- [ ] **Step 5: Implement typed component methods**

Define GameComponentType<T> as an explicit constructor type. addComponent rejects destroyed objects/components and any component already owned or destroyed. getComponent/getComponents use instanceof in attachment order. removeComponent returns false on invalid ownership and otherwise performs destructive removal once.

- [ ] **Step 6: Export core classes from the game barrel**

Add exports for GameObject, GameComponent, Transform, and their public option/constructor types to src/game/index.ts. Do not modify the root barrel or package export map until Task 8.

- [ ] **Step 7: Enable the tests and run the focused fixture**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: subclass construction, constructor forwarding, IDs, typed component lookup, duplicate type ordering, and one-owner rejection pass.

- [ ] **Step 8: Commit the base classes**

~~~sh
git add src/game/game-component.ts src/game/game-object.ts src/game/index.ts tests/game-runtime/main.ts
git commit -m "feat: add runtime game object and component bases"
~~~

---

### Task 4: Implement hierarchy, GameScene ownership, and reparenting behavior

**Files:**
- Create: src/game/game-scene.ts
- Modify: src/game/game-object.ts
- Modify: src/game/index.ts
- Modify: tests/game-runtime/main.ts

**Consumes:** Task 3 types and Transform conversion helpers.

**Produces:** Same-scene parenting, root/subtree attachment and detachment, readonly relationships, insertion order, cycle protection, and failure-atomic preserve-world defaults.

- [ ] **Step 1: Add the full parenting matrix as failing tests**

Cover: unattached/unattached; attached parent plus unattached child; same-scene reparent; different-scene rejection; unattached parent plus attached child rejection; removeChild; remove a descendant subtree; destroy a scene; cycle and self-parent rejection; default preserve-world; explicit preserve-local; singular/shear rejection. Update the imports at the top of the fixture to include GameScene before adding these cases.

Use a focused assertion such as:

~~~ts
import { GameScene } from '../../src/game';

const scene = new GameScene();
const left = new GameObject({ position: { x: 5, y: 0, z: 0 } });
const right = new GameObject({ position: { x: 20, y: 0, z: 0 } });
const child = new GameObject({ position: { x: 2, y: 0, z: 0 } });

scene.add(left);
scene.add(right);
scene.add(child);
const before = child.transform.worldPosition.x;
expect(right.addChild(child) === child, 'same-scene reparent succeeds');
expect(child.transform.worldPosition.x === before, 'default reparent preserves world position');
expect(child.scene === scene, 'same-scene reparent preserves ownership');
~~~

- [ ] **Step 2: Run tests and confirm parenting assertions fail**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: failures identify unimplemented GameScene.add, remove, and child operations.

- [ ] **Step 3: Implement readonly hierarchy relationships**

Keep parent and scene fields private with readonly getters. Return a newly allocated children array on each read. Reject self-parent and ancestor cycles before changing state.

- [ ] **Step 4: Implement GameScene.add/remove and ordered membership**

GameScene.add accepts only an unattached, unparented, alive root. Assign scene membership to the full subtree in parent-first preorder and append it to the internal insertion list. remove detaches the selected subtree, unparents its root with world preservation, preserves internal links, clears scene membership, leaves instances alive, and synchronizes that subtree's renderer/audio adapters against the detached hierarchy before returning.

- [ ] **Step 5: Implement addChild/removeChild atomically**

Use preserveWorldTransform=true when options are omitted. Compute the resulting local TRS before mutating parent, child list, or scene membership. Return null/false with no changes on singular matrices, non-TRS/shear results, cross-scene parenting, or cycles. With preserveWorldTransform=false, retain local TRS. Append a child when it is newly parented; a same-parent add is a no-op.

- [ ] **Step 6: Add stable insertion order and re-add generation**

Assign a new scene insertion sequence when a root/subtree joins a scene. Same-scene reparenting must not change sequence. Scene removal followed by re-add assigns a new sequence and attachment generation; retain awake/started lifetime state.

- [ ] **Step 7: Verify child and scene snapshots**

Assert mutating a returned children array or scene.objects array does not mutate engine state. Assert removal/re-add appends after previously attached objects.

- [ ] **Step 8: Run the focused runtime suite**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: every parenting edge case passes and failed preserve-world operations leave the original parent, child order, and transforms unchanged.

- [ ] **Step 9: Commit hierarchy and scene ownership**

~~~sh
git add src/game/game-scene.ts src/game/game-object.ts src/game/index.ts tests/game-runtime/main.ts
git commit -m "feat: add game scene ownership and hierarchy"
~~~

---

### Task 5: Implement lifecycle, activation, mutation snapshots, and destruction

**Files:**
- Modify: src/game/game-scene.ts
- Modify: src/game/game-object.ts
- Modify: src/game/game-component.ts
- Modify: tests/game-runtime/main.ts

**Consumes:** Task 4 scene membership and insertion sequence.

**Produces:** Exact awake/start/update/fixed/destroy behavior and stable dispatch under callbacks that mutate scene state.

- [ ] **Step 1: Add ordered lifecycle probes**

Add a Probe object and ProbeComponent that append names to a shared string array from each lifecycle method. Assert scene add order, inactive/disabled behavior, late component attachment, and a component added after owner start.

Expected regular update order for one newly added active object with one component:

~~~text
object.awake
component.awake
object.start
object.update
component.start
component.update
~~~

- [ ] **Step 2: Add mutation regression tests**

Cover: add object and component during update; assert late onAwake is immediate but update waits for the next snapshot; add a component to a later scene object and assert it also waits; remove a later object during update; destroy self in GameObject.update; destroy parent before child callback; remove/re-add an object before its old snapshot slot; disable an ancestor/component before its callback; call destroy twice; remove a component twice.

Add a destruction-order probe whose assertions inside onDestroy verify the component is still queryable from GameObject.onDestroy and component.gameObject remains its owner during GameComponent.onDestroy. Expect child hooks before parent hooks, the parent hook before its components, and components in reverse attachment order.

- [ ] **Step 3: Run the lifecycle fixture before implementation**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: the new lifecycle/mutation assertions fail before the dispatch implementation is added.

- [ ] **Step 4: Snapshot each dispatch pass**

Before the first callback in update/updateFixed, copy scene insertion order, each object's attachment generation, and each object's component attachment list. Iterate only those snapshots; never loop over an array that a callback can grow or shrink. This ensures components added to later objects during the phase also wait until the next corresponding phase.

- [ ] **Step 5: Recheck eligibility before every callback**

Before each callback verify object scene ownership, snapshot generation, destroyed state, activeInHierarchy, component owner, component destroyed state, and component enabled. A child detached earlier in the same pass and an object re-added with a new generation are skipped from stale entries.

- [ ] **Step 6: Implement awake and start timing**

Call object onAwake before its components, then visit subtree children in child-list order. Call onAwake for a component added to an already-awake owner immediately. During GameScene.update only, call each object's onStart immediately before its first update, then call each component's onStart immediately before its first component update. Do not call onStart from updateFixed.

- [ ] **Step 7: Implement fixed dispatch and activation**

GameScene.updateFixed invokes only fixedUpdate on active objects and enabled components. It must not step physics or start instances. activeInHierarchy checks every ancestor; isActiveAndEnabled also checks attachment, enabled, and destroyed state.

- [ ] **Step 8: Implement synchronous, idempotent destruction**

Mark the whole subtree destroyed but keep parent/children/scene links until the hooks finish. Destroy children in child-list order, then invoke the object's onDestroy, then components in reverse attachment order. Leave components queryable during GameObject.onDestroy; keep each component.gameObject set through that component's onDestroy callback, then clear it; clear object hierarchy/scene links after all hooks for that object finish. Remove components destructively and exactly once.

- [ ] **Step 9: Run lifecycle/mutation regression suite**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: deterministic expected callback arrays match; no added object/component receives an update from the snapshot that was already in progress; destroy/remove suppress later entries in that phase; all lifecycle one-time counters remain one across remove/re-add.

- [ ] **Step 10: Commit lifecycle and dispatch**

~~~sh
git add src/game/game-scene.ts src/game/game-object.ts src/game/game-component.ts tests/game-runtime/main.ts
git commit -m "feat: add deterministic game object lifecycle"
~~~

---

### Task 6: Add the renderer SceneNodeComponent adapter

**Files:**
- Create: src/game/adapters/scene-node-component.ts
- Modify: src/game/game-scene.ts
- Modify: src/game/index.ts
- Create: tests/game-runtime/adapters.ts

**Consumes:** Transform.worldMatrix/localMatrix, GameScene snapshots, and existing src/scene/index.ts handle functions.

**Produces:** Borrowed-by-default wrapper for an existing SceneNodeHandle with deterministic parent and transform synchronization.

- [ ] **Step 1: Add native adapter assertions**

Initialize the engine using the existing core initWindow path in the adapter-only fixture, record getSceneNodeCount(), create two nodes with createSceneNode(), wrap one borrowed and one owned, then destroy the owning GameObjects. Assert the borrowed node remains counted and the owned node reduces the count by one. Read getSceneNodeTransform to confirm the borrowed node was detached and left at the object's prior world matrix.

- [ ] **Step 2: Run the adapter fixture to verify failure**

Run:

~~~sh
perry run macos tests/game-runtime/adapters.ts
~~~

Expected: the compiler fails because SceneNodeComponent and its synchronization are not implemented.

- [ ] **Step 3: Implement SceneNodeComponent construction and ownership**

Accept an existing SceneNodeHandle and options { ownership?: 'borrowed' | 'owned' }. Default to borrowed. Do not call createSceneNode in the constructor. On removal/destruction, clear the native parent first. For borrowed handles, write the last GameObject world matrix and keep the handle; for owned handles, destroy the node after unparenting.

- [ ] **Step 4: Implement direct-parent renderer mapping**

During GameScene adapter sync, regardless of lifecycle active/enabled flags, when the immediate GameObject parent has a SceneNodeComponent, call setSceneNodeParent(childHandle, parentHandle) and set its local matrix. Otherwise call setSceneNodeParent(handle, 0) and write worldMatrix. This prevents double application of parent transforms and keeps children correct below non-rendered GameObjects.

- [ ] **Step 5: Synchronize after runtime phases**

At the end of update and updateFixed, sync SceneNodeComponents in scene insertion order. Also sync after syncPhysicsAfterStep has pulled dynamic body poses. GameScene.remove performs one immediate subtree adapter sync after detaching its root so borrowed nodes do not remain parented to a renderer node still owned by another GameScene. Adapter sync does not alter existing renderer visibility or create scene nodes.

- [ ] **Step 6: Verify borrowed/owned and parent mapping**

Run:

~~~sh
perry run macos tests/game-runtime/adapters.ts
~~~

Expected: renderer node count, detached parent, local/world matrices, owned destruction, borrowed survival, and hierarchy fallback assertions pass.

- [ ] **Step 7: Commit the renderer adapter**

~~~sh
git add src/game/adapters/scene-node-component.ts src/game/game-scene.ts src/game/index.ts tests/game-runtime/adapters.ts
git commit -m "feat: add scene node game component adapter"
~~~

---

### Task 7: Add physics and audio adapters with explicit ownership

**Files:**
- Create: src/game/adapters/rigid-body-component.ts
- Create: src/game/adapters/audio-source-component.ts
- Modify: src/game/game-scene.ts
- Modify: src/game/index.ts
- Modify: tests/game-runtime/adapters.ts
- Create: tests/game-runtime/make-tone.py

**Consumes:** Existing src/physics/index.ts and src/audio/index.ts numeric-handle functions.

**Produces:** Explicit static/kinematic push, dynamic pull, per-world filtering, a shared Sound plus owned live voice, and no automatic physics stepping.

- [ ] **Step 1: Add body ownership and world-filtering assertions**

In the native adapter fixture, create two physics worlds, a sphere shape, and one body in each world. Attach borrowed RigidBodyComponents to objects in one GameScene. Sync against world A and assert only world A's bodies move; destroy the scene and assert both borrowed bodies remain valid. Repeat with one owned body and assert only that body becomes invalid after destruction.

- [ ] **Step 2: Add static, kinematic, and dynamic synchronization assertions**

Create bodies with MotionType.STATIC, KINEMATIC, and DYNAMIC. Confirm before-step calls update static transforms and call moveKinematic for kinematic transforms. Advance physics.step(world, fixedDt), then confirm after-step writes dynamic position/rotation into the owning object's world pose while retaining scale. Keep the physics step call in the test/game caller, outside GameScene.

- [ ] **Step 3: Add an audio test tone generator**

Create tests/game-runtime/make-tone.py with this deterministic 440 Hz fixture generator:

~~~py
import math
import struct
import wave
from pathlib import Path

rate = 22050
count = rate // 4
path = Path('tests/game-runtime/assets/tone.wav')
path.parent.mkdir(parents=True, exist_ok=True)
frames = bytearray()
for index in range(count):
    sample = int(12000 * math.sin(2 * math.pi * 440 * index / rate))
    frames.extend(struct.pack('<h', sample))
with wave.open(str(path), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(bytes(frames))
~~~

- [ ] **Step 4: Add AudioSourceComponent behavior checks**

Initialize audio, load the generated tone with loadSound, attach an AudioSourceComponent to an object, call play(), and assert it returns true for a valid voice. Destroy the component and then call playSound(sound) to prove the shared Sound handle was not unloaded. Verify stop() and repeated destruction are idempotent.

- [ ] **Step 5: Run the native adapter fixture before implementation**

Run:

~~~sh
python3 tests/game-runtime/make-tone.py
perry run macos tests/game-runtime/adapters.ts
~~~

Expected: Perry fails to compile the missing adapter classes before their implementation.

- [ ] **Step 6: Implement RigidBodyComponent**

Require WorldHandle, BodyHandle, and options containing the existing MotionType. Expose world, body, motionType, and ownership as readonly fields. Default body ownership to borrowed; when ownership is owned, the caller must not destroy the wrapped body independently. Never own/destroy the WorldHandle or ShapeHandle. On removal/destruction, call destroyBody only when body ownership is owned.

- [ ] **Step 7: Implement explicit physics synchronization**

syncPhysicsBeforeStep(world, fixedDt) filters by exact WorldHandle and component liveness, pushes static with setBodyTransform and kinematic with moveKinematic. syncPhysicsAfterStep(world) reads dynamic body transform, calls Transform.setWorldPosition/setWorldRotation, preserves local scale, ignores other worlds, and synchronizes renderer adapters and live audio voice positions after all pulls. Do not call physics.step in GameScene.

- [ ] **Step 8: Implement AudioSourceComponent**

Store the shared Sound in a readonly field and playback options. Keep the voice handle private. play() requires an attached live owner, calls playSound3DEx at transform.worldPosition, stores only the returned voice handle, and returns false for handle 0. stop()/onDestroy stop a nonzero voice once and clear it. After update/updateFixed, move a live voice to the owning object's worldPosition with voiceSetPosition. Never unload Sound.

- [ ] **Step 9: Run native adapter assertions and audio smoke**

Run:

~~~sh
python3 tests/game-runtime/make-tone.py
perry run macos tests/game-runtime/adapters.ts
~~~

Expected: body ownership, world filtering, static/kinematic/dynamic synchronization, sound handle survival, and stop idempotence pass. Listen to the short looping test tone while moving its GameObject; its apparent position should follow the object and stop when the component is destroyed. The existing audio API has no voice-position readback, so position following is covered by this native audible smoke check.

- [ ] **Step 10: Commit physics and audio adapters**

~~~sh
git add src/game/adapters/rigid-body-component.ts src/game/adapters/audio-source-component.ts src/game/game-scene.ts src/game/index.ts tests/game-runtime/adapters.ts tests/game-runtime/make-tone.py
git commit -m "feat: add physics and audio game components"
~~~

---

### Task 8: Publish package exports, correct API documentation, and add the guide

**Files:**
- Modify: src/game/index.ts
- Modify: src/index.ts
- Modify: package.json
- Modify: README.md
- Modify: docs/design-api.md
- Create: docs/game-objects.md

**Consumes:** All runtime and adapter classes from Tasks 2–7.

**Produces:** Stable @bornengine/engine/game and root imports, corrected class/FFI explanation, and a public API guide.

- [ ] **Step 1: Add public import checks to the Perry fixture**

Update tests/game-runtime/perry-compat.ts to import GameObject and GameComponent from @bornengine/engine/game. Define Player extends GameObject and Health extends GameComponent. Pass Player instances through a GameScene.add call and Health constructors through getComponent; assert the returned value retains the subclass type.

- [ ] **Step 2: Run export checks to identify missing paths**

Run:

~~~sh
perry check --strict tests/game-runtime/perry-compat.ts
~~~

Expected: the check reports missing ./game or root exports until the export edits are complete.

- [ ] **Step 3: Add the package subpath and root exports**

Add "./game": "./src/game/index.ts" to package.json exports. Re-export GameScene, GameObject, GameComponent, Transform, and adapters from src/index.ts. Keep every existing export and package nativeLibrary entry unchanged.

- [ ] **Step 4: Correct docs/design-api.md**

Rewrite its opening and Perry FFI explanation to say the native API remains free-function/handle based, while this fork also offers an opt-in TypeScript-only gameplay class layer. Remove statements claiming classes cannot cross the Perry FFI or that classes inherently require vtables across native calls. Keep the existing function-oriented subsystem API rationale.

- [ ] **Step 5: Write docs/game-objects.md from the spec**

Include one Player extends GameObject example; typed component add/get; local/world transform; default preserve-world parenting and failure conditions; active versus activeInHierarchy; enabled versus isActiveAndEnabled; exact lifecycle/destroy order; GameScene.update/updateFixed; explicit fixed callback and physics sync/step sequence; SceneNode/body borrowed-by-default ownership; AudioSource voice ownership; and a statement that WorldData does not construct subclasses.

- [ ] **Step 6: Update README module list**

Add a Game module row pointing to @bornengine/engine/game and docs/game-objects.md. Do not claim that this module replaces renderer scene, runGame, or WorldData.

- [ ] **Step 7: Check the public snippet and existing world consumers**

Run:

~~~sh
perry check --strict examples/world-viewer/main.ts
perry check --strict tests/game-runtime/perry-compat.ts
~~~

Expected: world-viewer continues to type-check without source edits; the public guide snippet type-checks and retains Player return types.

- [ ] **Step 8: Commit exports and docs**

~~~sh
git add src/game/index.ts src/index.ts package.json README.md docs/design-api.md docs/game-objects.md tests/game-runtime/perry-compat.ts
git commit -m "docs: publish game object runtime API"
~~~

---

### Task 9: Run full verification and backward-compatibility review

**Files:**
- Modify: tests/game-runtime/perry-compat.ts
- Modify: tests/game-runtime/main.ts
- Modify: tests/game-runtime/adapters.ts
- No edits to src/world/types.ts, src/world/loader.ts, existing scene/physics/audio public signatures, or native FFI declarations.

**Consumes:** Tasks 1–8.

**Produces:** Passing Perry compatibility matrix, passing runtime/native adapter suites, and a documented backward-compatibility diff review.

- [ ] **Step 1: Run focused TypeScript runtime assertions**

Run:

~~~sh
perry run macos tests/game-runtime/main.ts
~~~

Expected: every transform, parenting, lifecycle, activation, mutation, component, and destruction assertion passes.

- [ ] **Step 2: Run the native adapter assertions**

Run:

~~~sh
python3 tests/game-runtime/make-tone.py
perry run macos tests/game-runtime/adapters.ts
~~~

Import WorldData and WORLD_SCHEMA_VERSION from src/world/types.ts and instantiateWorld from src/world/loader.ts. Before exiting the adapter fixture, instantiate a minimal schema-v2 WorldData value through the existing loader and assert its legacy result shape remains unchanged:

~~~ts
const world: WorldData = {
  schemaVersion: WORLD_SCHEMA_VERSION,
  name: 'Game runtime compatibility',
  id: 'game_runtime_compatibility',
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  environment: {
    skyColor: [0, 0, 0],
    ambientColor: [0, 0, 0],
    ambientIntensity: 0,
    sunDirection: [0, -1, 0],
    sunColor: [1, 1, 1],
    sunIntensity: 0,
    fogStart: 1000,
    fogEnd: 1000,
    fogColor: [0, 0, 0],
    shadowsEnabled: false,
  },
  terrain: null,
  entities: [{
    id: 'legacy_entity',
    name: 'Legacy entity',
    modelRef: 'missing.glb',
    prefabRef: null,
    transform: {
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    tint: null,
    tags: ['legacy'],
    userData: {},
  }],
  lights: [],
  water: [],
  rivers: [],
  metadata: {},
};
const instantiated = instantiateWorld(world, {
  getModelHandle: (_modelRef: string) => 0,
  prefabRegistry: null,
});
expect(instantiated.entityHandles.size === 0, 'missing legacy model is skipped');
expect(instantiated.warnings.length === 1, 'legacy entity warning is retained');
expect(instantiated.terrainHandle === 0, 'legacy terrain result remains empty');
~~~

Expected: renderer/body ownership, world filtering, transform sync, shared sound preservation, audio stop checks, and the existing instantiateWorld result contract pass.

- [ ] **Step 3: Run strict Perry compatibility checks on every target**

Run:

~~~sh
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: every listed project platform accepts the public class, constructor, generic, readonly, subclass-return, instanceof, and subclass-array API.

- [ ] **Step 4: Compile target code paths**

Run the compatibility fixture through every Perry platform runner spelling accepted by the installed CLI:

~~~sh
for target in macos windows linux ios tvos watchos android visionos web; do
  perry run "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: every target compiles and executes the fixture. Use the configured simulator/device or target runner required by the existing project lane. The native host and Web/WASM builds must both complete; no FFI manifest or target-stub changes are required.

- [ ] **Step 5: Verify WorldData and subsystem compatibility**

Run:

~~~sh
git diff b47df99 -- src/world/types.ts src/world/loader.ts src/world/serialize.ts src/scene/index.ts src/physics/index.ts src/audio/index.ts src/index.ts package.json
~~~

Expected: no existing WorldData schema/loader/serializer or renderer/physics/audio function signature changes. src/index.ts contains only the new game exports; the only package.json change is the new ./game export; perry.nativeLibrary.functions is byte-for-byte unchanged.

- [ ] **Step 6: Review all adapter calls**

Search for all native calls from src/game and confirm each call receives only numbers, booleans encoded by existing wrappers, vectors/matrices decomposed to scalar values, or existing handle numbers. Confirm GameObject.id and object/component instances are never passed to FFI.

- [ ] **Step 7: Review spec coverage and commit**

Check each acceptance criterion in docs/superpowers/specs/2026-09-25-gameobject-components-design.md against the runtime tests and target matrix. Commit any final test/doc changes with a technical-only message, then provide the native and per-target command results.

~~~
git status --short
~~~

Expected: only intended implementation/test/doc files are present and there are no changes to user world data or native manifests.

---

## Acceptance Criteria

1. A game can define Player extends GameObject, instantiate it with new Player(...), override lifecycle methods, attach components, add it to GameScene, and retain the Player subtype through scene.add.
2. Transform exposes mutable local TRS and world accessors/helpers; parent/add/remove operations preserve world transform by default and fail atomically if exact TRS conversion is impossible.
3. scene, parent, children, and component.gameObject relationships are readonly; parenting, scene ownership, and subtree removal follow the spec.
4. awake/start/update/fixed/destroy run with the exact timing, ordering, activation, snapshot, and idempotence rules in the spec.
5. Typed component lookup uses constructor arguments and instanceof, supports subclasses and duplicate component types, and prevents multiple ownership.
6. Renderer, physics, and audio adapters use explicit borrowed/owned handles; shared assets are never invalidated by component cleanup.
7. Physics stepping stays explicit; before/after synchronization filters by WorldHandle and handles static, kinematic, and dynamic bodies as specified.
8. WorldData, its schema and serialized format, instantiateWorld, and existing scene/physics/audio APIs remain backward-compatible.
9. Perry compatibility checks pass for all game platforms before the API is published.
10. docs/design-api.md, docs/game-objects.md, and README.md explain the new opt-in gameplay runtime without adding engine-owned Player/NPC implementations.
