import {
  AudioSourceComponent,
  Game,
  GameObject,
  GameScene,
  MotionType,
  PhysicsWorld,
  RigidBodyComponent,
  Scene,
  SceneNodeComponent,
  SphereCollider,
  WorldData,
} from '@bornengine/engine';
import type { SceneNode } from '@bornengine/engine/scene';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001;
}

function liveNodeCount(nodes: SceneNode[]): number {
  let count = 0;
  for (const node of nodes) if (node.isLoaded) count++;
  return count;
}

const game = new Game({ window: { width: 640, height: 480, title: 'BornEngine Class API Fixture' } });
const graph = game.sceneGraph;
const initialNodeCount = liveNodeCount(graph.getNodes());
const borrowedNode = graph.createNode({ name: 'borrowed' });
const ownedNode = graph.createNode({ name: 'owned' });
const ownershipScene = new GameScene(game);
const borrowedObject = new GameObject({ position: { x: 3, y: 4, z: 5 } });
const ownedObject = new GameObject();
borrowedObject.addComponent(new SceneNodeComponent(borrowedNode));
ownedObject.addComponent(new SceneNodeComponent(ownedNode, { ownership: 'owned' }));
ownershipScene.add(borrowedObject);
ownershipScene.add(ownedObject);
ownershipScene.update(0);
expect(liveNodeCount(graph.getNodes()) === initialNodeCount + 2,
  'wrapping existing SceneNode resources does not create duplicates');
borrowedObject.destroy();
ownedObject.destroy();
expect(liveNodeCount(graph.getNodes()) === initialNodeCount + 1,
  'owned scene-node components dispose their resource while borrowed nodes stay alive');
const borrowedTransform = borrowedNode.getTransform();
expect(borrowedTransform !== null && near(borrowedTransform[12], 3) &&
  near(borrowedTransform[13], 4) && near(borrowedTransform[14], 5),
  'a detached borrowed node keeps the GameObject world transform');
borrowedNode.dispose();

const factoryBaseCount = liveNodeCount(graph.getNodes());
const factoryNode = graph.createNode();
const factoryComponent = new SceneNodeComponent(factoryNode, { ownership: 'owned' });
const configuredFactoryComponent = factoryComponent
  .setVisible(true)
  .setColor({ r: 255, g: 255, b: 255, a: 255 })
  .setPbr(0.5, 0.1)
  .setTextureSlot(0);
expect(configuredFactoryComponent === factoryComponent,
  'renderer adapter methods return this for fluent setup');
const factoryObject = new GameObject();
const factoryScene = new GameScene(game);
factoryObject.addComponent(configuredFactoryComponent);
factoryScene.add(factoryObject);
factoryScene.destroy();
expect(liveNodeCount(graph.getNodes()) === factoryBaseCount,
  'owned SceneNode resources are disposed with their GameObject component');

const hierarchyBaseCount = liveNodeCount(graph.getNodes());
const parentNode = graph.createNode();
const childNode = graph.createNode();
const fallbackNode = graph.createNode();
const renderScene = new GameScene(game);
const renderedParent = new GameObject({ position: { x: 10, y: 0, z: 0 } });
const renderedChild = new GameObject({ position: { x: 2, y: 0, z: 0 } });
const plainParent = new GameObject({ position: { x: 100, y: 0, z: 0 } });
const fallbackChild = new GameObject({ position: { x: 5, y: 0, z: 0 } });
renderedParent.addComponent(new SceneNodeComponent(parentNode, { ownership: 'owned' }));
renderedChild.addComponent(new SceneNodeComponent(childNode, { ownership: 'owned' }));
fallbackChild.addComponent(new SceneNodeComponent(fallbackNode, { ownership: 'owned' }));
renderedParent.addChild(renderedChild, { preserveWorldTransform: false });
plainParent.addChild(fallbackChild, { preserveWorldTransform: false });
renderScene.add(renderedParent);
renderScene.add(plainParent);
renderScene.update(0);
const parentTransform = parentNode.getTransform();
const childTransform = childNode.getTransform();
const fallbackTransform = fallbackNode.getTransform();
expect(parentTransform !== null && near(parentTransform[12], 10),
  'renderer parent receives its world transform');
expect(childTransform !== null && near(childTransform[12], 2),
  'rendered child receives its local transform under a rendered parent');
expect(fallbackTransform !== null && near(fallbackTransform[12], 105),
  'child below a non-rendered parent receives its world transform');
expect(renderScene.remove(renderedChild), 'scene detaches a rendered child subtree');
const detachedChildTransform = childNode.getTransform();
expect(detachedChildTransform !== null && near(detachedChildTransform[12], 12),
  'scene removal immediately detaches and writes the child world transform');
expect(renderedParent.addChild(renderedChild) === renderedChild,
  'attached renderer parent can adopt the detached child again');
renderScene.update(0);
const renderedParentComponent = renderedParent.getComponent(SceneNodeComponent);
expect(renderedParentComponent !== null && renderedParent.removeComponent(renderedParentComponent),
  'renderer component can be removed from an attached parent');
const childWithoutRenderedParent = childNode.getTransform();
expect(childWithoutRenderedParent !== null && near(childWithoutRenderedParent[12], 12),
  'child renderer falls back to world transform when parent renderer is removed');
renderScene.destroy();
expect(liveNodeCount(graph.getNodes()) === hierarchyBaseCount,
  'owned renderer nodes are disposed with their GameObjects');

const physicsWorld = new PhysicsWorld(game, { gravity: { x: 0, y: 0, z: 0 } });
const otherPhysicsWorld = new PhysicsWorld(game, { gravity: { x: 0, y: 0, z: 0 } });
const physicsShape = new SphereCollider(physicsWorld, 0.5);
const otherShape = new SphereCollider(otherPhysicsWorld, 0.5);
const staticBody = physicsWorld.createBody(physicsShape, {
  motionType: MotionType.STATIC,
  position: { x: 1, y: 0, z: 0 },
});
const kinematicBody = physicsWorld.createBody(physicsShape, {
  motionType: MotionType.KINEMATIC,
  position: { x: 2, y: 0, z: 0 },
});
const dynamicBody = physicsWorld.createBody(physicsShape, {
  motionType: MotionType.DYNAMIC,
  position: { x: 3, y: 0, z: 0 },
  gravityFactor: 0,
});
const otherWorldBody = otherPhysicsWorld.createBody(otherShape, {
  motionType: MotionType.STATIC,
  position: { x: 4, y: 0, z: 0 },
});
const ownedBody = physicsWorld.createBody(physicsShape, { motionType: MotionType.STATIC });
const singularParentBody = physicsWorld.createBody(physicsShape, {
  motionType: MotionType.DYNAMIC, gravityFactor: 0,
});
const staticObject = new GameObject({ position: { x: 10, y: 0, z: 0 } });
const kinematicObject = new GameObject({ position: { x: 20, y: 0, z: 0 } });
const dynamicObject = new GameObject({
  position: { x: 3, y: 0, z: 0 },
  scale: { x: 2, y: 3, z: 4 },
});
const otherWorldObject = new GameObject({ position: { x: 99, y: 0, z: 0 } });
const ownedBodyObject = new GameObject();
const singularPhysicsParent = new GameObject({ scale: { x: 0, y: 1, z: 1 } });
const singularPhysicsObject = new GameObject({ position: { x: 2, y: 0, z: 0 } });
const invalidBodyObject = new GameObject({ position: { x: 7, y: 0, z: 0 } });
staticObject.addComponent(new RigidBodyComponent(staticBody));
kinematicObject.addComponent(new RigidBodyComponent(kinematicBody));
dynamicObject.addComponent(new RigidBodyComponent(dynamicBody));
otherWorldObject.addComponent(new RigidBodyComponent(otherWorldBody));
ownedBodyObject.addComponent(new RigidBodyComponent(ownedBody, { ownership: 'owned' }));
singularPhysicsObject.addComponent(new RigidBodyComponent(singularParentBody));
invalidBodyObject.addComponent(new RigidBodyComponent(physicsWorld.createBody(otherShape)));
singularPhysicsParent.addChild(singularPhysicsObject, { preserveWorldTransform: false });
const physicsScene = new Scene(game, { name: 'physics-adapter-fixture' });
physicsScene.addNode(staticObject);
physicsScene.addNode(kinematicObject);
physicsScene.addNode(dynamicObject);
physicsScene.addNode(otherWorldObject);
physicsScene.addNode(ownedBodyObject);
physicsScene.addNode(singularPhysicsParent);
physicsScene.addNode(invalidBodyObject);
expect(game.scenes.changeTo(physicsScene), 'Game activates the physics scene');
physicsWorld.step(1 / 60);
expect(staticBody.position !== null && near(staticBody.position.x, 10),
  'static body receives its owning GameObject world transform');
expect(otherWorldBody.position !== null && near(otherWorldBody.position.x, 4),
  'physics sync ignores bodies from another world');
expect(kinematicBody.position !== null && near(kinematicBody.position.x, 20),
  'kinematic body follows its GameObject during the caller-owned step');
dynamicBody.setPosition({ x: 30, y: 0, z: 0 }, false);
dynamicBody.setRotation({ x: 0, y: 0, z: 0.70710678, w: 0.70710678 }, false);
physicsWorld.step(1 / 60);
expect(near(dynamicObject.transform.worldPosition.x, 30) &&
  near(dynamicObject.transform.worldRotation.z, 0.70710678) &&
  near(dynamicObject.transform.scale.x, 2) && near(dynamicObject.transform.scale.y, 3) &&
  near(dynamicObject.transform.scale.z, 4),
  'dynamic body updates the world pose while preserving GameObject scale');
expect(near(otherWorldObject.transform.worldPosition.x, 99),
  'physics read-back ignores a component bound to another world');
singularParentBody.setPosition({ x: 40, y: 0, z: 0 }, false);
physicsWorld.step(1 / 60);
expect(near(singularPhysicsObject.transform.position.x, 2) &&
  near(invalidBodyObject.transform.position.x, 7),
  'singular parents and invalid bodies leave GameObject transforms unchanged');
expect(game.scenes.unloadCurrent(), 'active physics scene unloads cleanly');
expect(staticBody.isLoaded && kinematicBody.isLoaded && dynamicBody.isLoaded && otherWorldBody.isLoaded &&
  singularParentBody.isLoaded,
  'borrowed bodies remain alive when their scene is unloaded');
expect(!ownedBody.isLoaded, 'owned bodies are disposed with their component');
physicsWorld.dispose();
otherPhysicsWorld.dispose();

const worldData = WorldData.create('adapter-fixture', 'Adapter Fixture');
expect(worldData.isLoaded && worldData.validate().ok,
  'WorldData exposes pure creation and validation through its class API');

const audioScene = new Scene(game, { name: 'audio-adapter-fixture' });
const audioManager = game.audio.createSoundManager();
const managedSound = audioManager.loadSound('source', 'tests/game-runtime/assets/tone.wav');
const audioObject = new GameObject();
if (managedSound !== null) audioObject.addComponent(new AudioSourceComponent(managedSound));
audioScene.addNode(audioObject);
audioScene.own(audioManager);
expect(game.scenes.changeTo(audioScene), 'Game activates an audio scene after physics unload');
if (managedSound !== null) expect(audioObject.getComponent(AudioSourceComponent) !== null,
  'AudioSourceComponent consumes an owned Sound resource');
audioScene.unload();
expect(!audioManager.playSound('source'), 'scene-owned audio manager is disposed with its scene');

game.dispose();
console.log('Game-owned adapter class API fixture passed');
