import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { Scene } from '../../src/game/scene';
import { SceneManager } from '../../src/game/scene-manager';

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

const transitionManager = new SceneManager();
class FirstScene extends Scene {
  enterRejected = false;
  pauseRejected = false;
  exitRejected = false;
  unloadRejected = false;

  onEnter(): void {
    this.enterRejected = !transitionManager.changeTo(new Scene());
  }

  onPause(): void {
    this.pauseRejected = !transitionManager.changeTo(new Scene());
  }

  onExit(): void {
    this.exitRejected = !transitionManager.changeTo(new Scene());
  }

  onUnload(): void {
    this.unloadRejected = !transitionManager.changeTo(new Scene());
  }
}
const firstScene = new FirstScene({ name: 'first' });
expect(transitionManager.changeTo(firstScene), 'manager activates a ready scene');
expect(firstScene.enterRejected && transitionManager.currentScene === firstScene,
  'onEnter cannot start a nested transition and sees itself current');
expect(transitionManager.pause() && firstScene.pauseRejected && firstScene.state === 'paused',
  'pause changes state before its hook and rejects a nested transition');
expect(transitionManager.resume() && firstScene.state === 'active',
  'resume reactivates a paused scene');
const secondScene = new Scene({ name: 'second' });
expect(transitionManager.changeTo(secondScene), 'manager switches to a fresh scene');
expect(firstScene.exitRejected && firstScene.unloadRejected && firstScene.state === 'unloaded',
  'teardown hooks reject nested transitions before the first scene unloads');
expect(transitionManager.currentScene === secondScene,
  'replacement is published as the current scene');
expect(!transitionManager.changeTo(firstScene) && transitionManager.currentScene === secondScene,
  'an unloaded scene cannot be reactivated');
expect(secondScene.unload(), 'current scene can unload directly');
expect(transitionManager.currentScene === null,
  'manager reports null after its current scene unloads directly');
const thirdScene = new Scene({ name: 'third' });
expect(transitionManager.changeTo(thirdScene),
  'manager accepts a fresh scene after direct unload');

class UpdateCounter extends GameObject {
  updates = 0;
  fixedUpdates = 0;

  update(): void { this.updates++; }
  fixedUpdate(): void { this.fixedUpdates++; }
}
class UpdateResource {
  elapsed = 0;
  disposed = false;

  update(dt: number): void { this.elapsed += dt; }
  dispose(): void { this.disposed = true; }
}

const pausedScene = new Scene({ name: 'paused' });
const pausedObject = new UpdateCounter();
const pausedResource = new UpdateResource();
pausedScene.addNode(pausedObject);
pausedScene.own(pausedResource);
expect(transitionManager.changeTo(pausedScene), 'manager can replace a directly unloaded scene');
expect(!new SceneManager().changeTo(pausedScene),
  'one active scene cannot be managed by two managers');
expect(transitionManager.pause(), 'active scene pauses');
transitionManager.update(0.25);
transitionManager.syncPhysicsBeforeStep(0, 1 / 60);
transitionManager.syncPhysicsAfterStep(0);
expect(pausedResource.elapsed === 0.25 && pausedObject.updates === 0,
  'paused scenes tick owned resources but skip GameObjects');
expect(transitionManager.resume(), 'paused scene resumes');
transitionManager.update(0.25);
expect(pausedResource.elapsed === 0.5 && pausedObject.updates === 1,
  'active scenes tick resources and GameObjects');

class UpdateSwitch extends GameObject {
  switched = false;
  private readonly manager: SceneManager;
  private readonly replacement: Scene;

  constructor(manager: SceneManager, replacement: Scene) {
    super();
    this.manager = manager;
    this.replacement = replacement;
  }

  update(): void {
    if (!this.switched) {
      this.switched = this.manager.changeTo(this.replacement);
    }
  }
}
const updateReplacement = new Scene({ name: 'update-replacement' });
const updateReplacementObject = new UpdateCounter();
updateReplacement.addNode(updateReplacementObject);
const updateSource = new Scene({ name: 'update-source' });
const updateSwitch = new UpdateSwitch(transitionManager, updateReplacement);
const skippedAfterUpdateSwitch = new UpdateCounter();
updateSource.addNode(updateSwitch);
updateSource.addNode(skippedAfterUpdateSwitch);
expect(transitionManager.changeTo(updateSource), 'manager activates update transition source');
transitionManager.update(0.1);
expect(updateSwitch.switched && transitionManager.currentScene === updateReplacement,
  'scene changes immediately when requested during update');
expect(skippedAfterUpdateSwitch.updates === 0 && updateReplacementObject.updates === 0,
  'the old scene stops dispatch and replacement waits for the next tick');
transitionManager.update(0.1);
expect(updateReplacementObject.updates === 1,
  'replacement starts updating on the next manager tick');

class FixedSwitch extends GameObject {
  switched = false;
  private readonly manager: SceneManager;
  private readonly replacement: Scene;

  constructor(manager: SceneManager, replacement: Scene) {
    super();
    this.manager = manager;
    this.replacement = replacement;
  }

  fixedUpdate(): void {
    if (!this.switched) this.switched = this.manager.changeTo(this.replacement);
  }
}
const fixedReplacement = new Scene({ name: 'fixed-replacement' });
const fixedReplacementObject = new UpdateCounter();
fixedReplacement.addNode(fixedReplacementObject);
const fixedSource = new Scene({ name: 'fixed-source' });
const fixedSwitch = new FixedSwitch(transitionManager, fixedReplacement);
const skippedAfterFixedSwitch = new UpdateCounter();
fixedSource.addNode(fixedSwitch);
fixedSource.addNode(skippedAfterFixedSwitch);
expect(transitionManager.changeTo(fixedSource), 'manager activates fixed transition source');
transitionManager.updateFixed(1 / 60);
expect(fixedSwitch.switched && transitionManager.currentScene === fixedReplacement,
  'scene changes immediately when requested during fixedUpdate');
expect(skippedAfterFixedSwitch.fixedUpdates === 0 && fixedReplacementObject.fixedUpdates === 0,
  'fixed dispatch stops on the old scene and waits before updating the replacement');
transitionManager.updateFixed(1 / 60);
expect(fixedReplacementObject.fixedUpdates === 1,
  'replacement receives fixedUpdate on the next manager tick');
expect(transitionManager.unloadCurrent() && transitionManager.currentScene === null,
  'unloadCurrent clears the active scene');
