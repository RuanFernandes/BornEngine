# Skeletal Animation in BornEngine

BornEngine supports GPU-accelerated skeletal animation via glTF/GLB models with embedded skin and animation data. This document covers the full pipeline from Blender export to runtime rendering.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [GPU Skinning Pipeline](#gpu-skinning-pipeline)
- [TypeScript API](#typescript-api)
- [Blender Export Pipeline](#blender-export-pipeline)
- [Common Pitfalls](#common-pitfalls)
- [Key Engine Files](#key-engine-files)
- [Debugging](#debugging)

---

## Architecture Overview

The animation system is split into three layers:

1. **Asset loading** (`models.rs`) -- parses glTF/GLB files, extracts skeleton hierarchy, inverse bind matrices, animation channels (translation/rotation/scale keyframes per joint), and skin data (JOINTS_0 + WEIGHTS_0 vertex attributes). Since EN-055, the parsed clip data (`SkeletonData`, animations, rest rotations) is immutable and `Arc`-shared: `instantiateAnimation(src)` creates a new instance with a fresh mixer and joint state without re-parsing the GLB.

2. **Animation update** (`models.rs` + `anim_mixer.rs`) -- each frame, the per-instance `AnimMixer` (EN-028) advances clip time, crossfades between clips, applies masked additive layers and optional root motion, samples keyframes, walks the joint hierarchy to compute world transforms, and multiplies by inverse bind matrices to produce final joint matrices. These are stored in a pending buffer. (The older raw-`time` sampling path still exists for direct `Animation.update` calls.)

3. **GPU skinning** (`renderer/`) -- the WGSL vertex shader (`renderer/shaders/core.rs`) applies 4-bone linear blend skinning using joint matrices from a 1024-entry uniform buffer, flushed to the GPU in `end_frame()`. A second `joints_prev` buffer at `@group(3) @binding(1)` feeds motion vectors (EN-022).

```
Game Loop                Engine                          GPU
─────────              ─────────                      ──────
Animation.update → sample keyframes
                       walk hierarchy
                       joint_matrices = world * IBM
                       set pending_joint_matrices ──→ flush to uniform buffer
Model.draw           → push skinned vertices        ──→ vertex shader applies
                                                       4-bone blend skinning
Game.run frame end  → end_frame()                  ──→ render pass executes
```

---

## GPU Skinning Pipeline

### Vertex Layout

Every 3D vertex in BornEngine includes joint/weight data, whether skinned or not:

```rust
// native/shared/src/renderer/types.rs
#[repr(C)]
pub struct Vertex3D {
    pub position: [f32; 3],   // @location(0) — bind-pose position
    pub normal:   [f32; 3],   // @location(1)
    pub color:    [f32; 4],   // @location(2) — vertex color or material base color
    pub uv:       [f32; 2],   // @location(3) — texture coordinates
    pub joints:   [f32; 4],   // @location(4) — bone indices (as floats)
    pub weights:  [f32; 4],   // @location(5) — bone weights (sum to 1.0)
    pub tangent:  [f32; 4],   // @location(6) — xyz tangent + w handedness
}
// Total stride: 96 bytes per vertex
```

For unskinned geometry, `joints` and `weights` are all zeros. The shader checks `total_weight > 0.01` to decide whether to apply skinning.

### Joint Uniform Buffer

Joint matrices are stored in a uniform buffer at **bind group 3, binding 0**:

```wgsl
struct JointMatrices {
    matrices: array<mat4x4<f32>, 1024>,
};
@group(3) @binding(0) var<uniform> joints: JointMatrices;
```

The buffer is 65536 bytes (1024 matrices x 64 bytes each). Initialized to identity matrices at startup. Updated via `queue.write_buffer()` in `flush_joint_matrices()` during `end_frame()`, right before the render pass. Two additions since this doc was first written: a `joints_prev` uniform at `@group(3) @binding(1)` holds last frame's matrices for motion vectors (EN-022), and the material-system pipeline binds the same joint UBO in its per-draw group at binding 1 (`renderer/material_pipeline.rs`).

### WGSL Vertex Shader (Skinning)

The 3D vertex shader performs 4-bone linear blend skinning:

```wgsl
@vertex
fn vs_main_3d(in: VertexInput3D) -> VertexOutput3D {
    let total_weight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
    var pos = vec4<f32>(in.position, 1.0);
    var norm = vec4<f32>(in.normal, 0.0);
    if (total_weight > 0.01) {
        // GPU skinning: joint matrices already include model scale
        let j0 = u32(in.joints.x); let j1 = u32(in.joints.y);
        let j2 = u32(in.joints.z); let j3 = u32(in.joints.w);
        let skinned_pos = joints.matrices[j0] * pos * in.weights.x
                        + joints.matrices[j1] * pos * in.weights.y
                        + joints.matrices[j2] * pos * in.weights.z
                        + joints.matrices[j3] * pos * in.weights.w;
        let skinned_norm = joints.matrices[j0] * norm * in.weights.x
                         + joints.matrices[j1] * norm * in.weights.y
                         + joints.matrices[j2] * norm * in.weights.z
                         + joints.matrices[j3] * norm * in.weights.w;
        pos = skinned_pos;
        norm = skinned_norm;
    }
    out.clip_position = u.mvp * pos;
    // ...
}
```

Key details:
- Joint indices are stored as floats and cast to `u32` in the shader.
- Skinned vertices pass through bind-pose positions; scale/position are baked into the joint matrices by `set_joint_matrices_scaled()`.
- Unskinned vertices have CPU-side position + scale applied in `draw_model_mesh_tinted()`.
- Normals are also skinned for correct lighting on deformed meshes.

### Bind Group Layout

The 3D pipeline uses four bind groups:

| Group | Purpose | Contents |
|-------|---------|----------|
| 0 | Transform | MVP matrix (4x4 uniform) |
| 1 | Lighting | Ambient + directional light uniforms |
| 2 | Texture | 2D texture + sampler |
| 3 | Joints | 1024 x mat4x4 uniform buffer (+ `joints_prev` at binding 1) |

### Flush Timing

Joint matrices are written to the GPU in `end_frame()` via `flush_joint_matrices()`. This happens **before** the render pass begins, ensuring all skinned draw calls in the frame see the same joint state. The flow is:

1. Game calls `Animation.update()` -- computes joint matrices, stores in `pending_joint_matrices`
2. Game calls `Model.draw()` -- queues skinned vertices (bind-pose positions)
3. Game calls `Game.run()` frame completion -> `end_frame()` -> `flush_joint_matrices()` -- writes to GPU
4. Render pass executes -- shader reads joint buffer and skins vertices

---

## TypeScript API

`Model` and `Animation` instances belong to one `Game`. Create them after the game is ready, inspect load failures, and dispose them when their scene ends. `Game.dispose()` also releases every remaining game-owned resource.

### Load a model and animation

```typescript
import { Animation, Game, Model } from "@bornengine/engine";

const game = new Game({ window: { title: "Animation Demo" } });
const model = new Model(game, "assets/models/character.glb");
const animation = new Animation(game, "assets/models/character.glb");

if (!model.isLoaded) console.error(model.error);
if (!animation.isLoaded) console.error(animation.error);
```

### Control animation

Mixer state belongs to the `Animation` instance. Select a clip with `play`, configure optional layers or root motion, and advance it once per update before drawing the model. `findJoint()` returns a joint index suitable for `setLayer()`.

```typescript
if (animation.isLoaded) {
  animation.play(0, 0.15, 1, true);
  const spine = animation.findJoint("Spine");
  if (spine >= 0) animation.setLayer(1, 0.5, spine);
  animation.setRootMotion(true);
}

// In update(deltaTime):
animation.update(deltaTime, playerPosition, 1, yawDegrees);
const rootMotionX = animation.getRootMotionDelta(0);
if (animation.isFinished()) console.log("clip finished");
```

`getClipDuration(clip)` returns a clip length. `getRootMotionDelta(axis)` returns the current root-motion delta for axis 0, 1, or 2. If root motion is enabled, apply the displacement to gameplay state before drawing the pose.

### Render and release

Use the owning renderer or the model convenience method. Pass the same scale to animation update and model drawing when the animation pose incorporates scale. `Game.run()` handles frame completion and submits the staged joint matrices after rendering.

```typescript
import { Animation, Colors, Game, Model } from "@bornengine/engine";

const game = new Game({ window: { title: "Animation Demo", width: 800, height: 600 } });
const model = new Model(game, "assets/models/character.glb");
const animation = new Animation(game, "assets/models/character.glb");
if (animation.isLoaded) animation.play(0);

const position = { x: 0, y: 0, z: 0 };
game.run({
  update(deltaTime) {
    if (animation.isLoaded) animation.update(deltaTime, position, 1);
  },
  render() {
    game.renderer.clear(Colors.SKYBLUE);
    if (model.isLoaded) model.draw(game.renderer, position, 1, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

For a shorter scene lifetime, call `animation.dispose()` and `model.dispose()` before releasing the game.

---

## Blender Export Pipeline

Getting animated characters from Mixamo into BornEngine requires a specific export workflow. The steps below were discovered through extensive trial and error -- each one addresses a specific failure mode.

### Prerequisites

- Blender 3.6+ (glTF exporter with NLA support)
- Mixamo character + animation FBX files from the **same character pack**
- The reusable export script: `scripts/export_mixamo_glb.py`

### Manual Workflow

#### Step 1: Import Character FBX

```
File > Import > FBX > select character FBX from Mixamo
```

This gives you an armature + skinned mesh.

#### Step 2: Import Animation FBX

```
File > Import > FBX > select animation FBX (e.g., "standing run forward.fbx")
```

This creates a second armature with the animation baked as an action.

**Why same pack?** Two different Mixamo character packs have incompatible armature rest orientations. The bone hierarchy names may match, but rest-pose quaternions differ, causing joints to twist when retargeted.

#### Step 3: Transfer Animation to Character Armature

1. Find the animation action in the new armature's action list
2. Delete the imported armature (keep the action)
3. Select the character armature
4. In the Action Editor, assign the animation action to the character armature

```python
# Equivalent Blender Python:
arm_obj.animation_data_create()
arm_obj.animation_data.action = run_action
```

#### Step 4: Push Action to NLA Track

Blender's glTF exporter only exports animations that are on NLA tracks (when using `NLA_TRACKS` mode). Simply having an active action is not enough.

```python
track = arm_obj.animation_data.nla_tracks.new()
track.name = "Run"
strip = track.strips.new("Run", int(action.frame_range[0]), action)
arm_obj.animation_data.action = None  # Clear active action
```

#### Step 5: Decimate Mesh (Mobile)

For mobile targets, reduce vertex count to ~2000:

```python
mod = mesh_obj.modifiers.new(name="Dec", type='DECIMATE')
mod.ratio = 2000.0 / len(mesh_obj.data.vertices)
bpy.ops.object.modifier_apply(modifier="Dec")
```

#### Step 6: Apply Armature Scale (CRITICAL)

Mixamo FBX imports often have a 0.01 or 100x scale on the armature. This must be applied (baked into the transform) **before** export:

```python
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
```

**Why?** If the armature has a non-identity scale, vertex positions are in one coordinate space (meters) while bone transforms are in another (centimeters). Applying the scale unifies them.

**Warning:** If you bake animation keyframes and THEN apply scale, the baked keyframes become invalid. Apply scale first, or don't bake.

#### Step 7: Clean Up

Remove any extra objects (lights, cameras, extra meshes):

```python
for obj in list(bpy.data.objects):
    if obj not in (mesh_obj, arm_obj):
        bpy.data.objects.remove(obj, do_unlink=True)
```

#### Step 8: Export GLB with CRITICAL Settings

```python
bpy.ops.export_scene.gltf(
    filepath="output.glb",
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    export_apply=False,                              # Do NOT apply modifiers
    export_texcoords=True,
    export_normals=True,
    export_image_format='JPEG',
    export_animation_mode='NLA_TRACKS',              # REQUIRED: export from NLA
    export_optimize_animation_size=False,             # CRITICAL: without this, only 2-3 keyframes survive!
    export_force_sampling=True,                       # REQUIRED: sample all frames
    export_optimize_animation_keep_anim_armature=True # REQUIRED: keep armature animations
)
```

**The most important setting is `export_optimize_animation_size=False`.** Blender's "optimize animation size" feature aggressively strips keyframes that it considers redundant. For character animation, this reduces a 30-frame walk cycle to 2-3 keyframes, producing a static T-pose or barely-twitching character. This took days to diagnose.

### Automated Script

Use the provided export script for repeatable results:

```bash
blender --background --python scripts/export_mixamo_glb.py -- \
    character.fbx walk.fbx run.fbx idle.fbx \
    -o assets/models/character.glb \
    --max-verts 2000
```

See `scripts/export_mixamo_glb.py` for full documentation.

---

## Common Pitfalls

### Blender Export Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Character stuck in T-pose | Keyframes stripped by optimizer | Set `export_optimize_animation_size=False` |
| Only 2-3 keyframes in GLB | Same as above | Same as above |
| Joints twist/distort | Animation from different Mixamo pack | Use character + animations from same pack |
| Animation not in GLB | Action not on NLA track | Push action to NLA track before export |
| Mesh explodes at runtime | Armature scale not applied | `bpy.ops.object.transform_apply()` before export |
| Baked animation broken after scale apply | Scale applied after baking | Apply scale BEFORE baking, or don't bake |

### Runtime Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Character slides across ground | Root joint has translation keys | Root translation is locked to rest pose by default (see `root_translation_at` in `models.rs`); enable it deliberately with `animation.setRootMotion(true)` and consume `animation.getRootMotionDelta(axis)` |
| Character renders at wrong position | Scale mismatch between `Animation.update` and `Model.draw` | Use same scale value in both calls |
| Character invisible / at origin | `Animation.isLoaded` is false | Check `Animation.error` and the asset path; on iOS check `resolve_path()` |
| Animation appears unchanged | Animation methods called before the asset is ready | Check `Animation.isLoaded` before calling `play()` or `update()` |
| Lighting wrong on deformed mesh | Normals not skinned | BornEngine skins normals in the vertex shader (already handled) |

### Scale Conventions

- **Mixamo FBX**: Characters are in centimeters (1 unit = 1cm). Blender's FBX importer converts to meters, adding a 0.01 armature scale.
- **BornEngine**: Expects meter-scale models. Use `scale: 1.0` for properly exported models.
- **Inverse Bind Matrices**: May contain 100x scale from Blender's cm-to-m conversion. The engine detects this and compensates (see `skin_vertex_scale` in `load_gltf_with_textures`).

---

## Key Engine Files

### Rust (native layer)

- **`native/shared/src/models.rs`** -- Core animation system:
  - `ModelAnimation`, `SkeletonData` (Arc-shared since EN-055), `JointData`, `AnimationChannel`, `AnimationData` structs
  - `load_gltf_animation()` -- parses GLB skin + animation data
  - `instantiate_animation()` -- EN-055: Arc-shares parsed clips, fresh per-instance mixer/joint state
  - `update_model_animation()` -- delegates clip time to the mixer, walks hierarchy, computes joint matrices
  - `load_gltf_with_textures()` -- loads skinned mesh with JOINTS_0/WEIGHTS_0
  - Matrix/quaternion math: `mat4_from_trs`, `quat_slerp`, `mat4_mul`, `compute_joint_transforms`

- **`native/shared/src/anim_mixer.rs`** -- `AnimMixer` (EN-028): crossfades, masked additive layers, opt-in root motion, per-instance clip time.

- **`native/shared/src/renderer/`** -- GPU skinning (the old single `renderer.rs` was split into this module):
  - `types.rs` -- `Vertex3D` struct with `joints`, `weights`, `tangent` fields
  - `shaders/core.rs` -- WGSL with `JointMatrices` uniform (1024 entries) + `joints_prev` for motion vectors, 4-bone blend skinning
  - `mod.rs` -- `joint_buffer` + `joint_bind_group` at bind group 3; `set_joint_matrices()`, `set_joint_matrices_scaled()`, `flush_joint_matrices()`; `draw_model_mesh_tinted()` for skinned vs unskinned positioning

- **`native/shared/src/ffi_core/models.rs`** -- FFI functions, generated once for every platform by the `define_core_ffi!` macro (each platform crate just invokes the macro in its `lib.rs`; web hand-writes `#[wasm_bindgen]` wrappers):
  - `bloom_load_model()` -- loads GLB mesh
  - `bloom_load_model_animation()` -- loads GLB skeleton + animations
  - `bloom_instantiate_animation()` -- EN-055 instancing
  - `bloom_update_model_animation()` -- updates joint matrices from animation
  - `bloom_anim_*` -- the mixer surface (play/layer/root-motion/update/…)
  - `bloom_draw_model()` -- renders model (skinned or static)
  - `bloom_set_joint_test()` -- debug: manually set a single joint rotation

### TypeScript (API surface)

- **`src/models/index.ts`** -- Public API:
  - `new Model(game, path)` loads a drawable model and exposes `isLoaded`, `error`, mesh/material counts, and bounds.
  - `new Animation(game, path)` creates an animation controller with private native identity and inspectable load state.
  - `Animation.play()`, `setLayer()`, and `setRootMotion()` configure playback; `update(deltaTime, position, scale, rotationY)` advances the pose.
  - `Animation.findJoint()`, `getJointWorldTransformComponent()`, `getClipDuration()`, and `getRootMotionDelta()` query the active animation.
  - `Model.draw(renderer, position, scale, tint)` submits the model through its owning renderer.
  - Call `dispose()` when an asset leaves the scene, or let `game.dispose()` release it at shutdown.

### Blender Scripts

- **`scripts/export_mixamo_glb.py`** -- Automated Mixamo-to-GLB export pipeline

---

## Debugging

### Debug Logging

In debug builds (`#[cfg(debug_assertions)]`), the engine prints detailed animation info to stderr:

```
[anim] Skeleton: 65 joints, 1 roots
[anim]   joint 0: 'mixamorig:Hips' children=[1, 2, 3]
[anim] Animation 'Run': 195 channels mapped, 0 skipped, duration=0.83s, avg 25/ch keyframes
[anim] joints=65, t=0.000, anim_index=0
[anim] Joint0 local: t=[0.00,96.47,0.00] r=[0.0000,0.0000,0.0000,1.0000]
[anim] Joint0 final diag=[1.0000,1.0000,1.0000] trans=[0.0000,0.0000,0.0000]
```

Things to check:
- **"channels mapped"** should be > 0 (otherwise animation data isn't being applied)
- **"avg N/ch keyframes"** should be 20+ for a typical animation (if it's 2-3, the export optimizer stripped keyframes)
- **Joint0 final diag** should be near 1.0 for a properly scaled model

The public API does not expose direct joint mutation. To inspect a skinning asset, load its `Animation`, check `isLoaded`, play a clip, and compare the rendered pose over time.

### Verifying GLB Contents

Use `gltf-validator` or inspect the GLB in a viewer:

```bash
# Check animation keyframe counts
npx gltf-validator character.glb

# Visual inspection
# Open in https://gltf-viewer.donmccurdy.com/ or Blender
```

If the validator shows only 2-3 keyframes per channel, the Blender export optimizer stripped them -- re-export with `export_optimize_animation_size=False`.
