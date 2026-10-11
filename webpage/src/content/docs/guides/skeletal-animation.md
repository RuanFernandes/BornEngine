---
title: Skeletal animation
description: Export a rigged character to GLB, load it with an animation controller, and draw it with GPU skinning.
section: Guides
order: 61
---

A skinned model is a mesh whose vertices follow a skeleton of joints. You animate it by moving the joints. BornEngine does the skinning on the GPU: each vertex stores up to four joint indices and weights, the CPU computes one matrix per joint every frame, and the GPU blends them.

You work with two resources, both created from the same `.glb` file:

- A `Model` holds the mesh. You draw it.
- An `Animation` holds the skeleton, the clips, and the playback state. You tell it which clip to play and advance it every frame.

Loading models needs the `2.5d` or `3d` native profile. The `2d` profile leaves model loading out, so `loadModel()` and `createAnimation()` fail there. The Web build includes models.

## Load and play

This game loads a character, plays an idle clip, and switches to a walk clip while you hold the up arrow. The left and right arrows turn the character.

```ts
import { Colors, Game, Key } from '@bornengine/engine';
import type { Animation, Camera3D, Model } from '@bornengine/engine';

const CAMERA: Camera3D = {
  position: { x: 0, y: 1.6, z: 4 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective',
};

const CLIP_IDLE = 0;
const CLIP_WALK = 1;
const TURN_SPEED = 2;

class CharacterDemo extends Game {
  private model: Model | null = null;
  private animation: Animation | null = null;
  private walking = false;
  private yaw = 0;
  private frameTime = 0;

  constructor() {
    super({ window: { title: 'Skeletal animation', width: 960, height: 540 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const model = this.assets.loadModel('assets/models/character.glb');
    const animation = this.assets.createAnimation('assets/models/character.glb');
    if (model === null || !model.isLoaded) {
      console.error(model === null ? 'No asset manager.' : model.error);
      this.stop();
      return;
    }
    if (animation === null || !animation.isLoaded) {
      console.error(animation === null ? 'No asset manager.' : animation.error);
      this.stop();
      return;
    }
    if (animation.getClipDuration(CLIP_IDLE) <= 0) {
      console.error('The file contains no animation clips.');
      this.stop();
      return;
    }
    animation.play(CLIP_IDLE);
    this.model = model;
    this.animation = animation;
  }

  protected override loop(deltaTime: number): void {
    this.frameTime = deltaTime;
    this.walking = this.input.isKeyDown(Key.UP);
    if (this.input.isKeyDown(Key.LEFT)) this.yaw += TURN_SPEED * deltaTime;
    if (this.input.isKeyDown(Key.RIGHT)) this.yaw -= TURN_SPEED * deltaTime;
    if (this.animation !== null) this.animation.play(this.walking ? CLIP_WALK : CLIP_IDLE, 0.2);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
    const animation = this.animation;
    const model = this.model;
    if (animation === null || model === null) return;

    const position = { x: 0, y: 0, z: 0 };
    animation.update(this.frameTime, position, 1, this.yaw);
    if (!this.renderer.begin3D(CAMERA)) return;
    this.renderer.drawGrid(20, 1);
    model.draw(this.renderer, position, 1);
    this.renderer.end3D();
  }
}

new CharacterDemo().run();
```

What each call does:

- `assets.createAnimation(path)` creates a new controller every time you call it. It reads the file again, and the native side has no call to free that data, so `dispose()` only stops the wrapper from working. Create one controller per character when you load, and keep it.
- `play(clip, fade = 0.15, speed = 1, looping = true)` selects a clip by its position in the file's animation list, starting at 0. It blends from the current clip over `fade` seconds. Asking for the clip that is already playing changes nothing except speed and looping, so you can call it every frame with the clip you want. A clip number past the end of the list is ignored.
- `update(deltaTime, position, scale = 1, rotationY = 0)` advances the playback clock, builds the pose, and stages it for drawing. The position, scale, and yaw you pass here place the character in the world. `rotationY` is in radians.
- `model.draw(renderer, position, scale)` draws the mesh with the pose that `update()` staged. For a skinned mesh the draw position only places parts that have no joint weights, and its `rotationY` argument has no effect. Pass the same position and scale to both calls.

## Order matters for several characters

`update()` does not name the model it belongs to. It adds a pose to a queue for the current frame. Each skinned `draw()` takes the next pose from that queue. With one character the order is easy: update, then draw. With several, call `update()` and `draw()` for each character back to back, in the same order every frame.

```ts
import type { Animation, Model, Renderer } from '@bornengine/engine';

interface Actor {
  animation: Animation;
  x: number;
  yaw: number;
}

export function drawActors(renderer: Renderer, model: Model, actors: Actor[], deltaTime: number): void {
  for (const actor of actors) {
    const position = { x: actor.x, y: 0, z: 0 };
    actor.animation.update(deltaTime, position, 1, actor.yaw);
    model.draw(renderer, position, 1);
  }
}
```

If you update character A, update character B, and then draw B before A, B is drawn with A's pose. A pose that no draw consumes is dropped at the end of the frame.

One frame can hold 1024 joint matrices, shared by every pose staged in it. Divide 1024 by the joint count of your skeleton to find how many characters fit. Poses past the limit are drawn with the wrong pose.

## Control playback

| Call | What it does |
| --- | --- |
| `play(clip, fade, speed, looping)` | Starts or continues a clip on the base track. |
| `setLayer(clip, weight, maskRoot, speed, looping)` | Plays a second clip on every joint at or below `maskRoot`, blended by `weight` from 0 to 1. A negative `clip` or a `weight` of 0 turns the layer off. |
| `findJoint(name)` | Returns a joint index, or -1. It tries an exact name first, then a case-insensitive part of a name. Look joints up once at load time. |
| `isFinished()` | `true` once a non-looping clip has run past its end. |
| `getClipDuration(clip)` | Length of a clip in seconds, or 0 if the clip does not exist. |
| `setRootMotion(enabled)` | Turns on root motion reporting. See below. |
| `getRootMotionDelta(axis)` | The root travel the clip authored for the last `update()`, for axis 0 (x), 1 (y), or 2 (z). It is 0 while root motion is off. |
| `getJointWorldTransformComponent(joint, component)` | One of the 16 numbers of a joint's 4 by 4 matrix, in the model's own space. Components 12, 13, and 14 are the translation. |

A masked layer is how a character attacks while it keeps walking:

```ts
import type { Animation } from '@bornengine/engine';

const CLIP_WALK = 1;
const CLIP_ATTACK = 2;

export interface Rig {
  animation: Animation;
  spine: number;
  hand: number;
}

export function createRig(animation: Animation): Rig {
  return { animation, spine: animation.findJoint('Spine'), hand: animation.findJoint('RightHand') };
}

export function applyState(rig: Rig, attacking: boolean): void {
  rig.animation.play(CLIP_WALK, 0.15);
  rig.animation.setLayer(attacking ? CLIP_ATTACK : -1, 1, rig.spine);
}

export function handOffset(rig: Rig): { x: number; y: number; z: number } {
  const animation = rig.animation;
  return {
    x: animation.getJointWorldTransformComponent(rig.hand, 12),
    y: animation.getJointWorldTransformComponent(rig.hand, 13),
    z: animation.getJointWorldTransformComponent(rig.hand, 14),
  };
}
```

`findJoint` returns -1 when no joint matches, so check the result before you use it. `handOffset` returns a position in the model's own space. To attach an item in the world, apply the same scale, yaw, and position you gave to `update()`.

The pose never moves the character through the world. The engine locks the translation of the skeleton's first joint to its rest value, on all three axes, so a walk clip plays in place and your code decides where the character stands. Root motion is the way to take that travel from the clip instead of from a fixed speed. After `setRootMotion(true)`, `getRootMotionDelta(axis)` reports how far the clip's first joint moved during the last `update()`, in the model's own space. Scale and rotate it the way you scale and rotate the character, then add it to the character's position yourself.

The engine reads three kinds of keys from each clip: translation, rotation, and scale. It always interpolates between keys in a straight line, with a spherical blend for rotations. It ignores the interpolation mode stored in the file.

## Blender export

The engine reads a GLB with these contents:

- One skin. The animation takes its skeleton from the first skin in the file and ignores any other skin.
- A mesh with `JOINTS_0` and `WEIGHTS_0` attributes. Only the first set is read, so each vertex has at most four joints.
- Animations whose channels target the joints of that skin. Channels that target other nodes are skipped.
- All data inside the file. `loadModel()` and `createAnimation()` do not load separate `.bin` or image files, so export a single `.glb`.

Load the `Model` and the `Animation` from the same file. The vertices refer to joint numbers in the file's skin, and the animation computes its matrices from its own skeleton, so the two must agree.

The engine repository includes `scripts/export_mixamo_glb.py`, a Blender script that applies the settings below. It needs Blender 3.6 or later. Run it like this:

```sh
blender --background --python scripts/export_mixamo_glb.py -- \
  character.fbx walk.fbx run.fbx idle.fbx \
  -o assets/models/character.glb \
  --max-verts 2000
```

The first file is the character and the rest are animation clips. Each clip becomes one animation in the GLB. The clip number you pass to `play()` is the animation's position in the file, so open the result in a glTF viewer and write the order down. If you export by hand, match these choices:

- **Use one source for the character and its clips.** The script's notes explain that two Mixamo packs can share bone names but differ in rest-pose orientation, which twists the mesh.
- **Put every action on an NLA track of the character's armature.** With animation mode `NLA_TRACKS`, only actions on tracks are exported. Each track becomes one animation.
- **Apply the transforms before you export.** The script's notes say Mixamo FBX files import with a 0.01 scale on the armature. The script runs `bpy.ops.object.transform_apply` so the vertices and the joints share one coordinate space.
- **Export with these glTF options:** `export_format='GLB'`, `export_skins=True`, `export_animations=True`, `export_animation_mode='NLA_TRACKS'`, `export_force_sampling=True`, `export_optimize_animation_size=False`, and `export_optimize_animation_keep_anim_armature=True`.

`export_optimize_animation_size=False` is the setting the script's notes stress the most. Blender's size optimizer can reduce a walk cycle to two or three keys per channel, and the character then barely moves. `export_force_sampling=True` writes a key for every frame, which fits the engine's straight-line interpolation.

The script also decimates the mesh to about 2000 vertices by default, a choice aimed at mobile GPUs. Pass `--no-decimate` to keep the full mesh.

## Runtime checks

When a character looks wrong, work through these checks in order.

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| `loadModel()` or `createAnimation()` reports `Unable to load ...` | The path is wrong, the file is not a valid glTF, or the build is on the `2d` profile. | Check the path and case. Set `native_profile` to `2.5d` or `3d`. See the [asset pipeline](../assets/). |
| `isLoaded` is `true` but the character stays in its bind pose | The file has no animations. | `getClipDuration(0)` is 0 when there are no clips. Check the NLA tracks in Blender. |
| The character moves a little or not at all | Blender stripped the keys. | Re-export with `export_optimize_animation_size=False` and `export_force_sampling=True`. |
| The character is missing, collapsed, or frozen in an old pose | `draw()` ran with no pose staged for it. The engine then uses whatever pose sits at the start of the frame's joint buffer. | Call `update()` every frame, before the matching `draw()`. |
| Limbs twist | The clips were made for a different skeleton or rest pose. | Export the character and the clips from one source. |
| The mesh is stretched or scattered | The armature scale was not applied. | Apply transforms in Blender before the export. |
| The character is in the wrong place or faces the wrong way | Position, scale, or yaw differ between `update()` and `draw()`, or `rotationY` is in degrees. | Pass the same position and scale to both. Give `update()` a yaw in radians. |
| A second character wears the first one's pose | The `update()` and `draw()` order differs, or the frame is over 1024 joint matrices. | Call `update()` then `draw()` for each character, in one fixed order. |
| The character plays a walk clip but stays on the spot | The pose never travels. Your code moves the character. | Change the position you pass to `update()` and `draw()` each frame, or add `getRootMotionDelta()` after `setRootMotion(true)`. |

Development builds of the native engine, such as `bornengine run` without `--release`, print `[anim]` lines to the console when an animation file loads. The line `Skeleton: N joints` shows the joint count. The line for each clip shows how many channels were mapped to joints and the average number of keys per channel. Zero mapped channels means the clip does not match the skeleton. An average of two or three keys means the exporter stripped them.

## Next steps

- [Models API](../../api/models/) lists the loaders for models, meshes, materials, and animation controllers.
- [Build a 3D scene](../3d-scene/) sets up the camera and the 3D pass used above.
- [Asset pipeline](../assets/) explains paths and formats on every target.
- [Physics](../physics/) adds characters, vehicles, and rigid bodies to a 3D game.
