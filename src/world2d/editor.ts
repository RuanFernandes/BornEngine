/** Pure World2D editing, validation, migration, and storage APIs. */
export { WORLD2D_FORMAT, WORLD2D_VERSION } from './types';
export { validateWorld2D, formatWorld2DDiagnostics } from './validate';
export { normalizeWorld2DStorage } from './storage';
export { migrateWorld2D } from './migrate';
export { serializeWorld2D } from './saver';
export { World2DCodecError, createWorld2DTileCodebook } from './tileCodes';
export { encodeWorld2DTileGrid, decodeWorld2DTileGrid, tileGridEncodedSize } from './tileGridCodec';

export type {
  World2DJsonValue,
  World2DVector,
  World2DRect,
  World2DPropertyData,
  World2DTileDefinition,
  World2DTilesetData,
  WorldTileCell,
  World2DTileCell,
  World2DComponentDescriptor,
  World2DLayerBase,
  World2DTileLayer,
  World2DObjectData,
  World2DObjectLayer,
  World2DLayer,
  World2DDocument,
  World2DDiagnostic,
  World2DValidationResult,
  World2DMigrationResult,
  World2DSerializeResult,
} from './types';

export type {
  World2DSerializeMode,
  World2DSerializeEffort,
  World2DSerializeOptions,
  World2DTuple2,
  World2DTuple4,
  World2DStoredTileGrid,
  World2DStoredTileDefinition,
  World2DStoredTileset,
  World2DStoredObject,
  World2DStoredLayerBase,
  World2DStoredTileLayer,
  World2DStoredObjectLayer,
  World2DStoredLayer,
  World2DStorageV2,
} from './storageTypes';

export type {
  EncodedWorld2DRleTileGrid,
  EncodedWorld2DSparseTileGrid,
  EncodedWorld2DPackedTileGrid,
  EncodedWorld2DTileGrid,
} from './tileGridCodec';

export type { World2DTileCodebook } from './tileCodes';
