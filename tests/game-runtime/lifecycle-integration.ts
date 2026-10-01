import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { AssetManager } from '../../src/assets/asset-manager';
import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { Scene } from '../../src/game/scene';
import { SceneManager } from '../../src/game/scene-manager';

function expect(value: boolean, label: string): void {
  if (!value) throw new Error('Runtime integration failure: ' + label);
}

class SharedAudioAsset {
  readonly isLoaded = true;
  readonly error: string | null = null;
  disposeCalls = 0;

  dispose(): void { this.disposeCalls++; }
}

class UpdateProbe extends GameComponent {
  updates = 0;
  destroyedCount = 0;

  update(): void { this.updates++; }
  onDestroy(): void { this.destroyedCount++; }
}

async function main(): Promise<void> {
  const context = GameContext.create();
  expect(context !== null, 'create a runtime context');
  if (context === null) return;
  context.markReady();

  const sound = new SharedAudioAsset();
  const music = new SharedAudioAsset();
  const audio = {
    loadSoundAsync: (_path: string): Promise<SharedAudioAsset> => Promise.resolve(sound),
    loadMusicAsync: (_path: string): Promise<SharedAudioAsset> => Promise.resolve(music),
  };
  const game = { audio } as Game;
  bindGameContext(game, context);

  const assets = new AssetManager(game);
  const scenes = new SceneManager(game);
  const first = new Scene(game, { name: 'first' });
  const actor = new GameObject({ name: 'player' });
  const probe = new UpdateProbe();
  actor.addComponent(probe);
  first.addNode(actor);

  const preload = first.assets.createGroup('first-scene');
  expect(preload !== null, 'create an asset preload group');
  if (preload === null) return;
  preload.addSound('assets/audio/step.wav');
  preload.addMusic('assets/audio/level.ogg');
  expect(first.own(preload) === preload, 'attach the preload group to its scene lifetime');
  expect(scenes.changeTo(first), 'activate the initial scene');

  expect(await preload.load() === 'ready', 'complete sound and music preloading');
  expect(first.assets.resourceCount === 2, 'register preloaded audio with the owning Scene scope');
  scenes.update(1 / 60);
  expect(probe.updates === 1, 'dispatch updates to components in the active scene');

  // Keep this lifecycle test independent from a graphics device: resource
  // factories should return inspectable failures without calling native code.
  context.markFailed('native resource creation is intentionally unavailable in this test');
  const sceneTexture = first.assets.loadTexture('assets/scene-only.png');
  const sceneParticles = first.vfx.createParticleSystem(16, { life: 0.25 });
  expect(sceneTexture !== null && sceneTexture.error !== null,
    'create a scene-owned texture through the scene asset manager');
  expect(sceneParticles !== null && sceneParticles.error !== null,
    'create scene-owned 3D particles through the scene VFX factory');

  const second = new Scene(game, { name: 'second' });
  expect(scenes.changeTo(second), 'switch to the replacement scene');
  expect(scenes.currentScene === second && first.state === 'unloaded',
    'publish the new scene and unload the previous scene');
  expect(preload.isDisposed && probe.destroyedCount === 1,
    'release scene-owned preload state and objects on scene exit');
  expect(sceneTexture !== null && sceneTexture.isDisposed &&
      sceneParticles !== null && sceneParticles.isDisposed,
    'release scene assets and VFX automatically on scene exit');
  expect(sound.disposeCalls === 1 && music.disposeCalls === 1,
    'release preloaded audio with its owning Scene scope');

  scenes.dispose();
  expect(scenes.currentScene === null, 'dispose the current scene through the manager');
  context.dispose();
  expect(context.isDisposed && assets.isDisposed,
    'dispose Game-owned services and their remaining resources with the runtime');
  expect(sound.disposeCalls === 1 && music.disposeCalls === 1,
    'Game shutdown does not double-dispose audio already released with the Scene');
}

main().then(() => console.log('Game, preload, scene transition, and disposal integration passed'));
