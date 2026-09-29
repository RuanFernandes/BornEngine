import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Vec3, Camera2D } from '../../src/core/types';
import { AudioListener2D } from '../../src/audio/audio-listener-2d';
import { AudioEmitter2D } from '../../src/audio/audio-emitter-2d';
import type { Sound, SoundVoice, SpatialPlaybackOptions } from '../../src/audio/sound';
import type { AudioSystem } from '../../src/audio/audio-system';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const context = GameContext.create();
if (context === null) {
  console.error('FAIL: test Game context is available');
  process.exit(1);
}
context.markReady();

const cameraA: Camera2D = {
  offset: { x: 0, y: 0 }, target: { x: 10, y: 20 }, rotation: 0, zoom: 1,
};
const cameraB: Camera2D = {
  offset: { x: 0, y: 0 }, target: { x: -4, y: 5 }, rotation: Math.PI / 2, zoom: 1,
};
const activeScene: any = { camera2D: cameraA, state: 'active' };
const owner = { scenes: { currentScene: activeScene } } as any as Game;
bindGameContext(owner, context);
const listenerCalls: Array<{ position: Vec3; forward: Vec3 }> = [];
const audio = {
  setListener: (position: Vec3, forward: Vec3) => {
    listenerCalls.push({ position, forward });
    return true;
  },
} as any as AudioSystem;
const listener = new AudioListener2D(owner, audio);
listener.update();
expect(listenerCalls.length === 1 && listenerCalls[0].position.x === 10 &&
  listenerCalls[0].position.z === 20 && listenerCalls[0].forward.z === -1,
  'listener follows the active scene camera in XY audio space');

activeScene.camera2D = cameraB;
listener.update();
expect(listenerCalls.length === 2 && listenerCalls[1].position.x === -4 &&
  Math.abs(listenerCalls[1].forward.x - 1) < 0.0001,
  'listener follows active scene switches and camera rotation');

listener.setPosition({ x: 3, y: 8 });
listener.update();
expect(listenerCalls[2].position.x === 3 && listenerCalls[2].position.z === 8,
  'explicit listener position overrides the scene camera');
listener.followCamera();
listener.update();
expect(listenerCalls[3].position.x === -4,
  'listener can return to camera-derived position');

let playedPosition: Vec3 | null = null;
let playedOptions: SpatialPlaybackOptions | null = null;
let stopCalls = 0;
let voicePosition: Vec3 | null = null;
const voice: SoundVoice = {
  isActive: true,
  setPosition: (position) => { voicePosition = position; return true; },
  setVolume: () => true,
  setPitch: () => true,
  setLowpass: () => true,
  stop: () => { stopCalls++; },
  dispose: () => { stopCalls++; },
};
const sound = {
  isLoaded: true,
  _belongsToContext: (candidate: GameContext) => candidate === context,
  play3D: (position: Vec3, options: SpatialPlaybackOptions) => {
    playedPosition = position;
    playedOptions = options;
    return voice;
  },
} as any as Sound;
const emitter = new AudioEmitter2D(sound, listener, {
  looping: true, refDist: 2, maxDist: 12, rolloff: 0.5,
});
const scene = new GameScene(owner);
const object = new GameObject({ position: { x: 14, y: 17, z: 99 } });
expect(object.addComponent(emitter) === emitter && scene.add(object) === object,
  'emitter attaches as a normal GameComponent');
expect(emitter.gameObject === object && emitter.isActiveAndEnabled,
  'emitter is active after scene attachment');
expect(sound.isLoaded && !listener.isDisposed,
  'emitter dependencies remain available');
expect(voice.isActive, 'fixture voice starts active');
expect(emitter.play(), 'emitter starts an existing Sound voice');
expect(playedPosition !== null && playedPosition.x === 14 &&
  playedPosition.z === 17 && playedPosition.y === 0,
  'emitter maps its XY world position to the existing 3D voice');
expect(playedOptions !== null && playedOptions.looping === true &&
  playedOptions.refDist === 2 && playedOptions.maxDist === 12 &&
  playedOptions.rolloff === 0.5,
  'attenuation settings pass through to Sound.play3D');

object.transform.position = { x: 21, y: -2, z: 50 };
scene.update(0.016);
expect(voicePosition !== null && voicePosition.x === 21 && voicePosition.z === -2,
  'emitter tracks XY movement without allocating a mixer');
emitter.stop();
emitter.stop();
expect(stopCalls === 1, 'emitter stop is idempotent');
emitter.play();
emitter.enabled = false;
scene.update(0.016);
expect(stopCalls === 2 && !emitter.isPlaying && !emitter.play(),
  'disabling the component stops its voice and blocks new playback');
emitter.enabled = true;
expect(emitter.play(), 'an enabled emitter can start playback again');
scene.destroy();
expect(stopCalls === 3, 'component destruction stops its active voice');

listener.dispose();
scene.destroy();
context.dispose();
console.log('AudioEmitter2D spatial lifecycle fixture passed');
