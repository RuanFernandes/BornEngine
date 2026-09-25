# Runtime GameObjects and Components

## Goal

Add an opt-in, class-based gameplay runtime. Game authors can define subclasses such as Player or NPC with ordinary TypeScript inheritance, construct them with new, attach components, and add them to a GameScene. The engine supplies reusable runtime primitives only; it does not define gameplay-specific classes.

## Existing architecture and compatibility boundary

The existing scene module owns renderer nodes, lights, picking, and its retained render graph. Physics and audio expose separate native resource handles. WorldData and instantiateWorld load serialized world entities into renderer nodes.

The new GameObject layer is a TypeScript runtime façade. GameObject, Transform, GameComponent, GameScene, and user subclasses remain inside Perry-compiled TypeScript. Native calls continue to receive numeric handles and primitive or math values. GameObject.id is a TypeScript runtime identity only; it is never a renderer, body, sound, or FFI handle.

The feature adds the package subpath @bornengine/engine/game and root exports. It does not alter existing renderer, physics, audio, WorldData, or instantiateWorld signatures or behavior. It does not use decorators, runtime metadata, dynamic prototype mutation, generic reflection registries, or runtime code generation.

The existing docs/design-api.md currently says the engine has no class or inheritance API and describes the FFI boundary as hostile to classes. The implementation must correct that explanation: native APIs remain handle-based, while a TypeScript-only gameplay layer may use classes without passing class instances through FFI.

## Public API

The following names are the intended contract, conditional on the Perry compatibility gate in the implementation plan.

~~~ts
import {
  AudioSourceComponent,
  GameComponent,
  GameObject,
  GameScene,
  RigidBodyComponent,
  SceneNodeComponent,
} from '@bornengine/engine/game';

class Player extends GameObject {
  constructor(name: string) {
    super({ name });
  }

  update(dt: number): void {
    this.transform.position.x += dt;
  }
}

class Health extends GameComponent {
  value = 100;
}

const scene = new GameScene();
const player = new Player('Player');
player.addComponent(new Health());
scene.add(player);
scene.update(1 / 60);
~~~

Public types and options:

~~~ts
export interface TransformOptions {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

export interface GameObjectOptions extends TransformOptions {
  name?: string;
  active?: boolean;
}

export interface ParentOptions {
  preserveWorldTransform?: boolean;
}

export type ResourceOwnership = 'borrowed' | 'owned';

export interface SceneNodeComponentOptions {
  ownership?: ResourceOwnership;
}

export interface RigidBodyComponentOptions {
  motionType: number;
  ownership?: ResourceOwnership;
}

export interface AudioSourceOptions {
  looping?: boolean;
  refDist?: number;
  maxDist?: number;
  rolloff?: number;
}

export type GameComponentType<T extends GameComponent> =
  new (...args: any[]) => T;

export class SceneNodeComponent extends GameComponent {
  readonly handle: SceneNodeHandle;
  readonly ownership: ResourceOwnership;
  constructor(handle: SceneNodeHandle, options?: SceneNodeComponentOptions);
}

export class RigidBodyComponent extends GameComponent {
  readonly world: WorldHandle;
  readonly body: BodyHandle;
  readonly motionType: number;
  readonly ownership: ResourceOwnership;
  constructor(world: WorldHandle, body: BodyHandle, options: RigidBodyComponentOptions);
}

export class AudioSourceComponent extends GameComponent {
  readonly sound: Sound;
  constructor(sound: Sound, options?: AudioSourceOptions);
  play(): boolean;
  stop(): void;
}
~~~

Public signatures:

- GameObject(options?: GameObjectOptions): mutable name defaults to the empty string and mutable active defaults to true; readonly id, activeInHierarchy, destroyed, scene, parent, children, and transform.
- GameObject.addChild<T>(child: T, options?: ParentOptions): T | null.
- GameObject.removeChild(child, options?: ParentOptions): boolean.
- GameObject.addComponent<T>(component: T): T | null.
- GameObject.getComponent<T>(type: GameComponentType<T>): T | null.
- GameObject.getComponents<T>(type: GameComponentType<T>): T[].
- GameObject.removeComponent(component): boolean.
- GameObject.destroy(): boolean; true on the first destruction request and false after it has already been destroyed.
- GameComponent: readonly gameObject, mutable enabled defaulting to true, readonly isActiveAndEnabled and destroyed, plus explicit lifecycle methods. enabled defaults to true.
- GameScene.add<T>(object: T): T | null; remove(object): boolean; readonly objects: readonly GameObject[]; update(dt): void; updateFixed(dt): void; syncPhysicsBeforeStep(world, fixedDt): void; syncPhysicsAfterStep(world): void; destroy(): void. updateFixed does not step physics. fixedDt is required because the existing kinematic body API requires a delta time.
- Transform(options?: TransformOptions): mutable local position: Vec3, rotation: Quat, and scale: Vec3; readonly worldPosition, worldRotation, worldScale, localMatrix, and worldMatrix; setWorldPosition(position): boolean; setWorldRotation(rotation): boolean. GameObject owns its Transform; a standalone Transform can be constructed for math but cannot be attached to an object.
- Component lookup receives a constructor and uses instanceof. The first match is returned in attachment order; getComponents returns every match in that order. Duplicate component types are allowed. The same component instance cannot be attached twice or owned by two objects. getComponents returns an empty array when there are no matches.
- Invalid attachment, reparenting, removal, or use-after-destroy operations return null or false. Engine methods do not rely on thrown exceptions for normal validation.
- GameObject.id is a monotonically assigned numeric runtime identity for the current TypeScript process. It is not serialized, stable across runs, or sent through FFI.

Method overriding must compile on every supported target. The TypeScript override modifier is optional syntax: if Perry accepts it on every target, examples may include it; otherwise examples declare the same method without the modifier. The exact generic constructor type must be proven by the Perry gate before it is frozen. If Perry cannot compile the constructor type plus instanceof on every supported game target, stop and revise the API before implementation; do not silently replace it with a reflection registry.

## Transform semantics

Transform is a first-class object owned by each GameObject, not a GameComponent and not an independently attachable resource. Its public constructor also permits standalone math use; only GameObject controls hierarchy attachment. Its position, rotation, and scale are local to the parent. A root object's local transform is its world transform. Position uses Vec3, rotation uses Quat, and scale uses Vec3; defaults are zero position, identity rotation, and unit scale. GameObject defaults name to the empty string and active to true; GameComponent defaults enabled to true.

Matrices use the engine's existing column-major Mat4 convention and getters return copies. worldMatrix is the authoritative full transform, composed as parent-world multiplied by local. worldPosition is its translation. worldRotation is the normalized quaternion product from root to object. worldScale is the component-wise product of local scales from root to object. Non-uniform scale combined with descendant rotation can make worldMatrix contain shear; worldRotation and worldScale describe the authored TRS chain, while worldMatrix preserves the full composed result.

setWorldPosition converts through the parent world matrix. setWorldRotation converts through the parent world rotation. Both return false and leave local values unchanged when the required parent conversion is singular. Local matrix, world matrix, and returned vectors are values/copies so callers cannot mutate cached engine state accidentally; the local position/rotation/scale fields themselves are mutable.

Parenting preserves world transform by default:

~~~ts
parent.addChild(child); // same as { preserveWorldTransform: true }
parent.addChild(child, { preserveWorldTransform: false }); // keep local TRS
parent.removeChild(child); // default: preserve world transform
~~~

When preserveWorldTransform is true, the runtime computes the child's prior world matrix and derives local TRS under the new parent. If the target parent matrix is singular or the relative matrix cannot be represented as TRS without shear, the operation returns null/false and leaves the hierarchy and transform unchanged. With false, the child keeps its existing local TRS and its world transform changes to match the new parent.

Self-parenting and cycles are rejected. Adding a child already parented to this same parent is a successful no-op and does not change child order. A child removed and re-added to a parent is appended to that parent's child order.

## Parenting and scene ownership

- Two unattached objects may be parented. The child and its subtree remain unattached.
- An attached parent may adopt an unattached child and its subtree; the whole subtree joins the parent's GameScene.
- Two objects in the same GameScene may be reparented without changing scene membership or scene insertion order.
- Objects attached to different GameScenes cannot be parented together.
- An unattached parent cannot adopt an object already attached to a GameScene.
- Removing a child makes it a root in the same scene if its former parent was attached, or an unattached root otherwise. It preserves world transform by default and does not destroy the child or descendants.
- GameScene.remove(object) detaches that object and its entire subtree, preserving their internal parent/child links. If object had a parent, it becomes a root. The removed subtree becomes unattached and remains alive. Before returning, synchronize adapters in the subtree against its detached hierarchy: its root renderer node becomes a native root with worldMatrix, descendants retain their internal renderer parenting, and live audio voices receive their final world positions. Owned handles and voices remain alive; detached physics components are no longer synchronized by that GameScene until reattachment.
- GameScene.add accepts only an unattached, unparented, live root and returns the same typed object. It returns null if the object is destroyed, already belongs to a scene, still has a parent, or the GameScene has been destroyed. To add below an attached object, use addChild.
- GameScene.remove of a descendant detaches that descendant subtree from its parent and scene. Other objects remain in the scene.
- GameScene.destroy is idempotent, rejects future additions, and destroys all remaining roots and their descendants. GameScene.remove returns false without changing ownership if preserving the selected subtree's world transform cannot be represented as TRS.

scene, parent, children, and component.gameObject are readonly relationships. children and GameScene.objects return snapshots, not mutable internal arrays. GameScene.objects lists all attached objects, including descendants, in scene insertion order.

Scene insertion order is assigned when a root/subtree joins a scene. A subtree is appended in parent-first preorder and child-list order. Reparenting within the same scene preserves every object's insertion position. Removing and later re-adding an object appends it as a new insertion, but retains its one-time lifecycle state. Re-adding a subtree appends it in parent-first preorder.

## Activation

active is the object's local authored flag. activeInHierarchy is true only when the object and every ancestor have active=true and the object is not destroyed. An unattached object may report activeInHierarchy from its local/parent chain, but it receives no scene callbacks until it belongs to a GameScene.

enabled is a component-local flag. isActiveAndEnabled is true when the component is attached, not destroyed, enabled, and its GameObject is activeInHierarchy. Object update/fixedUpdate callbacks require activeInHierarchy. Component callbacks require isActiveAndEnabled.

Activation gates lifecycle update callbacks only. It does not destroy resources, automatically disable physics bodies, or set renderer visibility. Render visibility remains controlled by the existing renderer API. Explicit adapter synchronization follows its documented scene phase and handle ownership.

## Lifecycle

GameObject and GameComponent expose explicit overridable methods: onAwake(), onStart(), update(dt), fixedUpdate(dt), and onDestroy(). There is no automatic method discovery.

- Adding an object to a GameScene calls GameObject.onAwake once, even when inactive. For a subtree, callbacks run parent first; for each object, its onAwake runs before its current components' onAwake in attachment order, then children are visited in child-list order.
- onAwake is once per instance lifetime. Detaching and re-adding an object, including into another scene, does not repeat it.
- A component attached to an already-awake object gets onAwake immediately after attachment. A component attached before its owner enters a scene gets onAwake when that object enters the scene.
- onStart runs once per object/component, immediately before that instance's first regular update callback while active. A component attached to an already-started owner gets onStart immediately before its own first eligible update. Disabled or inactive instances wait until they become eligible. fixedUpdate does not start an instance; it may run before the first regular update/onStart.
- GameScene.update(dt) calls, in scene insertion order, each eligible object's onStart if needed, its update(dt), then each eligible component's onStart if needed followed immediately by its update(dt), in component attachment order.
- GameScene.updateFixed(dt) calls fixedUpdate(dt) for eligible objects and components in scene insertion and component attachment order. It does not call physics step and does not call onStart.
- Destroying an object or its ancestor marks the affected subtree destroyed immediately. No later callback from that subtree runs in the current phase. The callback already on the stack is allowed to return normally. Each object's parent and scene remain readable through that object's own onDestroy and component onDestroy callbacks. Children are destroyed and unlinked before the parent's onDestroy, so the parent callback sees an empty children list. The object is unlinked from its parent/scene after its hooks finish. Component gameObject remains its owner through that component's onDestroy callback and is cleared immediately afterward.
- onDestroy runs once even if onAwake/onStart never ran. It is synchronous with destroy/removeComponent/scene.destroy.
- Component removal is destructive: it calls onDestroy exactly once while component.gameObject still references its owner, then clears ownership and releases resources it owns. A removed component cannot be reattached.
- Destruction is child-first. For each object: recursively destroy children in child-list order; call GameObject.onDestroy; then call component onDestroy in reverse attachment order. All components remain attached and queryable during GameObject.onDestroy. Each component remains queryable and its gameObject remains its owner through its own onDestroy callback, then it is removed from the component list and ownership is cleared.
- Destroying a scene destroys its roots in scene insertion order. All destruction paths are idempotent.

## Deterministic mutation during callbacks

Each update/updateFixed pass snapshots the scene insertion list, every object's attachment generation, and every object's component attachment list before invoking the first callback. Mutations update the authoritative scene/hierarchy/component state immediately but never modify the snapshot currently being iterated.

Objects/components added during a phase receive required onAwake immediately, but are absent from that phase's snapshot and begin update/fixedUpdate callbacks on the next corresponding phase call. Removals/detaches/destroys immediately mark the target ineligible, so a snapshot entry later in the same phase is skipped. Activation and enabled flags are rechecked before every callback.

Each scene attachment receives an internal generation number. Removing and re-adding the same object during one phase creates a new generation, so the stale snapshot entry cannot dispatch it in the current phase. Re-addition is a new insertion appended to scene.objects. Component removals are similarly checked against current ownership and destroyed state. These rules give immediate query semantics, deterministic callback order, and no mutation of the arrays being traversed.

## Components and resource ownership

GameComponent has no engine-managed native state. User subclasses may keep ordinary TypeScript fields and constructor arguments. A component belongs to at most one GameObject at a time. Components can be constructed before attachment; gameObject is null until attached and null again after destructive removal.

SceneNodeComponent wraps an existing SceneNodeHandle. It stores the handle and an ownership option that defaults to borrowed. GameScene synchronizes its node after update/updateFixed and after physics read-back. When the GameObject's immediate parent also has a SceneNodeComponent, the adapter sets the renderer node parent and supplies the local matrix. Otherwise it clears the renderer parent and supplies the GameObject world matrix. This handles visual children under non-rendered GameObjects without applying parent transforms twice. On component removal/destruction, first unparent the native node. A borrowed node is then left at the GameObject world matrix; an owned node is destroyed. A scene node is never created implicitly by the component.

RigidBodyComponent wraps an existing WorldHandle and BodyHandle. Its options require the known MotionType and default body ownership to borrowed. The caller supplies motionType because the existing physics wrapper does not expose a body motion-type getter. The world and shapes remain borrowed. An owned body is destroyed on component removal/destruction; borrowed bodies remain valid. The component never creates, destroys, or steps a world.

AudioSourceComponent wraps a shared Sound asset and owns only a live voice handle. Its options default to looping=false, refDist=1, maxDist=0, and rolloff=1. play() stops any current voice, creates a 3D voice at the owning object's worldPosition, and returns false if unattached or voice creation returns handle 0. stop() is idempotent. GameScene updates a live voice's position after each regular/fixed phase. Removing/destroying the component stops its voice once. It never unloads the Sound asset.

GameScene's internal adapter synchronization includes all alive, attached adapters regardless of active/enabled; those flags gate lifecycle callbacks only. For all adapters, ownership transfer is explicit. Shared model, sound, material, and shape assets remain owned by the game/asset-loading code. GameObject.id is not used as any adapter handle.

## Physics synchronization

Physics stepping stays explicit and under game control:

~~~ts
scene.updateFixed(fixedDt);
scene.syncPhysicsBeforeStep(world, fixedDt);
physics.step(world, fixedDt);
scene.syncPhysicsAfterStep(world);
~~~

syncPhysicsBeforeStep pushes transforms for associated static bodies with setBodyTransform and kinematic bodies with moveKinematic using fixedDt. It ignores components bound to other worlds, destroyed/removed components, and invalid handles. syncPhysicsAfterStep reads dynamic body position/rotation, writes them into the owning object's world pose while preserving its local scale, and then synchronizes renderer nodes and live AudioSourceComponent voice positions. It ignores other worlds and static/kinematic bodies. A singular parent transform or invalid body is skipped without corrupting the GameObject transform. Neither GameScene.update nor updateFixed calls physics.step.

## Perry compatibility gate

The local Perry compiler observed for this plan is 0.5.1022. Before implementing or publishing this API, a minimal fixture must validate, on every project game target, class declarations, direct construction with `new`, extends/super constructor argument forwarding, method overrides, `instanceof` including multi-level inheritance, generic component lookup using a constructor parameter, readonly properties, subclass-preserving generic returns, and arrays containing subclass instances. The runtime receives component constructors for `instanceof` lookup; it never instantiates user classes dynamically. A generic helper that calls `new type(...)` is outside this feature's contract: Perry's strict checker accepts that pattern, but its native runtime does not correctly initialize the resulting class instance. Include explicit override keyword support as a separate check; if the keyword fails but method overriding works, examples omit the keyword. Failures in the required public behaviors block implementation until the API is revised from compiler evidence.

The target matrix follows the repository's game platforms: macOS, Windows, Linux, iOS, tvOS, watchOS, Android, visionOS, and Web/WASM. Run at least one native executable test and a Web/WASM compile. Do not add FFI functions or pass class instances through native calls.

## Serialized world compatibility

WorldData, its schema version, serialized entity format, and instantiateWorld remain unchanged. instantiateWorld continues creating renderer handles. GameScene initially owns only runtime-created gameplay classes. JSON never selects a TypeScript subclass. A future explicit factory mapping is a separate feature.

## Implementation phases

1. Prove Perry class/generic/instanceof compatibility across supported targets. Stop before API code if the contract is unsupported.
2. Implement math-backed Transform local/world TRS and world-preserving conversion rules.
3. Implement GameComponent and GameObject ownership, activation, parenting, and relationship APIs.
4. Implement GameScene lifecycle, fixed phase, insertion ordering, snapshots, generation checks, and destruction.
5. Add renderer, physics, and audio adapters as separate modules using existing handle APIs.
6. Add exports, compatibility documentation, and a user guide with a Player subclass example.
7. Run runtime tests and the full Perry/platform matrix; confirm WorldData and existing subsystem signatures are unchanged.

## Test plan

- Perry compile fixture for every language feature and every project target listed above.
- Runtime lifecycle assertions for awake/start/update/fixed/destroy order, inactive/disabled behavior, late attachment, remove/re-add, self-destruction, parent destruction, and idempotence.
- Parenting matrix for unattached/attached same-scene/different-scene cases, cycle rejection, child removal, scene subtree removal, and preserve-world/local modes including singular and shear-producing transforms.
- Mutation tests proving additions wait until the next corresponding pass, removals/destruction suppress later callbacks immediately, snapshots retain order, and re-adds append without duplicate dispatch.
- Component tests for instanceof lookup, subclass lookup, duplicates, one-owner enforcement, null/false failure results, destructive removal, and exactly-once cleanup.
- Adapter tests with known mock handles or a test seam: borrowed/owned node and body cleanup; direct render-parent mapping and non-rendered parent fallback; static/kinematic push; dynamic pull; world filtering; sound voice positioning/stopping; and shared asset preservation.
- Compatibility regression check: instantiate a typed schema-v2 WorldData fixture containing a legacy EntityData record and assert instantiateWorld retains its current warning/result-handle behavior. Compile the existing world-viewer consumer and verify the schema, loader, serializer, and fixture data have no changes.
- Cross-platform gates: all target compile checks pass, native runtime suite passes, Web/WASM build passes, and existing native subsystem API manifests/diffs show no signature changes.

## Documentation changes

- Correct docs/design-api.md to distinguish the function/handle-based native API from the opt-in class-based TypeScript gameplay runtime. Remove claims that class APIs are incompatible with Perry FFI.
- Add docs/game-objects.md with subclass construction, component attachment/lookup, transform and parenting behavior, active/enabled semantics, explicit scene update/fixed update plus physics sequence, resource ownership, and destruction rules.
- Add the game module to the README module table.
- Keep world-format documentation and serialized-world examples unchanged; link from the new guide without implying custom subclass deserialization.

## Out of scope

Prefab integration; global scene manager; scene transitions; automatic runGame integration; editor integration; networking; custom subclass serialization; dependency injection; reflection/decorator registries; runtime code generation; built-in Player/NPC classes; native GameObject types; new native FFI functions.

## Acceptance criteria

1. A game can declare Player extends GameObject, use new Player(...), override lifecycle methods, attach it to GameScene, and preserve the Player type through scene.add.
2. Transform exposes mutable local TRS plus documented world accessors and helpers; preserve-world parenting is the default and fails atomically when exact TRS conversion is impossible.
3. Relationships are readonly to callers; all attach/reparent/remove/destroy edge cases follow this spec and return null/false on invalid operations.
4. Awake/start/update/fixed/destroy dispatch exactly once where specified, in deterministic insertion/attachment order, including mutation during callbacks.
5. Component lookup works with typed constructors and instanceof; components have single ownership and destructive removal calls onDestroy once.
6. Renderer, physics, and audio adapters use existing numeric handles with explicit ownership; no GameObject or component instance crosses FFI.
7. Physics stepping remains caller-owned, and before/after synchronization filters by WorldHandle.
8. Existing renderer, physics, audio, WorldData, and instantiateWorld APIs/data remain backward-compatible.
9. The Perry compatibility matrix passes for all project game targets before the class API is published.
10. The new docs explain the opt-in runtime layer without adding engine-owned gameplay subclasses.
