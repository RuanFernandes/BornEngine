const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(root + '/src/audio/audio-system.ts', 'utf8')
  .replace('constructor(private readonly game: Game) {', 'constructor(game: Game) { this.game = game;');
const context = { isReady: true, isDisposed: false };
const operations = { initAudioDevice() {}, closeAudioDevice() {} };
const sandbox = {
  getGameContext: () => context,
  operations,
  Sound: class {},
  StagedSound: class {},
  Music: class {},
  StagedMusic: class {},
  SoundManager: class {},
  AudioListener2D: class {},
};
const code = stripTypeScriptTypes(source, { mode: 'strip' })
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '');
vm.runInNewContext(code + '\nthis.AudioSystem = AudioSystem;', sandbox, { filename: 'audio-system.ts' });

const audio = new sandbox.AudioSystem({});
let updates = 0;
const music = { update() { updates++; }, dispose() { audio.untrackMusic(music); } };
audio.trackMusic(music);
audio.untrackMusic(music);
audio.update(1 / 60);
assert.equal(updates, 0, 'disposed scene music is no longer visited by AudioSystem updates');

let soundDisposals = 0;
let musicDisposals = 0;
const sound = { dispose() { soundDisposals++; audio.untrackSound(sound); } };
const remainingMusic = { update() {}, dispose() { musicDisposals++; audio.untrackMusic(remainingMusic); } };
audio.trackSound(sound);
audio.trackMusic(remainingMusic);
audio.dispose();
assert.equal(soundDisposals, 1, 'AudioSystem shuts down each remaining sound once');
assert.equal(musicDisposals, 1, 'AudioSystem shuts down each remaining music once');
assert.equal(audio.sounds.length, 0, 'AudioSystem releases its sound references');
assert.equal(audio.musics.length, 0, 'AudioSystem releases its music references');
console.log('AudioSystem live resource tracking contract passed');
