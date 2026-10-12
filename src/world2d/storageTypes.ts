/** Output style for serialization: `compact` for the smallest file, `readable` for human-editable JSON. */
export type World2DSerializeMode = 'compact' | 'readable';
/** How hard the serializer works to shrink compact output: `fast` or `max`. */
export type World2DSerializeEffort = 'fast' | 'max';

/** Options for `serializeWorld2D`. */
export interface World2DSerializeOptions {
  mode?: World2DSerializeMode;
  effort?: World2DSerializeEffort;
}

/** Pair of numbers, such as a vector or size. */
export type World2DTuple2 = [number, number];
/** Four numbers, such as a rectangle given as x, y, width, height. */
export type World2DTuple4 = [number, number, number, number];

/** Tile codes of a layer as stored on disk: a plain array or a run-length, sparse, bit-packed, or compressed encoding. */
export type World2DStoredTileGrid =
  | number[]
  | { encoding: 'rle'; values: number[] }
  | { encoding: 'sparse'; base?: number; values: number[] }
  | { encoding: 'bits' | 'lz'; palette: number[]; values: string };

/** Tile definition in compact storage, with optional collision rectangle and properties. */
export interface World2DStoredTileDefinition {
  tileId: number;
  collision?: World2DTuple4;
  properties?: Record<string, unknown>;
}

/** Tileset in compact storage; omitted fields take defaults when the document is normalized. */
export interface World2DStoredTileset {
  id: string;
  image: string;
  tileSize?: World2DTuple2;
  columns?: number;
  tileCount?: number;
  margin?: World2DTuple2;
  spacing?: World2DTuple2;
  tiles?: World2DStoredTileDefinition[];
}

/** Object in compact storage; omitted fields take defaults when the document is normalized. */
export interface World2DStoredObject {
  id: string;
  name?: string;
  type: string;
  position: World2DTuple2;
  rotation?: number;
  size: World2DTuple2;
  origin?: World2DTuple2;
  visible?: boolean;
  tags?: string[];
  properties?: Record<string, unknown>;
  components?: Array<{ kind: string; data: Record<string, unknown> }>;
}

/** Fields shared by all layers in compact storage. */
export interface World2DStoredLayerBase {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  offset?: World2DTuple2;
  parallax?: World2DTuple2;
  properties?: Record<string, unknown>;
}

/** Tile layer in compact storage, with its tiles in an encoded grid. */
export interface World2DStoredTileLayer extends World2DStoredLayerBase {
  type: 'tilemap';
  size?: World2DTuple2;
  tileSize?: World2DTuple2;
  data: World2DStoredTileGrid;
}

/** Object layer in compact storage. */
export interface World2DStoredObjectLayer extends World2DStoredLayerBase {
  type: 'objects';
  objects?: World2DStoredObject[];
}

/** Either kind of layer in compact storage. */
export type World2DStoredLayer = World2DStoredTileLayer | World2DStoredObjectLayer;

/** Compact on-disk form of a World2D document, format version 2. */
export interface World2DStorageV2 {
  format: 'bornengine.world2d';
  version: 2;
  id: string;
  name?: string;
  size?: World2DTuple2;
  tileSize?: World2DTuple2;
  assets?: string[];
  tilesets: World2DStoredTileset[];
  layers: World2DStoredLayer[];
  metadata?: unknown;
}
