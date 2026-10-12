import type { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';

/** Value of the `format` field in World2D documents. */
export const WORLD2D_FORMAT = 'bornengine.world2d';
/** Current World2D document version. */
export const WORLD2D_VERSION = 2;

export type {
  World2DSerializeEffort,
  World2DSerializeMode,
  World2DSerializeOptions,
} from './storageTypes';

/** Explicit descriptor kinds implemented by the engine's built-in loader. */
export const BUILTIN_WORLD2D_COMPONENT_KINDS = ['spriteRenderer', 'physicsBody2D'] as const;

/** Any value representable in JSON. */
export type World2DJsonValue =
  | string
  | number
  | boolean
  | null
  | World2DJsonValue[]
  | { [key: string]: World2DJsonValue };

/** A 2D vector or size. */
export interface World2DVector {
  x: number;
  y: number;
}

/** Rectangle given by its position and size. */
export interface World2DRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A typed custom property value attached to a tile, layer, or object. */
export interface World2DPropertyData {
  type: 'string' | 'int' | 'float' | 'bool' | 'color' | 'file';
  value: string | number | boolean;
}

/** Alias of `World2DPropertyData`. */
export type WorldProperty = World2DPropertyData;

/** Per-tile data of a tileset: optional collision rectangle and custom properties. */
export interface World2DTileDefinition {
  tileId: number;
  collision?: World2DRect;
  properties: Record<string, World2DPropertyData>;
}

/** A tileset: an image divided into a grid of tiles, with per-tile definitions. */
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

/** A tile placed in a layer cell: the tileset and tile index, plus flip flags. */
export interface WorldTileCell {
  tilesetId: string;
  tileId: number;
  flipX: boolean;
  flipY: boolean;
  flipDiagonal: boolean;
}

/** Alias of `WorldTileCell`. */
export type World2DTileCell = WorldTileCell;

/** Names a component kind and the data used to build it when the world loads. */
export interface World2DComponentDescriptor {
  kind: string;
  data: Record<string, World2DJsonValue>;
}

/** Data for the built-in `spriteRenderer` component kind, selecting a tile as the sprite. */
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

/** Collision shape of a physics body: a box or a circle. */
export type World2DPhysicsShape = { type: 'box'; width: number; height: number } | { type: 'circle'; radius: number };

/** Data for the built-in `physicsBody2D` component kind. */
export interface World2DPhysicsBodyData {
  type: 'static' | 'dynamic' | 'kinematic';
  shape: World2DPhysicsShape;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
}

/** Fields shared by all layer kinds: visibility, opacity, offset, and parallax. */
export interface World2DLayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  offset: World2DVector;
  parallax: World2DVector;
  properties?: Record<string, WorldProperty>;
}

/** A layer of tiles in a row-major grid; empty cells are `null`. */
export interface World2DTileLayer extends World2DLayerBase {
  type: 'tilemap';
  width: number;
  height: number;
  tileSize: World2DVector;
  data: Array<WorldTileCell | null>;
}

/** An object in an object layer, with its transform, tags, properties, and components. */
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

/** A layer holding free-placed objects. */
export interface World2DObjectLayer extends World2DLayerBase {
  type: 'objects';
  objects: World2DObjectData[];
}

/** Either a tile layer or an object layer. */
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

/** A problem found while validating, migrating, loading, or serializing a document, located by JSON pointer path. */
export interface World2DDiagnostic {
  path: string;
  code: string;
  message: string;
}

/** Outcome of validation: `ok`, plus the diagnostics found. */
export interface World2DValidationResult {
  ok: boolean;
  diagnostics: World2DDiagnostic[];
}

/** Validation outcome plus the normalized document when it succeeded. */
export interface World2DMigrationResult extends World2DValidationResult {
  document: World2DDocument | null;
}

/** A game object created by the loader, with the layer element it came from. */
export interface World2DLoadInstance {
  sourceId: string;
  sourceKind: 'object' | 'tilemap';
  tilesetId: string | null;
  gameObject: GameObject;
}

/** Outcome of loading a document into a scene, with the created game objects on success. */
export interface World2DLoadResult extends World2DValidationResult {
  document: World2DDocument | null;
  instances: World2DLoadInstance[];
}

/** Outcome of serialization, with the JSON text when `ok` is true. */
export interface World2DSerializeResult extends World2DValidationResult {
  json: string;
}

/** What a component factory returns: the component, or a diagnostic on failure. */
export type World2DComponentFactoryValue = GameComponent | World2DDiagnostic;
