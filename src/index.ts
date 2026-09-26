export { Game } from './core/game';
export type { GameOptions, GameLoopCallbacks } from './core/game';
export { Window, Renderer } from './core';
export type { WindowMode, WindowOptions, UpscaleMode } from './core';
export { ColorConstants, Colors, Key, MouseButton, CursorShape, Platform, QualityPreset, Tonemap } from './core';
export type { Color, Rect, Camera2D, Camera3D, Ray, BoundingBox, RayHit, FrustumPlanes, Mat4 } from './core/types';

export { Vec2, Vec3, Vec4, Quat, Matrix4, Mathf, Collision } from './math';
export type { Matrix4Array } from './math';

export { Texture, ImageData, RenderTexture, FILTER_LINEAR, FILTER_NEAREST } from './textures';
export { Font } from './text';
export { Model, Mesh, Material, Animation } from './models';
export type { MaterialKind, DrawCubeOpts, ProceduralSkyOptions, PbrMaterial } from './models';
export {
  BUCKET_ADDITIVE, BUCKET_CUTOUT, BUCKET_OPAQUE, BUCKET_TRANSPARENT,
  PROFILE_OPAQUE, PROFILE_TRANSLUCENT,
  SHADING_MODEL_DEFAULT_LIT, SHADING_MODEL_FOLIAGE, SHADING_MODEL_SUBSURFACE,
  TEX_ARRAY_FORMAT_LINEAR, TEX_ARRAY_FORMAT_SRGB,
  TEXTURE_ARRAY_ALBEDO, TEXTURE_ARRAY_MR, TEXTURE_ARRAY_NORMAL,
} from './models';

export { AudioSystem, Sound, StagedSound, Music, StagedMusic, SoundManager } from './audio';
export type {
  SoundPlayOptions, SoundVoice, SpatialPlaybackOptions,
  ManagedMusicOptions, ManagedSoundOptions, SpatialSoundOptions,
} from './audio';
export { BUS_SFX, BUS_MUSIC, BUS_UI } from './audio';

export {
  GameComponent, GameObject, GameScene, Scene, SceneManager, Transform,
  SceneNodeComponent, RigidBodyComponent, AudioSourceComponent,
} from './game';
export type {
  GameComponentType, GameObjectOptions, ParentOptions,
  SceneState, SceneOptions, SceneOwnedResource,
  TransformOptions, TransformTRS,
  SceneNodeComponentOptions, RigidBodyMotionType, RigidBodyComponentOptions,
  AudioSourceComponentOptions,
} from './game';
export { SceneGraph, SceneNode, FrameSubscription } from './scene';
export type { ScenePickEntry, ScenePickHit, SceneNodeOptions } from './scene';

export { InputSystem, InputActionMap } from './input';
export type { ActionAxisBinding, ActionButtonBinding } from './input';
export {
  PhysicsWorld, Collider, BoxCollider, SphereCollider, CapsuleCollider, CylinderCollider,
  ConvexHullCollider, MeshCollider, HeightfieldCollider, CompoundCollider, ScaledCollider,
  OffsetCollider, RigidBody, Joint, CharacterController, GroundState, SoftBody, Vehicle,
  MotionType, ContactEvent, Layer, MAX_OBJECT_LAYERS, ALL_LAYERS_MASK,
} from './physics';
export type {
  PhysicsWorldOptions, PhysicsStepHooks, PhysicsRayHit, PhysicsContact, PhysicsTransform,
  CompoundColliderChild, RigidBodyOptions, JointKind, JointOptions,
  CharacterControllerOptions, VehicleOptions, WorldConfig, BodyConfig, SoftBodyConfig,
} from './physics';

export { WorldData, WorldInstance, PrefabLibrary, WORLD_SCHEMA_VERSION } from './world';
export type {
  WorldInstantiateOptions, WorldEntityNode, WorldDocument, LightData, Bounds,
  EnvironmentData, TerrainData, TerrainLayer, EntityData, TransformData, WaterVolume,
  RiverSpline, PrefabData, PrefabChild, SaveResult, ValidationResult, TerrainRaycastHit,
  PrefabLeaf, Vec3Lit, Vec4Lit, Mat4Lit,
} from './world';

export { TouchControls, VirtualJoystick, VirtualButton } from './mobile';
export type { VirtualJoystickOptions, VirtualButtonOptions } from './mobile';
export { ParticleSystem, DecalSystem } from './vfx';
export type { ParticleConfig, ParticleEmitOptions, DecalStyle } from './vfx';
export { Ui, UiBackend, UiOpcode } from './ui';
export { DebugUi } from './debug-ui';
export type { UiApi, UiId, UiResponse, UiColor } from './ui';
export { ColyseusClient, Room } from './colyseus';
export type { RoomRequestOptions, ColyseusError } from './colyseus';
