import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Color, Rect, Vector2DLike } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { SpriteAnimator } from '../../src/sprites/sprite-animator';
import type { SpriteAnimatorState } from '../../src/sprites/sprite-animator';
import { SpriteAnimation } from '../../src/sprites/sprite-animation';
import { SpriteRenderer } from '../../src/sprites/sprite-renderer';
import { SpriteSheet } from '../../src/sprites/sprite-sheet';
import type { Texture } from '../../src/textures/texture';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

interface DrawCall {
  source: Rect;
  destination: Rect;
  origin: Vector2DLike;
  rotation: number;
  tint: Color;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: animation test Game context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(game, context);

const draws: DrawCall[] = [];
const texture = {
  width: 96,
  height: 16,
  isLoaded: true,
  dispose(): void {},
  drawRegion(source: Rect, destination: Rect, origin: Vector2DLike, rotation: number, tint: Color): boolean {
    draws.push({ source, destination, origin, rotation, tint });
    return true;
  },
} as any as Texture;
context.register(texture);
const sheet = new SpriteSheet(texture, {
  frames: [
    { name: 'a', source: { x: 0, y: 0, width: 16, height: 16 } },
    { name: 'b', source: { x: 16, y: 0, width: 16, height: 16 } },
    { name: 'c', source: { x: 32, y: 0, width: 16, height: 16 } },
    { name: 'd', source: { x: 48, y: 0, width: 16, height: 16 } },
    { name: 'e', source: { x: 64, y: 0, width: 16, height: 16 } },
  ],
});
const frameA = sheet.getFrame('a');
const frameB = sheet.getFrame('b');
const frameC = sheet.getFrame('c');
const frameD = sheet.getFrame('d');
const frameE = sheet.getFrame('e');
if (frameA === null || frameB === null || frameC === null || frameD === null || frameE === null) {
  console.error('FAIL: all animation test frames exist');
  process.exit(1);
}

const loop = new SpriteAnimation({
  frames: [
    { sprite: frameA, duration: 0.1, markers: ['start'] },
    { sprite: frameB, duration: 0.2, markers: ['step'] },
    { sprite: frameC, duration: 0.3, markers: ['end'] },
  ],
  loop: 'loop',
});
const once = new SpriteAnimation({
  frames: [
    { sprite: frameA, duration: 0.1 },
    { sprite: frameB, duration: 0.2, markers: ['complete-frame'] },
  ],
  loop: 'once',
});
const pingPong = new SpriteAnimation({
  frames: [
    { sprite: frameA, duration: 0.1, markers: ['a'] },
    { sprite: frameB, duration: 0.1, markers: ['b'] },
    { sprite: frameC, duration: 0.1, markers: ['c'] },
  ],
  loop: 'ping-pong',
});
const longPingPong = new SpriteAnimation({
  frames: [
    { sprite: frameA, duration: 1 },
    { sprite: frameB, duration: 1 },
    { sprite: frameC, duration: 1 },
  ],
  loop: 'ping-pong',
});
const twoFramePingPong = new SpriteAnimation({
  frames: [{ sprite: frameA, duration: 1 }, { sprite: frameB, duration: 1 }],
  loop: 'ping-pong',
});
const longClip = new SpriteAnimation({
  frames: [
    { sprite: frameA, duration: 1 },
    { sprite: frameB, duration: 1, markers: ['switch'] },
    { sprite: frameC, duration: 1 },
    { sprite: frameD, duration: 1 },
  ],
});
const shortClip = new SpriteAnimation({ frames: [{ sprite: frameE, duration: 1 }] });
const paced = new SpriteAnimation({
  frames: [{ sprite: frameD }, { sprite: frameE }],
  fps: 10,
});
const idle = new SpriteAnimation({ frames: [{ sprite: frameA }] });
const walk = new SpriteAnimation({ frames: [{ sprite: frameB }] });
const run = new SpriteAnimation({ frames: [{ sprite: frameC }] });
const attack = new SpriteAnimation({ frames: [{ sprite: frameD }] });
let canAttack = false;

class HookedAnimator extends SpriteAnimator {
  updateCount = 0;

  constructor(renderer: SpriteRenderer, options: ConstructorParameters<typeof SpriteAnimator>[1]) {
    super(renderer, options);
  }

  update(deltaTime: number): void {
    this.updateCount++;
    super.update(deltaTime);
  }
}

expect(loop.error === null && Math.abs(loop.duration - 0.6) < 0.000001 && loop.frames.length === 3,
  'animation copies keyframes and computes variable-duration clip length');
expect(paced.error === null && paced.frames[0].duration === 0.1,
  'fps supplies a default duration for keyframes');
const invalidAnimation = new SpriteAnimation({ frames: [] });
expect(invalidAnimation.error !== null, 'invalid animation exposes an error without throwing');

const states: SpriteAnimatorState[] = [
  {
    name: 'idle',
    clip: 'idle',
    transitions: [
      { to: 'walk', conditions: [{ type: 'bool', name: 'moving', value: true }] },
      {
        to: 'attack',
        fade: 0.2,
        conditions: [
          { type: 'trigger', name: 'attack' },
          { type: 'callback', test: () => canAttack },
        ],
      },
    ],
  },
  {
    name: 'walk',
    clip: 'walk',
    transitions: [
      {
        to: 'run',
        conditions: [
          { type: 'bool', name: 'moving', value: true },
          { type: 'number', name: 'speed', operator: 'gte', value: 2 },
        ],
      },
      { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }] },
    ],
  },
  { name: 'run', clip: 'run', transitions: [
    { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }] },
  ] },
  { name: 'attack', clip: 'attack' },
];

const sprite = new SpriteRenderer(frameA);
const animator = new HookedAnimator(sprite, {
  clips: { loop, once, pingPong, longPingPong, longClip, shortClip, paced },
});
const object = new GameObject();
object.addComponent(sprite);
object.addComponent(animator);
const scene = new GameScene(game);
expect(scene.add(object) === object, 'sprite animator and renderer attach to the owning Game');

const machineSprite = new SpriteRenderer(frameA);
const machine = new SpriteAnimator(machineSprite, {
  clips: { idle, walk, run, attack },
  states,
  initialState: 'idle',
});
const machineObject = new GameObject();
machineObject.addComponent(machineSprite);
machineObject.addComponent(machine);
const machineScene = new GameScene(game);
expect(machineScene.add(machineObject) === machineObject,
  'state machine renderer and animator attach to the owning Game');

const markers: string[] = [];
animator.onMarker = (marker, _clip, _frame) => { markers.push(marker); };
const completions: string[] = [];
animator.onComplete = (clipName) => { completions.push(clipName); };
const stateChanges: string[] = [];
machine.onStateChanged = (next, previous) => { stateChanges.push(previous + '>' + next); };

expect(animator.play('loop'), 'play starts a valid clip');
expect(animator.currentFrameIndex === 0 && markers.join(',') === 'start',
  'play enters the first frame and emits its markers');
animator.update(0.65);
expect(animator.currentFrameIndex === 0 && markers.join(',') === 'start,step,end,start',
  'large dt crosses loop frames and emits every marker in order');
expect(animator.updateCount === 1, 'SpriteAnimator subclasses can override lifecycle hooks');

expect(animator.play('once'), 'once clip starts');
animator.update(0.5);
expect(!animator.isPlaying && animator.currentFrameIndex === 1 && completions.join(',') === 'once',
  'once playback holds the last frame and completes once');
animator.update(0.5);
expect(completions.length === 1, 'once completion callback is not repeated');

expect(animator.play('pingPong'), 'ping-pong clip starts');
markers.length = 0;
animator.update(0.5);
expect(animator.currentFrameIndex === 1 && markers.join(',') === 'b,c,b,a,b',
  'ping-pong playback reverses without skipping markers');
expect(Math.abs(animator.normalizedTime - 0.25) < 0.001,
  'ping-pong normalized time accounts for the return leg');

expect(animator.play('loop'), 'loop clip can be played after ping-pong');
markers.length = 0;
expect(animator.seek(0.25) && animator.currentFrameIndex === 1 && markers.length === 0,
  'seek updates frame position without markers by default');
expect(animator.seek(0.25, true) && markers.join(',') === 'step',
  'seek can opt into markers for crossed frames');

expect(animator.play('paced'), 'fps clip starts');
animator.update(0.15);
expect(animator.currentFrameIndex === 1, 'fps playback advances by seconds');
expect(animator.play('paced') && animator.currentFrameIndex === 1,
  'playing the current clip does not restart it by default');
expect(animator.play('paced', { restart: true }) && animator.currentFrameIndex === 0,
  'restart explicitly resets the current clip');
expect(animator.setSpeed(2), 'valid playback speed is accepted');
animator.pause();
animator.update(0.1);
expect(animator.currentFrameIndex === 0, 'paused playback does not advance');
expect(animator.resume(), 'paused playback resumes');
animator.update(0.05);
expect(animator.currentFrameIndex === 1, 'playback speed scales animation time');
animator.stop();
expect(!animator.isPlaying && animator.currentFrameIndex === 0,
  'stop resets the playhead and stops playback');

machine.setBool('moving', true);
machine.setTrigger('attack');
machine.update(0);
expect(machine.currentState === 'walk' && machine.hasTrigger('attack'),
  'first declared transition wins and leaves unrelated triggers untouched');
machine.setNumber('speed', 1);
machine.update(0);
expect(machine.currentState === 'walk', 'transition conditions combine with AND');
machine.setNumber('speed', 2);
machine.update(0);
expect(machine.currentState === 'run', 'numeric comparison transition evaluates');
machine.setBool('moving', false);
machine.update(0);
expect(machine.currentState === 'idle', 'state transitions use the destination clip');
canAttack = false;
machine.setTrigger('attack');
machine.update(0);
expect(machine.currentState === 'idle' && machine.hasTrigger('attack'),
  'failed callback condition does not consume a trigger');
canAttack = true;
machine.update(0);
expect(machine.currentState === 'attack' && !machine.hasTrigger('attack') &&
  stateChanges.join(',') === 'idle>walk,walk>run,run>idle,idle>attack',
  'successful transition consumes its trigger and reports state changes');

draws.length = 0;
const sceneRenderer = {
  _beginSceneRender(): void {},
  isRectVisibleIn2D(): boolean { return true; },
  _recordSpriteDrawn(): void {},
  _recordSpriteCulled(): void {},
} as any as Renderer;
machineScene.render(sceneRenderer);
expect(draws.length === 2 && draws[0].tint.a === 255 && draws[1].tint.a === 0,
  'crossfade starts with outgoing and incoming frames');
machine.update(0.1);
draws.length = 0;
machineScene.render(sceneRenderer);
expect(draws.length === 2 && Math.abs(draws[0].tint.a - 127.5) < 0.001 &&
  Math.abs(draws[1].tint.a - 127.5) < 0.001,
  'crossfade blends both frames halfway through its duration');
machine.update(0.1);
draws.length = 0;
machineScene.render(sceneRenderer);
expect(draws.length === 1 && draws[0].source.x === 48,
  'crossfade clears the outgoing frame at its configured duration');

expect(!animator.play('missing') && animator.error !== null,
  'unknown clip names fail safely and expose an error');
expect(animator.play('loop') && animator.error === null, 'a later valid play request clears the error');
expect(!animator.play('missing') && animator.error !== null, 'invalid play requests remain observable');
animator.update(0.11);
expect(animator.currentFrameIndex === 1, 'a failed play request does not freeze active playback');
expect(animator.play('loop') && animator.error === null && animator.currentFrameIndex === 1,
  'repeating a valid current clip clears the error without restarting playback');
machine.resetTrigger('attack');
expect(!machine.hasTrigger('attack'), 'resetTrigger clears a named trigger');

const initialMarkerAnimation = new SpriteAnimation({
  frames: [{ sprite: frameA, markers: ['ready'] }],
  loop: 'once',
});
const initialMarkerAnimator = new SpriteAnimator(new SpriteRenderer(frameA), {
  clips: { initialMarkerAnimation },
  states: [{ name: 'ready', clip: 'initialMarkerAnimation' }],
  initialState: 'ready',
});
const initialMarkers: string[] = [];
initialMarkerAnimator.onMarker = (marker) => { initialMarkers.push(marker); };
initialMarkerAnimator.update(0);
expect(initialMarkers.join(',') === 'ready',
  'initial-state frame markers remain pending until the caller installs hooks');

const reentrantAnimator = new SpriteAnimator(new SpriteRenderer(frameA), {
  clips: { longClip, shortClip },
});
reentrantAnimator.onMarker = (marker) => {
  if (marker === 'switch') reentrantAnimator.play('shortClip');
};
expect(reentrantAnimator.play('longClip'), 'reentrancy regression clip starts');
reentrantAnimator.update(2.5);
expect(reentrantAnimator.currentClip === 'shortClip' && reentrantAnimator.currentFrameIndex === 0,
  'marker callback can switch playback during a large update');
reentrantAnimator.update(0.1);
expect(reentrantAnimator.currentClip === 'shortClip' && reentrantAnimator.currentFrameIndex === 0,
  'marker playback changes stop consuming the previous clip timeline');

const advancedPingPong = new SpriteAnimator(new SpriteRenderer(frameA), { clips: { longPingPong } });
const soughtPingPong = new SpriteAnimator(new SpriteRenderer(frameA), { clips: { longPingPong } });
expect(advancedPingPong.play('longPingPong') && soughtPingPong.play('longPingPong'),
  'long ping-pong clips start');
advancedPingPong.update(4.5);
expect(soughtPingPong.seek(4.5), 'ping-pong seek accepts times beyond one cycle');
expect(advancedPingPong.currentFrameIndex === soughtPingPong.currentFrameIndex &&
  Math.abs(advancedPingPong.currentTime - soughtPingPong.currentTime) < 0.001 &&
  Math.abs(advancedPingPong.normalizedTime - soughtPingPong.normalizedTime) < 0.001 &&
  advancedPingPong.currentFrameIndex === 0 && Math.abs(advancedPingPong.currentTime - 0.5) < 0.001,
  'ping-pong update wraps the return to frame zero like seek');
const twoFramePlayback = new SpriteAnimator(new SpriteRenderer(frameA), { clips: { twoFramePingPong } });
const twoFrameSeek = new SpriteAnimator(new SpriteRenderer(frameA), { clips: { twoFramePingPong } });
twoFramePlayback.play('twoFramePingPong');
twoFrameSeek.play('twoFramePingPong');
twoFramePlayback.update(2.5);
twoFrameSeek.seek(2.5);
expect(twoFramePlayback.currentFrameIndex === 0 && twoFrameSeek.currentFrameIndex === 0 &&
  Math.abs(twoFramePlayback.currentTime - 0.5) < 0.001 &&
  Math.abs(twoFrameSeek.currentTime - 0.5) < 0.001,
  'two-frame ping-pong loops at its real cycle duration');

const malformedAnimation = new SpriteAnimation({ frames: null as any });
expect(malformedAnimation.error !== null, 'malformed frame collections fail without throwing');
const malformedStates: any = {};
const malformedAnimator = new SpriteAnimator(machineSprite, { clips: { idle }, states: malformedStates });
expect(malformedAnimator.error !== null, 'malformed state collections fail without throwing');

const walk = new SpriteAnimation({
  directions: {
    up: [{ sprite: frameA, duration: 0.1 }, { sprite: frameB, duration: 0.1 }],
    left: [{ sprite: frameC, duration: 0.1 }],
    down: [{ sprite: frameD, duration: 0.1 }, { sprite: frameE, duration: 0.1 }],
    right: [{ sprite: frameE, duration: 0.1 }, { sprite: frameA, duration: 0.1 }],
  },
});
expect(walk.error === null && walk.directions !== null && walk.directions.length === 4 &&
  walk.frames[0].sprite === frameD,
  'directional animations build one variant per dir and expose down as default frames');
expect(new SpriteAnimation({ frames: [{ sprite: frameA }], directions: walk.directions === null ? undefined : {
  up: [{ sprite: frameA }], left: [{ sprite: frameA }], down: [{ sprite: frameA }], right: [{ sprite: frameA }],
} }).error !== null, 'frames and directions are mutually exclusive');
expect(new SpriteAnimation({ directions: { up: [], left: [{ sprite: frameA }], down: [{ sprite: frameA }],
  right: [{ sprite: frameA }] } }).error !== null, 'every direction needs keyframes');
const dirSprite = new SpriteRenderer(frameA);
const dirAnimator = new SpriteAnimator(dirSprite, { clips: { walk } });
expect(dirAnimator.error === null && dirAnimator.dir === 2, 'animators default to dir 2 (down)');
dirAnimator.play('walk');
dirAnimator.update(0.15);
expect(dirSprite.frame === frameE && dirAnimator.currentFrameIndex === 1, 'directional clips play the current dir');
expect(dirAnimator.setDir(0) && dirSprite.frame === frameB && dirAnimator.currentFrameIndex === 1,
  'setDir swaps frames at the same index without restarting');
expect(dirAnimator.setDir(1) && dirSprite.frame === frameC && dirAnimator.currentFrameIndex === 0,
  'setDir clamps to shorter directions');
expect(!dirAnimator.setDir(-1) && dirAnimator.dir === 1, 'setDir rejects invalid dirs');

console.log('PASS: sprite animation and state machine');
