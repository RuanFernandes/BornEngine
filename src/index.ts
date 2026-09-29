export { Game } from './core/game';
export type { GameOptions, GameLoopCallbacks, GameDebugOptions } from './core/game';
export { Window, Renderer } from './core';
export type { WindowMode, WindowOptions, UpscaleMode, RendererStats } from './core';
export { ColorConstants, Colors, Key, MouseButton, CursorShape, Platform, QualityPreset, Tonemap } from './core';
export type { Color, Rect, Vector2DLike, Camera2D, Camera3D, Ray, BoundingBox, RayHit, FrustumPlanes, Mat4 } from './core/types';

export { Vector2D, Vec3, Vec4, Quat, Matrix4, Mathf, Collision } from './math';
export type { Matrix4Array } from './math';

export { Texture, ImageData, RenderTexture, FILTER_LINEAR, FILTER_NEAREST } from './textures';
export { AssetManager, AssetGroup } from './assets';
export type { AssetGroupAsset, AssetGroupEntryResult, AssetGroupEntryState, AssetGroupKind, AssetGroupState } from './assets';
export { SpriteSheet, SpriteRenderer, SpriteAnimation, SpriteAnimator, ParticleEmitter2D } from './sprites';
export type {
  SpriteFrame, SpriteFrameDefinition, SpriteFrameTrim, SpriteFrameTrimDefinition, SpriteSheetOptions, SpriteRendererOptions,
  ResolvedSpriteKeyframe, SpriteAnimationLoop, SpriteAnimationOptions, SpriteKeyframe,
  SpriteAnimationTransition, SpriteAnimatorOptions, SpriteAnimatorState, SpriteCompleteCallback,
  SpriteMarkerCallback, SpriteNumberComparison, SpritePlayOptions, SpriteStateChangedCallback,
  SpriteTransitionCondition,
  ParticleBurstOptions, ParticleEmitter2DOptions, ParticleEmitterShape, ParticleRange,
} from './sprites';
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

export {
  AudioSystem, AudioListener2D, AudioEmitter2D,
  Sound, StagedSound, Music, StagedMusic, SoundManager,
} from './audio';
export type {
  SoundPlayOptions, SoundVoice, SpatialPlaybackOptions,
  ManagedMusicOptions, ManagedSoundOptions, SpatialSoundOptions, AudioEmitter2DOptions,
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
export type {
  ActionAxisBinding, ActionButtonBinding,
  InputActionMapActionData, InputActionMapAxisData, InputActionMapData,
} from './input';
export { GameStorage, createGameStorage } from './storage';
export type { GameStorageBackend, GameStorageResult, GameStorageStatus, JsonValue } from './storage';
export { PhysicsWorld2D, PhysicsBody2D, CharacterBody2D } from './physics2d';
export type {
  PhysicsBody2DOptions, PhysicsBodyContact2D, PhysicsBodyType2D, PhysicsContact2D,
  PhysicsContactPhase2D, PhysicsShape2D, PhysicsQueryOptions2D, PhysicsRayHit2D,
  PhysicsWorld2DOptions,
  CharacterBody2DOptions,
} from './physics2d';
export { Tilemap } from './tilemap';
export type { TilemapCellFlip, TilemapOptions, TilemapSolidTile, TilemapTileDefinition } from './tilemap';
export { CameraRig2D, ParallaxLayer2D, Viewport2D, getParallaxOffset } from './camera2d';
export type {
  Camera2DSnapshot, CameraRig2DOptions, CameraShake2DOptions, ParallaxLayer2DOptions,
  Viewport2DOptions, ViewportScalingMode2D, ViewportTransform2D,
} from './camera2d';
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

export {
  WORLD2D_FORMAT, WORLD2D_VERSION, BUILTIN_WORLD2D_COMPONENT_KINDS,
  validateWorld2D, formatWorld2DDiagnostics, migrateWorld2D, serializeWorld2D,
  World2DComponentRegistry, World2DLoader,
} from './world2d';
export type {
  World2DJsonValue, World2DVector, World2DRect, World2DPropertyData, WorldProperty,
  World2DTileDefinition, World2DTilesetData, WorldTileCell, World2DTileCell,
  World2DComponentDescriptor, World2DSpriteRendererData, World2DPhysicsShape,
  World2DPhysicsBodyData, World2DLayerBase, World2DTileLayer, World2DObjectData,
  World2DObjectLayer, World2DLayer, World2DDocument, World2DDiagnostic,
  World2DValidationResult, World2DMigrationResult, World2DLoadInstance,
  World2DLoadResult, World2DSerializeResult, World2DComponentFactoryValue,
  World2DComponentFactoryContext, World2DComponentFactory, World2DLoaderOptions,
} from './world2d';

export { TouchControls, VirtualJoystick, VirtualButton } from './mobile';
export type { VirtualJoystickOptions, VirtualButtonOptions } from './mobile';
export { ParticleSystem, DecalSystem } from './vfx';
export type { ParticleConfig, ParticleEmitOptions, DecalStyle } from './vfx';
export { Ui, UiBackend, UiOpcode } from './ui';
export { DebugUi } from './debug-ui';
export type { UiApi, UiId, UiResponse, UiColor } from './ui';
export { ColyseusClient, Room } from './colyseus';
export type { RoomRequestOptions, ColyseusError, RoomJoinCallbacks } from './colyseus';
