export type World2DSerializeMode = 'compact' | 'readable';
export type World2DSerializeEffort = 'fast' | 'max';

export interface World2DSerializeOptions {
  mode?: World2DSerializeMode;
  effort?: World2DSerializeEffort;
}

export type World2DTuple2 = [number, number];
export type World2DTuple4 = [number, number, number, number];

export type World2DStoredTileGrid =
  | number[]
  | { encoding: 'rle'; values: number[] }
  | { encoding: 'sparse'; base?: number; values: number[] }
  | { encoding: 'bits' | 'lz'; palette: number[]; values: string };

export interface World2DStoredTileDefinition {
  tileId: number;
  collision?: World2DTuple4;
  properties?: Record<string, unknown>;
}

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

export interface World2DStoredLayerBase {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  offset?: World2DTuple2;
  parallax?: World2DTuple2;
  properties?: Record<string, unknown>;
}

export interface World2DStoredTileLayer extends World2DStoredLayerBase {
  type: 'tilemap';
  size?: World2DTuple2;
  tileSize?: World2DTuple2;
  data: World2DStoredTileGrid;
}

export interface World2DStoredObjectLayer extends World2DStoredLayerBase {
  type: 'objects';
  objects?: World2DStoredObject[];
}

export type World2DStoredLayer = World2DStoredTileLayer | World2DStoredObjectLayer;

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
