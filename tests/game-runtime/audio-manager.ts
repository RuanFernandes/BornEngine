import { Scene } from '../../src/game/scene';
import {
  BUS_UI,
  SoundManager,
  closeAudio,
  initAudio,
  isMusicPlayingRaw,
  loadMusicRaw,
  loadSound,
  playMusicRaw,
  playSoundEx,
  unloadMusic,
  unloadSound,
  voiceStop,
} from '../../src/audio/index';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const tonePath = 'tests/game-runtime/assets/tone.wav';
initAudio();

const manager = new SoundManager();
const sound = manager.loadSound('ui', tonePath, {
  bus: BUS_UI,
  volume: 0.75,
  cooldownSeconds: 0.25,
  volumeRange: [0.8, 1.2],
  pitchRange: [0.9, 1.1],
});
const cachedSound = manager.loadSound('ui', tonePath, {
  volume: 0.1,
  cooldownSeconds: 10,
});
expect(sound !== null && cachedSound !== null && sound.handle === cachedSound.handle,
  'same-name sound loads reuse the first handle and options');
expect(manager.loadSound('ui', 'tests/game-runtime/assets/other.wav') === null,
  'same-name conflicting sound path is rejected');
expect(manager.loadSound('invalid-range', tonePath, { volumeRange: [2, 1] }) === null,
  'reversed multiplier ranges are rejected');
expect(manager.loadSound('negative-volume-range', tonePath, { volumeRange: [-0.1, 1] }) === null,
  'negative volume multipliers are rejected');
expect(manager.loadSound('invalid-pitch-range', tonePath, { pitchRange: [0.1, 5] }) === null,
  'pitch multipliers outside the supported range are rejected');
expect(manager.loadSound('invalid-cooldown', tonePath, { cooldownSeconds: -1 }) === null,
  'negative cooldowns are rejected');
expect(manager.loadSound('invalid-bus', tonePath, { bus: 9 }) === null &&
  manager.loadSound('invalid-send', tonePath, { reverbSend: 1.1 }) === null &&
  manager.loadSound('invalid-lowpass', tonePath, { lowpassHz: -1 }) === null,
  'invalid mixer routing options are rejected');
expect(manager.loadSound('', tonePath) === null && manager.loadSound('empty-path', '') === null,
  'empty sound names and paths are rejected');
expect(manager.loadMusic('', tonePath) === null,
  'empty music names are rejected');

expect(manager.setSoundVolume('ui', 0.5), 'named sound volume can be changed');
manager.setMasterVolume(0.8);
manager.setBusGain(BUS_UI, 0.7);
expect(manager.playSound('ui'), 'registered sound plays');
expect(!manager.playSound('ui') && manager.play3D('ui', { x: 0, y: 0, z: -1 }) === 0,
  'cooldown is shared by 2D and 3D playback');
manager.update(0.25);
expect(manager.play3D('ui', { x: 0, y: 0, z: -1 }) !== 0,
  '3D sound plays after cooldown advances');
expect(manager.stopSound('ui'), 'named sound stops');
expect(manager.unloadSound('ui') && !manager.playSound('ui'),
  'unloaded sound cannot play');

const levelMusic = manager.loadMusic('level', tonePath);
const cachedLevelMusic = manager.loadMusic('level', tonePath, { volume: 0.1 });
const bossMusic = manager.loadMusic('boss', tonePath, { volume: 0.5 });
expect(levelMusic !== null && cachedLevelMusic !== null && bossMusic !== null &&
  levelMusic.handle === cachedLevelMusic.handle,
  'same-name music loads reuse the first handle and options');
expect(manager.loadMusic('level', 'tests/game-runtime/assets/other.wav') === null,
  'same-name conflicting music path is rejected');
expect(manager.setMusicVolume('level', 0.6), 'named music volume can be changed');
expect(manager.playMusic('level'), 'named level music plays');
expect(manager.playMusic('boss'), 'named boss music plays');
let levelMusicHandle = 0;
let bossMusicHandle = 0;
if (levelMusic !== null && bossMusic !== null) {
  levelMusicHandle = levelMusic.handle;
  bossMusicHandle = bossMusic.handle;
  expect(!isMusicPlayingRaw(levelMusicHandle) && isMusicPlayingRaw(bossMusicHandle),
    'starting named music stops the prior manager track');
  playMusicRaw(levelMusicHandle);
  expect(isMusicPlayingRaw(levelMusicHandle), 'registered music can be active alongside another track');
}
expect(manager.stopMusic(), 'unnamed stopMusic succeeds');
if (levelMusicHandle !== 0 && bossMusicHandle !== 0) {
  expect(!isMusicPlayingRaw(levelMusicHandle) && !isMusicPlayingRaw(bossMusicHandle),
    'unnamed stopMusic stops every registered track');
  expect(manager.playMusic('boss'), 'unloaded-track test starts music');
  expect(manager.unloadMusic('boss') && !manager.playMusic('boss') &&
    !isMusicPlayingRaw(bossMusicHandle), 'unloading active music stops and unregisters it');
}

const standaloneMusicHandle = loadMusicRaw(tonePath);
playMusicRaw(standaloneMusicHandle);
const standaloneSound = loadSound(tonePath);
const standaloneVoice = playSoundEx(standaloneSound);
expect(standaloneVoice !== 0, 'low-level controllable 2D voice is exported');
voiceStop(standaloneVoice);
unloadSound(standaloneSound);
expect(isMusicPlayingRaw(standaloneMusicHandle), 'low-level music is playing before manager disposal');
manager.dispose();
manager.dispose();
expect(!manager.playSound('level'), 'manager disposal is idempotent and rejects playback');
expect(isMusicPlayingRaw(standaloneMusicHandle), 'manager disposal preserves unrelated music');
unloadMusic({ handle: standaloneMusicHandle });

const scene = new Scene();
const sceneManager = new SoundManager();
expect(sceneManager.loadSound('scene', tonePath) !== null, 'scene-owned manager loads its sound');
expect(scene.own(sceneManager) === sceneManager, 'scene accepts the manager as an owned resource');
scene.unload();
expect(!sceneManager.playSound('scene'), 'scene unload disposes its owned manager');

closeAudio();
console.log('SoundManager runtime fixture passed');
