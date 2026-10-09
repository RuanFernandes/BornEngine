import type { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';

export const WORLD2D_FORMAT = 'bornengine.world2d';
export const WORLD2D_VERSION = 2;

export type {
  World2DSerializeEffort,
  World2DSerializeMode,
  World2DSerializeOptions,
} from './storageTypes';

/** Explicit descriptor kinds implemented by the engine's built-in loader. */
export const BUILTIN_WORLD2D_COMPONENT_KINDS = ['spriteRenderer', 'physicsBody2D'] as const;

export type World2DJsonValue =
  | string
  | number
  | boolean
  | null
  | World2DJsonValue[]
  | { [key: string]: World2DJsonValue };

export interface World2DVector {
  x: number;
  y: number;
}

export interface World2DRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface World2DPropertyData {
  type: 'string' | 'int' | 'float' | 'bool' | 'color' | 'file';
  value: string | number | boolean;
}

export type WorldProperty = World2DPropertyData;

export interface World2DTileDefinition {
  tileId: number;
  collision?: World2DRect;
  properties: Record<string, World2DPropertyData>;
}

export interface World2DTilesetData {
  id: string;
  image: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  margin: World2DVector;
  spacing: World2DVector;
  tiles: World2DTileDefinition[];
}

export interface WorldTileCell {
  tilesetId: string;
  tileId: number;
  flipX: boolean;
  flipY: boolean;
  flipDiagonal: boolean;
}

export type World2DTileCell = WorldTileCell;

export interface World2DComponentDescriptor {
  kind: string;
  data: Record<string, World2DJsonValue>;
}

export interface World2DSpriteRendererData {
  tilesetId: string;
  tileId: number;
  flipX?: boolean;
  flipY?: boolean;
  flipDiagonal?: boolean;
  size?: World2DVector;
  pivot?: World2DVector;
  tint?: { r: number; g: number; b: number; a: number };
}

export type World2DPhysicsShape = { type: 'box'; width: number; height: number } | { type: 'circle'; radius: number };

export interface World2DPhysicsBodyData {
  type: 'static' | 'dynamic' | 'kinematic';
  shape: World2DPhysicsShape;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
}

export interface World2DLayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  offset: World2DVector;
  parallax: World2DVector;
  properties?: Record<string, WorldProperty>;
}

export interface World2DTileLayer extends World2DLayerBase {
  type: 'tilemap';
  width: number;
  height: number;
  tileSize: World2DVector;
  data: Array<WorldTileCell | null>;
}

export interface World2DObjectData {
  id: string;
  name: string;
  type: string;
  position: World2DVector;
  rotation: number;
  size: World2DVector;
  origin: World2DVector;
  visible: boolean;
  tags: string[];
  properties: Record<string, World2DPropertyData>;
  components: World2DComponentDescriptor[];
}

export interface World2DObjectLayer extends World2DLayerBase {
  type: 'objects';
  objects: World2DObjectData[];
}

export type World2DLayer = World2DTileLayer | World2DObjectLayer;

/** Assets are normalized, project-relative paths using forward slashes. */
export interface World2DDocument {
  format: 'bornengine.world2d';
  version: number;
  id: string;
  name: string;
  assets: string[];
  tilesets: World2DTilesetData[];
  layers: World2DLayer[];
  metadata: Record<string, World2DJsonValue>;
}

export interface World2DDiagnostic {
  path: string;
  code: string;
  message: string;
}

export interface World2DValidationResult {
  ok: boolean;
  diagnostics: World2DDiagnostic[];
}

export interface World2DMigrationResult extends World2DValidationResult {
  document: World2DDocument | null;
}

export interface World2DLoadInstance {
  sourceId: string;
  sourceKind: 'object' | 'tilemap';
  tilesetId: string | null;
  gameObject: GameObject;
}

export interface World2DLoadResult extends World2DValidationResult {
  document: World2DDocument | null;
  instances: World2DLoadInstance[];
}

export interface World2DSerializeResult extends World2DValidationResult {
  json: string;
}

export type World2DComponentFactoryValue = GameComponent | World2DDiagnostic;
