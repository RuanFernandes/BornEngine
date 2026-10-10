import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Color, Rect, Vector2DLike } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { SpriteAnimator } from '../../src/sprites/sprite-animator';
import { SpriteAnimationTemplateAsset, SpriteAnimationTemplateRenderer } from '../../src/sprites/sprite-animation-template-runtime';
import type { Texture } from '../../src/textures/texture';
import { isTextureSourceRegionInBounds } from '../../src/textures/texture-region';

const templateFixtureJson = String.raw`{
  "format": "bornengine.spriteanim-template",
  "version": 1,
  "id": "layered-avatar",
  "name": "Layered Avatar",
  "description": "One idle and walk template shared by named art inputs.",
  "imageParameters": [
    { "id": "body_art", "label": "Body Art", "required": true, "tags": ["character"] },
    { "id": "spark_art", "label": "Spark Art", "required": false, "tags": ["effects"] }
  ],
  "clips": [
    {
      "name": "idle",
      "fps": 4,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "frames": [
        {
          "layers": [
            { "parameter": "body_art", "source": { "x": 0, "y": 0, "width": 32, "height": 32 } },
            { "parameter": "spark_art", "source": { "x": 128, "y": 0, "width": 32, "height": 32 } }
          ]
        }
      ]
    },
    {
      "name": "walk",
      "fps": 10,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "frames": [
        {
          "duration": 0.12,
          "markers": ["step"],
          "layers": [
            { "parameter": "body_art", "source": { "x": 32, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "spark_art",
              "source": { "x": 128, "y": 0, "width": 32, "height": 32 },
              "transform": { "offset": { "x": 4, "y": -2 }, "rotation": 8, "pivot": { "x": 0.5, "y": 0.75 } }
            }
          ]
        },
        {
          "duration": 0.12,
          "layers": [
            { "parameter": "body_art", "source": { "x": 64, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "spark_art",
              "source": { "x": 160, "y": 0, "width": 32, "height": 32 },
              "transform": { "offset": { "x": 4, "y": -2 }, "rotation": -8, "pivot": { "x": 0.5, "y": 0.75 } }
            }
          ]
        }
      ]
    }
  ]
}`;
const templateData = JSON.parse(templateFixtureJson) as any;

expect(isTextureSourceRegionInBounds({ x: 192, y: 32, width: -32, height: -32 }, 192, 32),
  'negative source rectangles include their lower bounds when mirroring an edge-aligned crop');
expect(!isTextureSourceRegionInBounds({ x: 0, y: 0, width: -1, height: 1 }, 192, 32),
  'negative source rectangles are rejected when the mirrored bounds exceed the texture');

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

interface DrawCall {
  texture: string;
  source: Rect;
  destination: Rect;
  origin: Vector2DLike;
  rotation: number;
  tint: Color;
}

function drainDraws(): DrawCall[] {
  const result = draws.slice();
  draws.length = 0;
  return result;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) throw new Error('Animation template test Game context is unavailable.');
context.markReady();
bindGameContext(game, context);

const draws: DrawCall[] = [];
function makeTexture(name: string, width: number, height: number, owner = context): Texture {
  const texture = {
    width,
    height,
    isLoaded: true,
    _belongsToSameGame(other: unknown): boolean {
      return other !== null && typeof other === 'object' &&
        (other as { owner?: GameContext }).owner === owner;
    },
    _canAttachTo(target: GameContext): boolean { return target === owner && this.isLoaded; },
    owner,
    dispose(): void {},
    drawRegion(source: Rect, destination: Rect, origin: Vector2DLike, rotation: number, tint: Color): boolean {
      draws.push({ texture: name, source: { ...source }, destination: { ...destination },
        origin: { x: origin.x, y: origin.y }, rotation, tint: { ...tint } });
      return true;
    },
  } as any as Texture;
  owner.register(texture);
  return texture;
}

const runtimeTemplateData = {
  ...templateData,
  imageParameters: [
    templateData.imageParameters[0],
    templateData.imageParameters[1],
  ],
  clips: [
    {
      ...templateData.clips[1],
      name: 'walk',
      frames: [
        {
          duration: 0.1,
          markers: ['step-start'],
          layers: [
            {
              parameter: 'body_art', source: { x: 2, y: 3, width: 8, height: 4 },
              transform: { offset: { x: 4, y: -2 }, stretch: { x: -1, y: 2 }, zoom: 0.5, rotation: 90, pivot: { x: 0.25, y: 0.5 } },
            },
            { parameter: 'spark_art', source: { x: 0, y: 0, width: 4, height: 4 } },
          ],
        },
        {
          duration: 0.2,
          markers: ['step'],
          layers: [
            { parameter: 'body_art', source: { x: 10, y: 0, width: 8, height: 8 } },
          ],
        },
      ],
    },
    {
      ...templateData.clips[0],
      frames: [{ layers: [{ parameter: 'body_art', source: { x: 0, y: 0, width: 16, height: 16 } }] }],
    },
  ],
};

const template = new SpriteAnimationTemplateAsset(runtimeTemplateData);
expect(template.error === null, 'valid layered animation template is accepted');
const baseA = makeTexture('base-a', 192, 32);
const overlayA = makeTexture('overlay-a', 8, 8);
const baseB = makeTexture('base-b', 192, 32);
const fixtureTemplate = new SpriteAnimationTemplateAsset(templateData);
expect(fixtureTemplate.error === null, 'the checked-in JSON fixture validates through the runtime template API');
const fixtureBinding = fixtureTemplate.bind({ body_art: baseA });
expect(fixtureBinding.ok && fixtureBinding.value.clips.idle.frames.length === 1 &&
  fixtureBinding.value.clips.walk.frames.length === 2 &&
  fixtureBinding.value.clips.walk.frames[0].layers.length === 1,
  'the JSON fixture binds by its declared ID and omits its optional spark layer');
const bindingA = template.bind({ body_art: baseA, spark_art: overlayA });
const bindingB = template.bind({ spark_art: makeTexture('overlay-b', 8, 8), body_art: baseB });
expect(bindingA.ok && bindingB.ok, 'named bindings accept different image combinations and input order');
if (!bindingA.ok || !bindingB.ok) process.exit(1);

const clipA = bindingA.value.clips.walk;
const clipB = bindingB.value.clips.walk;
expect(clipA !== undefined && clipB !== undefined &&
  clipA.frames[0].layers[0].sprite !== clipB.frames[0].layers[0].sprite &&
  clipA.frames[0].layers[0].sprite.sheet !== clipB.frames[0].layers[0].sprite.sheet,
'each character binding owns separate SpriteSheet and SpriteFrame data');

const optionalBinding = template.bind({ body_art: baseA });
expect(optionalBinding.ok && optionalBinding.value.clips.walk.frames[0].layers.length === 1,
  'omitted optional parameters skip only their layers');

expect(!template.bind({ spark_art: overlayA }).ok,
  'missing required parameters return recoverable binding diagnostics');
expect(!template.bind({ body_art: baseA, unknown_input: overlayA }).ok,
  'unknown parameter IDs are rejected');
expect(!template.bind({ body_art: makeTexture('bad-size', 8, 8) }).ok,
  'every bound texture is checked against each referenced crop');
expect(!template.bind({ body_art: baseA,
  spark_art: makeTexture('foreign-overlay', 8, 8, GameContext.createFailed('foreign')) }).ok,
  'textures from a different Game cannot be combined in one binding');

const renderer = new SpriteAnimationTemplateRenderer(bindingA.value, { size: { x: 64, y: 64 } });
const animator = new SpriteAnimator(renderer, { clips: bindingA.value.clips });
const rendererB = new SpriteAnimationTemplateRenderer(bindingB.value);
const animatorB = new SpriteAnimator(rendererB, { clips: bindingB.value.clips });
animatorB.play('walk');
expect(renderer.error === null && animator.error === null, 'the composite renderer and SpriteAnimator accept bound clips');
expect(!renderer._canAttachTo({ owns: () => false } as any),
  'a bound animation renderer rejects attachment to a different Game');
const object = new GameObject({ position: { x: 100, y: 50, z: 0 } });
object.addComponent(renderer);
object.addComponent(animator);
const scene = new GameScene(game);
expect(scene.add(object) === object, 'the bound template and its SpriteAnimator attach to their owning Game');

const markerEvents: string[] = [];
animator.onMarker = (marker, clip, frame) => markerEvents.push(`${clip}:${frame}:${marker}`);
expect(animator.play('walk'), 'SpriteAnimator starts a template clip');
expect(animator.currentFrameIndex === 0 && markerEvents.join(',') === 'walk:0:step-start',
  'one shared playhead emits initial frame markers exactly once');
const fakeRenderer = {
  activeCamera2D: null,
  isRectVisibleIn2D: () => true,
  _recordSpriteDrawn() {},
  _recordSpriteCulled() {},
} as any as Renderer;
renderer.render(fakeRenderer);
const renderCalls = drainDraws();
expect(renderCalls.length === 2 && renderCalls[0].texture === 'base-a' && renderCalls[1].texture === 'overlay-a',
  'composite rendering draws visible layers bottom-to-top in authored order');
expect(renderCalls[0].source.x === 10 && renderCalls[0].source.width === -8 &&
  renderCalls[0].destination.width === 8 && renderCalls[0].destination.height === 8 &&
  renderCalls[0].destination.x === 102 && renderCalls[0].destination.y === 42 &&
  renderCalls[0].origin.x === 6 && renderCalls[0].origin.y === 4 && renderCalls[0].rotation === 90,
  'layer rendering applies canvas scaling, pixel offsets, signed stretch, zoom, rotation, and pivot');

animator.update(0.1);
expect(animator.currentFrameIndex === 1 && markerEvents.join(',') === 'walk:0:step-start,walk:1:step',
  'all composite layers advance together and emit each frame marker once');
expect(animatorB.currentFrameIndex === 0,
  'two character bindings keep independent SpriteAnimator playheads');
renderer.render(fakeRenderer);
const nextFrameCalls = drainDraws();
expect(nextFrameCalls.length === 1 && nextFrameCalls[0].texture === 'base-a' &&
  nextFrameCalls[0].source.x === 10 && nextFrameCalls[0].destination.width === 16,
  'the composite renderer follows the shared SpriteAnimator frame index');

expect(animator.play('walk', { restart: true, fade: 0.2 }), 'composite clips keep SpriteAnimator restart and crossfade controls');
animator.update(0.05);
renderer.render(fakeRenderer);
const fadedCalls = drainDraws();
expect(fadedCalls.length === 3 && Math.abs(fadedCalls[0].tint.a - renderer.tint.a * 0.75) < 0.001 &&
  Math.abs(fadedCalls[1].tint.a - renderer.tint.a * 0.25) < 0.001 &&
  Math.abs(fadedCalls[2].tint.a - renderer.tint.a * 0.25) < 0.001,
  'crossfades apply one shared opacity to every outgoing and incoming layer');

const stateRenderer = new SpriteAnimationTemplateRenderer(bindingA.value);
const stateAnimator = new SpriteAnimator(stateRenderer, {
  clips: bindingA.value.clips,
  states: [
    { name: 'standing', clip: 'idle', transitions: [{ to: 'walking', conditions: [{ type: 'bool', name: 'moving', value: true }] }] },
    { name: 'walking', clip: 'walk' },
  ],
  initialState: 'standing',
});
stateAnimator.setBool('moving', true);
stateAnimator.update(0);
expect(stateAnimator.currentState === 'walking' && stateAnimator.currentClip === 'walk',
  'the existing state transition system selects composite clips');

const onceTemplate = new SpriteAnimationTemplateAsset({
  ...runtimeTemplateData,
  id: 'once-template',
  name: 'Once Template',
  clips: [{ ...runtimeTemplateData.clips[0], name: 'once', loop: 'once' }],
});
const onceBinding = onceTemplate.bind({ body_art: baseA });
expect(onceBinding.ok, 'once clips bind to the same image parameters');
if (!onceBinding.ok) process.exit(1);
const onceAnimator = new SpriteAnimator(new SpriteAnimationTemplateRenderer(onceBinding.value), {
  clips: onceBinding.value.clips,
});
const completed: string[] = [];
onceAnimator.onComplete = (clip) => completed.push(clip);
onceAnimator.play('once');
onceAnimator.update(0.3);
onceAnimator.update(0.5);
expect(!onceAnimator.isPlaying && onceAnimator.currentFrameIndex === 1 && completed.join(',') === 'once',
  'once playback holds its last composite frame and completes exactly once');

const pingTemplate = new SpriteAnimationTemplateAsset({
  ...runtimeTemplateData,
  id: 'ping-template',
  name: 'Ping Template',
  clips: [{ ...runtimeTemplateData.clips[0], name: 'ping', loop: 'ping-pong' }],
});
const pingBinding = pingTemplate.bind({ body_art: baseA });
expect(pingBinding.ok, 'ping-pong clips bind to the same image parameters');
if (!pingBinding.ok) process.exit(1);
const pingAnimator = new SpriteAnimator(new SpriteAnimationTemplateRenderer(pingBinding.value), {
  clips: pingBinding.value.clips,
});
pingAnimator.play('ping');
pingAnimator.update(0.1);
pingAnimator.update(0.2);
expect(pingAnimator.currentFrameIndex === 0,
  'ping-pong playback reverses the composite frame sequence on its shared playhead');

const dirFrame = (x: number, duration?: number) => ({
  ...(duration === undefined ? {} : { duration }),
  layers: [{ parameter: 'body_art', source: { x, y: 0, width: 8, height: 8 } }],
});
const directionalData = {
  ...runtimeTemplateData,
  id: 'directional-template',
  name: 'Directional Template',
  clips: [
    {
      name: 'idle',
      fps: 10,
      loop: 'loop',
      canvasSize: { width: 8, height: 8 },
      directions: {
        up: [dirFrame(0), dirFrame(8)],
        left: [dirFrame(16)],
        down: [dirFrame(24), dirFrame(32)],
        right: [dirFrame(40), dirFrame(48)],
      },
    },
  ],
};
const directionalTemplate = new SpriteAnimationTemplateAsset(directionalData);
expect(directionalTemplate.error === null &&
  directionalTemplate.definition?.clips[0].frames[0].layers[0].source.x === 24,
  'directional clips validate and expose the down direction as their default frames');
expect(new SpriteAnimationTemplateAsset({
  ...directionalData,
  clips: [{ ...directionalData.clips[0], frames: [dirFrame(0)] }],
}).error !== null, 'a clip cannot define both frames and directions');
expect(new SpriteAnimationTemplateAsset({
  ...directionalData,
  clips: [{ ...directionalData.clips[0], directions: { up: [dirFrame(0)], left: [dirFrame(0)], down: [dirFrame(0)] } }],
}).error !== null, 'directional clips require all four directions');
expect(!directionalTemplate.bind({ body_art: makeTexture('narrow', 40, 8) }).ok,
  'binding checks crops in every direction, not only the default one');
const directionalBinding = directionalTemplate.bind({ body_art: baseA });
expect(directionalBinding.ok, 'directional clips bind to image parameters');
if (!directionalBinding.ok) process.exit(1);
const idleClip = directionalBinding.value.clips.idle;
expect(idleClip.directions !== null && idleClip.directions.length === 4 &&
  idleClip.directions[0].frames[0].layers[0].sprite.source.x === 0 &&
  idleClip.directions[3].frames[1].layers[0].sprite.source.x === 48,
  'bound directional clips expose one variant per dir in up, left, down, right order');
const dirRenderer = new SpriteAnimationTemplateRenderer(directionalBinding.value);
const dirAnimator = new SpriteAnimator(dirRenderer, { clips: directionalBinding.value.clips });
expect(dirAnimator.error === null && dirAnimator.dir === 2, 'animators accept directional clips and default to dir 2');
dirAnimator.play('idle');
expect(dirAnimator.currentClipData === idleClip.directions?.[2], 'play uses the variant for the current dir');
dirAnimator.update(0.15);
expect(dirAnimator.setDir(3) && dirAnimator.currentClipData === idleClip.directions?.[3] &&
  dirAnimator.currentFrameIndex === 1 && Math.abs(dirAnimator.currentTime - 0.15) < 1e-9,
  'changing dir keeps the frame index and elapsed time');
expect(dirAnimator.setDir(1) && dirAnimator.currentFrameIndex === 0,
  'changing to a shorter direction clamps the frame index');
expect(!dirAnimator.setDir(4) && !dirAnimator.setDir(1.5) && dirAnimator.dir === 1,
  'setDir rejects values outside 0..3');
dirAnimator.setDir(0);
dirAnimator.play('idle', { restart: true });
expect(dirAnimator.currentClipData === idleClip.directions?.[0] && dirAnimator.currentFrameIndex === 0,
  'restarting a directional clip uses the current dir');

console.log('PASS: sprite animation template binding and playback');
