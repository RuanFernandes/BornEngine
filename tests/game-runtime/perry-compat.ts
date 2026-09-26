import { Game } from '@bornengine/engine';
import {
  GameComponent,
  GameObject,
  GameScene,
  Scene,
  SceneNodeComponent,
} from '@bornengine/engine/game';
import type { SoundManager as AudioManager } from '@bornengine/engine/audio';
import type { InputActionMap } from '@bornengine/engine/input';
import type { ManagedSoundOptions as RootManagedSoundOptions } from '@bornengine/engine';
import type { SoundManager as RootSoundManager } from '@bornengine/engine';
import type { ManagedSoundOptions, SpatialSoundOptions } from '@bornengine/engine/audio';

declare const process: { exit(code: number): never };

const game = new Game();

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

class PublicPlayer extends GameObject {
  constructor() {
    super({ name: 'Perry compatibility player' });
  }
}

class PublicHealth extends GameComponent {
  value = 100;
}

const gameScene = new GameScene(game);
const publicPlayer = new PublicPlayer();
const attachedPlayer: PublicPlayer | null = gameScene.add(publicPlayer);
requireTrue(attachedPlayer === publicPlayer, 'GameScene.add preserves subclass type');

const publicHealth = new PublicHealth();
const attachedHealth: PublicHealth | null = attachedPlayer === null
  ? null
  : attachedPlayer.addComponent(publicHealth);
const foundHealth: PublicHealth | null = attachedPlayer === null
  ? null
  : attachedPlayer.getComponent(PublicHealth);
const allPublicHealth: PublicHealth[] = attachedPlayer === null
  ? []
  : attachedPlayer.getComponents(PublicHealth);
requireTrue(attachedHealth === publicHealth && foundHealth === publicHealth &&
  allPublicHealth.length === 1 && allPublicHealth[0] === publicHealth,
  'public GameObject component API preserves concrete types');

class ScenePlayer extends GameObject {}
const oopScene = new Scene(game, { name: 'compatibility-scene' });
const oopManager = game.scenes;
const scenePlayer = oopScene.addNode(new ScenePlayer());
const rendererNode = game.sceneGraph.createNode();
const rendererComponent: SceneNodeComponent | null = rendererNode.isLoaded
  ? new SceneNodeComponent(rendererNode, { ownership: 'owned' })
  : null;
if (scenePlayer !== null && rendererComponent !== null) {
  const configuredRenderer: SceneNodeComponent = rendererComponent
    .setVisible(true)
    .setColor({ r: 255, g: 255, b: 255, a: 255 })
    .setPbr(0.5, 0.1)
    .setTextureSlot(0);
  scenePlayer.addComponent(configuredRenderer);
}
oopManager.changeTo(oopScene);

const compatibilityInput: InputActionMap = game.input.createActionMap();
compatibilityInput.bindAction('jump', { kind: 'key', key: 32 });
compatibilityInput.bindAction('confirm', [
  { kind: 'key', key: 13 },
  { kind: 'gamepad', button: 0 },
]);
compatibilityInput.bindAxis('move-x', {
  negative: [{ kind: 'key', key: 65 }],
  positive: [{ kind: 'key', key: 68 }],
  gamepadAxis: { axis: 0, deadzone: 0.15 },
});
compatibilityInput.update();
const compatibilityVector = compatibilityInput.readVector2('move-x', 'move-y');
requireTrue(typeof compatibilityInput.isDown('jump') === 'boolean' &&
  typeof compatibilityInput.wasPressed('jump') === 'boolean' &&
  typeof compatibilityInput.wasReleased('jump') === 'boolean' &&
  typeof compatibilityInput.readAxis('move-x') === 'number' &&
  typeof compatibilityVector.x === 'number' && typeof compatibilityVector.y === 'number',
  'InputActionMap public query surface');
compatibilityInput.clear();

const compatibilityAudio: AudioManager = game.audio.createSoundManager();
const managedSoundOptions: ManagedSoundOptions = {
  bus: 2,
  cooldownSeconds: 0.1,
  volumeRange: [0.9, 1.1],
  pitchRange: [0.95, 1.05],
};
const managedSpatialOptions: SpatialSoundOptions = { looping: true, refDist: 1, maxDist: 20, rolloff: 1 };
compatibilityAudio.loadSound('compatibility', 'assets/tone.wav', managedSoundOptions);
compatibilityAudio.playSound('compatibility');
compatibilityAudio.play3D('compatibility', { x: 0, y: 0, z: -1 }, managedSpatialOptions);
compatibilityAudio.update(0.016);
compatibilityAudio.dispose();
const rootAudioManager: RootSoundManager = game.audio.createSoundManager();
const rootManagedOptions: RootManagedSoundOptions = { volumeRange: [1, 1] };
rootAudioManager.loadSound('root-compatibility', 'assets/tone.wav', rootManagedOptions);
const rootSound = game.audio.loadSound('assets/tone.wav');
rootSound.play();
rootSound.dispose();
rootAudioManager.dispose();
game.dispose();
console.log('Perry compatibility fixture passed');
