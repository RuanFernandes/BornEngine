import { closeWindow, initWindow } from '../../src/core';
import { closeAudio, initAudio, loadSound, playSound } from '../../src/audio';
import { instantiateWorld } from '../../src/world/loader';
import { WORLD_SCHEMA_VERSION } from '../../src/world/types';
import type { WorldData } from '../../src/world/types';
import {
  AudioSourceComponent,
  GameObject,
  GameScene,
  RigidBodyComponent,
  SceneNodeComponent,
} from '../../src/game';
import {
  createBody,
  createWorld,
  destroyBody,
  destroyWorld,
  getBodyPosition,
  isBodyValid,
  MotionType,
  releaseShape,
  setBodyRotation,
  setBodyPosition,
  sphereShape,
  step,
} from '../../src/physics';
import {
  createSceneNode,
  destroySceneNode,
  getSceneNodeCount,
  getSceneNodeTransform,
} from '../../src/scene';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function near(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001;
}

initWindow(640, 480, 'BornEngine Game Runtime Adapter Test');

const initialNodeCount = getSceneNodeCount();
const borrowedNode = createSceneNode();
const ownedNode = createSceneNode();
const ownershipScene = new GameScene();
const borrowedObject = new GameObject({ position: { x: 3, y: 4, z: 5 } });
const ownedObject = new GameObject();
borrowedObject.addComponent(new SceneNodeComponent(borrowedNode));
ownedObject.addComponent(new SceneNodeComponent(ownedNode, { ownership: 'owned' }));
ownershipScene.add(borrowedObject);
ownershipScene.add(ownedObject);
ownershipScene.update(0);
expect(getSceneNodeCount() === initialNodeCount + 2,
  'wrapping existing handles does not create additional scene nodes');
borrowedObject.destroy();
ownedObject.destroy();
expect(getSceneNodeCount() === initialNodeCount + 1,
  'destroying objects destroys owned nodes and preserves borrowed nodes');
const borrowedTransform = getSceneNodeTransform(borrowedNode);
expect(near(borrowedTransform[12], 3) && near(borrowedTransform[13], 4) &&
  near(borrowedTransform[14], 5),
  'borrowed node is detached at the GameObject world transform');
destroySceneNode(borrowedNode);

const hierarchyBaseCount = getSceneNodeCount();
const parentNode = createSceneNode();
const childNode = createSceneNode();
const fallbackNode = createSceneNode();
const renderScene = new GameScene();
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
const parentTransform = getSceneNodeTransform(parentNode);
const childTransform = getSceneNodeTransform(childNode);
const fallbackTransform = getSceneNodeTransform(fallbackNode);
expect(near(parentTransform[12], 10), 'renderer parent receives its world transform');
expect(near(childTransform[12], 2),
  'rendered child receives its local transform under a rendered parent');
expect(near(fallbackTransform[12], 105),
  'child below a non-rendered parent receives its world transform');
expect(renderScene.remove(renderedChild), 'scene detaches a rendered child subtree');
const detachedChildTransform = getSceneNodeTransform(childNode);
expect(near(detachedChildTransform[12], 12),
  'scene removal immediately detaches and writes the child world transform');
expect(renderedParent.addChild(renderedChild) === renderedChild,
  'attached renderer parent can adopt the detached child again');
renderScene.update(0);
const renderedParentComponent = renderedParent.getComponent(SceneNodeComponent);
expect(renderedParentComponent !== null &&
  renderedParent.removeComponent(renderedParentComponent),
  'renderer component can be removed from an attached parent');
const childWithoutRenderedParent = getSceneNodeTransform(childNode);
expect(near(childWithoutRenderedParent[12], 12),
  'child renderer falls back to world transform when parent renderer is removed');
renderScene.destroy();
expect(getSceneNodeCount() === hierarchyBaseCount,
  'owned renderer nodes are destroyed with their GameObjects');

const physicsWorld = createWorld({ gravity: { x: 0, y: 0, z: 0 } });
const otherPhysicsWorld = createWorld({ gravity: { x: 0, y: 0, z: 0 } });
const physicsShape = sphereShape(0.5);
const staticBody = createBody(physicsWorld, physicsShape, {
  motionType: MotionType.STATIC,
  position: { x: 1, y: 0, z: 0 },
});
const kinematicBody = createBody(physicsWorld, physicsShape, {
  motionType: MotionType.KINEMATIC,
  position: { x: 2, y: 0, z: 0 },
});
const dynamicBody = createBody(physicsWorld, physicsShape, {
  motionType: MotionType.DYNAMIC,
  position: { x: 3, y: 0, z: 0 },
  gravityFactor: 0,
});
const otherWorldBody = createBody(otherPhysicsWorld, physicsShape, {
  motionType: MotionType.STATIC,
  position: { x: 4, y: 0, z: 0 },
});
const ownedBody = createBody(physicsWorld, physicsShape, {
  motionType: MotionType.STATIC,
});
const singularParentBody = createBody(physicsWorld, physicsShape, {
  motionType: MotionType.DYNAMIC,
  position: { x: 0, y: 0, z: 0 },
  gravityFactor: 0,
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
staticObject.addComponent(new RigidBodyComponent(physicsWorld, staticBody, {
  motionType: MotionType.STATIC,
}));
kinematicObject.addComponent(new RigidBodyComponent(physicsWorld, kinematicBody, {
  motionType: MotionType.KINEMATIC,
}));
dynamicObject.addComponent(new RigidBodyComponent(physicsWorld, dynamicBody, {
  motionType: MotionType.DYNAMIC,
}));
otherWorldObject.addComponent(new RigidBodyComponent(otherPhysicsWorld, otherWorldBody, {
  motionType: MotionType.STATIC,
}));
ownedBodyObject.addComponent(new RigidBodyComponent(physicsWorld, ownedBody, {
  motionType: MotionType.STATIC,
  ownership: 'owned',
}));
singularPhysicsObject.addComponent(new RigidBodyComponent(physicsWorld, singularParentBody, {
  motionType: MotionType.DYNAMIC,
}));
invalidBodyObject.addComponent(new RigidBodyComponent(physicsWorld, 0, {
  motionType: MotionType.DYNAMIC,
}));
singularPhysicsParent.addChild(singularPhysicsObject, { preserveWorldTransform: false });
const physicsScene = new GameScene();
physicsScene.add(staticObject);
physicsScene.add(kinematicObject);
physicsScene.add(dynamicObject);
physicsScene.add(otherWorldObject);
physicsScene.add(ownedBodyObject);
physicsScene.add(singularPhysicsParent);
physicsScene.add(invalidBodyObject);
physicsScene.syncPhysicsBeforeStep(physicsWorld, 1 / 60);
expect(near(getBodyPosition(staticBody).x, 10),
  'static body receives its owning GameObject world transform');
expect(near(getBodyPosition(otherWorldBody).x, 4),
  'physics sync ignores bodies from another world');
step(physicsWorld, 1 / 60);
expect(near(getBodyPosition(kinematicBody).x, 20),
  'kinematic body moves to its GameObject transform during the caller-owned step');
setBodyPosition(dynamicBody, { x: 30, y: 0, z: 0 }, false);
setBodyRotation(dynamicBody, { x: 0, y: 0, z: 0.70710678, w: 0.70710678 }, false);
physicsScene.syncPhysicsAfterStep(physicsWorld);
expect(near(dynamicObject.transform.worldPosition.x, 30) &&
  near(dynamicObject.transform.worldRotation.z, 0.70710678) &&
  near(dynamicObject.transform.scale.x, 2) &&
  near(dynamicObject.transform.scale.y, 3) &&
  near(dynamicObject.transform.scale.z, 4),
  'dynamic body updates world pose while preserving GameObject scale');
expect(near(otherWorldObject.transform.worldPosition.x, 99),
  'physics read-back ignores a component bound to another world');
setBodyPosition(singularParentBody, { x: 40, y: 0, z: 0 }, false);
physicsScene.syncPhysicsAfterStep(physicsWorld);
expect(near(singularPhysicsObject.transform.position.x, 2) &&
  near(invalidBodyObject.transform.position.x, 7),
  'singular parents and invalid body handles leave GameObject transforms unchanged');
physicsScene.destroy();
expect(isBodyValid(staticBody) && isBodyValid(kinematicBody) &&
  isBodyValid(dynamicBody) && isBodyValid(otherWorldBody) &&
  isBodyValid(singularParentBody),
  'borrowed bodies remain alive when the scene is destroyed');
expect(!isBodyValid(ownedBody), 'owned body is destroyed with its component');
destroyBody(staticBody);
destroyBody(kinematicBody);
destroyBody(dynamicBody);
destroyBody(otherWorldBody);
destroyBody(singularParentBody);
releaseShape(physicsShape);
destroyWorld(physicsWorld);
destroyWorld(otherPhysicsWorld);

initAudio();
const sound = loadSound('tests/game-runtime/assets/tone.wav');
const unattachedAudioSource = new AudioSourceComponent(sound);
expect(!unattachedAudioSource.play(),
  'audio source cannot start playback without a live GameObject');
const audioScene = new GameScene();
const firstAudioObject = new GameObject({ position: { x: 1, y: 2, z: 3 } });
const secondAudioObject = new GameObject({ position: { x: 4, y: 5, z: 6 } });
const firstAudioSource = new AudioSourceComponent(sound, { looping: true });
const secondAudioSource = new AudioSourceComponent(sound, { looping: true });
firstAudioObject.addComponent(firstAudioSource);
secondAudioObject.addComponent(secondAudioSource);
audioScene.add(firstAudioObject);
audioScene.add(secondAudioObject);
expect(firstAudioSource.play() && secondAudioSource.play(),
  'audio source starts live voices from a shared Sound asset');
audioScene.updateFixed(0.01);
firstAudioSource.stop();
firstAudioSource.stop();
expect(firstAudioSource.play(), 'stopped audio source can start a new voice');
expect(firstAudioObject.removeComponent(firstAudioSource) &&
  !firstAudioSource.play(), 'component removal stops its voice and prevents reuse');
expect(secondAudioSource.play(),
  'removing one source preserves the shared Sound asset for other sources');
secondAudioObject.destroy();
expect(secondAudioSource.destroyed,
  'destroying the owner synchronously stops and destroys its audio component');
secondAudioSource.stop();
playSound(sound);
audioScene.destroy();
closeAudio();

const compatibilityWorld: WorldData = {
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
const instantiated = instantiateWorld(compatibilityWorld, {
  getModelHandle: (_modelRef: string) => 0,
  prefabRegistry: null,
});
expect(instantiated.entityHandles.size === 0,
  'legacy world entities with missing models remain skipped');
expect(instantiated.warnings.length === 1,
  'legacy world loader still reports a missing model');
expect(instantiated.terrainHandle === 0 && instantiated.waterHandles.length === 0 &&
  instantiated.riverHandles.length === 0,
  'legacy world loader result retains its empty terrain and water handles');

closeWindow();
console.log('Game runtime adapter fixture passed');
