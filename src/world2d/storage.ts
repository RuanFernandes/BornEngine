import { createWorld2DTileCodebook } from './tileCodes';
import { decodeWorld2DTileGrid } from './tileGridCodec';
import { validateNormalizedWorld2D } from './validateNormalized';
import { WORLD2D_FORMAT, WORLD2D_VERSION } from './types';
import type {
  World2DDiagnostic,
  World2DDocument,
  World2DLayer,
  World2DMigrationResult,
  World2DObjectData,
  World2DPropertyData,
  World2DRect,
  World2DTileDefinition,
  World2DTileLayer,
  World2DTilesetData,
  World2DVector,
  WorldTileCell,
} from './types';

const MAX_WORLD2D_TILE_CELLS = 1_000_000;
const MAX_CLONE_DEPTH = 128;

class World2DStorageError extends Error {
  readonly diagnostic: World2DDiagnostic;

  constructor(path: string, code: string, message: string) {
    super(message);
    this.name = 'World2DStorageError';
    this.diagnostic = { path, code, message };
  }
}

class World2DStorageValidationError extends Error {
  readonly diagnostics: World2DDiagnostic[];

  constructor(diagnostics: World2DDiagnostic[]) {
    super('Normalized World2D document is invalid.');
    this.name = 'World2DStorageValidationError';
    this.diagnostics = diagnostics;
  }
}

interface WorldSize {
  width: number;
  height: number;
}

function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: any): boolean {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity;
}

function safeInteger(value: any): boolean {
  return finite(value) && Math.floor(value) === value && Math.abs(value) <= 9007199254740991;
}

function setJsonProperty(target: Record<string, any>, key: string, value: any): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
    return;
  }
  target[key] = value;
}

function fail(path: string, code: string, message: string): never {
  throw new World2DStorageError(path, code, message);
}

function diagnosticResult(diagnostics: World2DDiagnostic[]): World2DMigrationResult {
  return { ok: false, diagnostics, document: null };
}

function diagnosticFromError(error: any): World2DDiagnostic {
  if (error !== null && typeof error === 'object' && isObject(error.diagnostic) &&
      typeof error.diagnostic.path === 'string' && typeof error.diagnostic.code === 'string' &&
      typeof error.diagnostic.message === 'string') {
    return error.diagnostic as World2DDiagnostic;
  }
  return {
    path: '',
    code: 'invalid_document',
    message: 'World2D document could not be normalized safely.',
  };
}

function cloneJson(value: any, depth: number = 0): any {
  if (depth > MAX_CLONE_DEPTH) fail('', 'json_too_deep', 'JSON data exceeds the supported nesting depth.');
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const output: any[] = [];
    for (let index = 0; index < value.length; index++) output.push(cloneJson(value[index], depth + 1));
    return output;
  }
  const output: Record<string, any> = {};
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index++) {
    setJsonProperty(output, keys[index], cloneJson(value[keys[index]], depth + 1));
  }
  return output;
}

function vectorValue(value: any, path: string): World2DVector {
  if (Array.isArray(value)) {
    if (value.length !== 2 || !finite(value[0]) || !finite(value[1])) {
      fail(path, 'invalid_vector', 'Vector tuples must contain exactly two finite numbers.');
    }
    return { x: value[0], y: value[1] };
  }
  if (isObject(value) && finite(value.x) && finite(value.y)) return { x: value.x, y: value.y };
  fail(path, 'invalid_vector', 'Vectors must be two-number tuples or objects with finite x and y values.');
}

function sizeValue(value: any, path: string): WorldSize {
  if (Array.isArray(value)) {
    if (value.length !== 2 || !finite(value[0]) || !finite(value[1])) {
      fail(path, 'invalid_dimensions', 'Size tuples must contain exactly two finite numbers.');
    }
    return { width: value[0], height: value[1] };
  }
  if (isObject(value)) {
    if (finite(value.width) && finite(value.height)) return { width: value.width, height: value.height };
    if (finite(value.x) && finite(value.y)) return { width: value.x, height: value.y };
  }
  fail(path, 'invalid_dimensions', 'Sizes must be two-number tuples or objects with width and height.');
}

function sameSize(left: WorldSize, right: WorldSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function sameVector(left: World2DVector, right: World2DVector): boolean {
  return left.x === right.x && left.y === right.y;
}

function dimensionsFromFields(compact: any, width: any, height: any, path: string): WorldSize | null {
  const tuple = compact === undefined ? null : sizeValue(compact, path);
  let expanded: WorldSize | null = null;
  if (width !== undefined || height !== undefined) {
    if ((width !== undefined && !finite(width)) || (height !== undefined && !finite(height)) ||
        ((width === undefined || height === undefined) && tuple === null)) {
      fail(path, 'invalid_dimensions', 'Expanded dimensions require finite width and height values.');
    }
    expanded = {
      width: width === undefined ? (tuple as WorldSize).width : width,
      height: height === undefined ? (tuple as WorldSize).height : height,
    };
  }
  if (tuple !== null && expanded !== null && !sameSize(tuple, expanded)) {
    fail(path, 'conflicting_dimensions', 'Compact and expanded dimensions describe different sizes.');
  }
  return tuple !== null ? tuple : expanded;
}

function vectorFromFields(compact: any, x: any, y: any, path: string): World2DVector | null {
  const tuple = compact === undefined ? null : vectorValue(compact, path);
  let expanded: World2DVector | null = null;
  if (x !== undefined || y !== undefined) {
    if (!finite(x) || !finite(y)) fail(path, 'invalid_vector', 'Expanded vectors require both finite x and y values.');
    expanded = { x, y };
  }
  if (tuple !== null && expanded !== null && !sameVector(tuple, expanded)) {
    fail(path, 'conflicting_dimensions', 'Compact and expanded vectors describe different values.');
  }
  return tuple !== null ? tuple : expanded;
}

function tilesetSize(raw: any, path: string): World2DVector | null {
  const tuple = raw.tileSize === undefined ? null : vectorValue(raw.tileSize, path + '/tileSize');
  const expanded = vectorFromFields(undefined, raw.tileWidth, raw.tileHeight, path + '/tileSize');
  if (tuple !== null && expanded !== null && !sameVector(tuple, expanded)) {
    fail(path + '/tileSize', 'conflicting_dimensions', 'Compact and expanded tileset tile sizes differ.');
  }
  return tuple !== null ? tuple : expanded;
}

function chooseCommonSize(sizes: Array<WorldSize | null>): WorldSize | null {
  const counts: Record<string, number> = {};
  const values: Record<string, WorldSize> = {};
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index];
    if (size === null) continue;
    const key = '' + size.width + ',' + size.height;
    counts[key] = counts[key] === undefined ? 1 : counts[key] + 1;
    values[key] = size;
  }
  const keys = Object.keys(counts);
  let best: WorldSize | null = null;
  let bestCount = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index];
    if (size === null) continue;
    const key = '' + size.width + ',' + size.height;
    if (counts[key] > bestCount) {
      best = values[key];
      bestCount = counts[key];
    }
  }
  if (best !== null) return best;
  return keys.length === 0 ? null : values[keys[0]];
}

function chooseCommonTileSize(
  explicitRoot: World2DVector | null,
  sourceSizes: Array<World2DVector | null>,
  layerSizes: Array<World2DVector | null>,
): World2DVector | null {
  if (explicitRoot !== null) return explicitRoot;
  const candidates: World2DVector[] = [];
  for (let index = 0; index < sourceSizes.length; index++) if (sourceSizes[index] !== null) candidates.push(sourceSizes[index] as World2DVector);
  for (let index = 0; index < layerSizes.length; index++) if (layerSizes[index] !== null) candidates.push(layerSizes[index] as World2DVector);
  if (candidates.length === 0) return null;

  const counts: Record<string, number> = {};
  for (let index = 0; index < candidates.length; index++) {
    const item = candidates[index];
    const key = '' + item.x + ',' + item.y;
    counts[key] = counts[key] === undefined ? 1 : counts[key] + 1;
  }
  let maximum = 0;
  for (let index = 0; index < candidates.length; index++) {
    const item = candidates[index];
    const count = counts['' + item.x + ',' + item.y];
    if (count > maximum) maximum = count;
  }

  const primary = sourceSizes.length > 0 ? sourceSizes[0] : null;
  if (primary !== null && counts['' + primary.x + ',' + primary.y] === maximum) return primary;

  let best: World2DVector | null = null;
  for (let index = 0; index < candidates.length; index++) {
    const item = candidates[index];
    if (counts['' + item.x + ',' + item.y] !== maximum) continue;
    if (best === null || item.x < best.x || (item.x === best.x && item.y < best.y)) best = item;
  }
  return best;
}

function checkedCellCount(size: WorldSize, path: string): number {
  if (!safeInteger(size.width) || !safeInteger(size.height) || size.width <= 0 || size.height <= 0) {
    fail(path, 'invalid_dimensions', 'Tile layer dimensions must be positive safe integers.');
  }
  if (size.width > Math.floor(MAX_WORLD2D_TILE_CELLS / size.height)) {
    fail(path, 'tile_grid_too_large', 'Tile layer exceeds the supported cell limit.');
  }
  return size.width * size.height;
}

function rectValue(value: any, path: string): World2DRect {
  if (Array.isArray(value)) {
    if (value.length !== 4 || !finite(value[0]) || !finite(value[1]) || !finite(value[2]) || !finite(value[3])) {
      fail(path, 'invalid_collision_rect', 'Collision tuples must contain exactly four finite numbers.');
    }
    return { x: value[0], y: value[1], width: value[2], height: value[3] };
  }
  if (isObject(value) && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height)) {
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }
  fail(path, 'invalid_collision_rect', 'Collision rectangles must be four-number tuples or expanded rectangles.');
}

function propertiesValue(value: any): Record<string, World2DPropertyData> {
  return value === undefined ? {} : cloneJson(value);
}

function parseTileset(
  raw: any,
  index: number,
  explicitSize: World2DVector | null,
  defaultSize: World2DVector | null,
): World2DTilesetData {
  const path = '/tilesets/' + index;
  const tileSize = explicitSize === null ? defaultSize : explicitSize;
  if (tileSize === null) fail(path + '/tileSize', 'missing_tile_size', 'Tileset needs a tile size or a map-level default.');
  const margin = raw.margin === undefined ? { x: 0, y: 0 } : vectorValue(raw.margin, path + '/margin');
  const spacing = raw.spacing === undefined ? { x: 0, y: 0 } : vectorValue(raw.spacing, path + '/spacing');
  let tiles: World2DTileDefinition[] = [];
  if (raw.tiles !== undefined) {
    if (!Array.isArray(raw.tiles)) fail(path + '/tiles', 'invalid_tiles', 'Tile definitions must be an array.');
    tiles = raw.tiles.map((tile: any, tileIndex: number) => {
      const tilePath = path + '/tiles/' + tileIndex;
      if (!isObject(tile)) fail(tilePath, 'invalid_tile', 'Tile definition must be an object.');
      const output: World2DTileDefinition = {
        tileId: tile.tileId,
        properties: propertiesValue(tile.properties),
      };
      if (tile.collision !== undefined) output.collision = rectValue(tile.collision, tilePath + '/collision');
      return output;
    });
  }
  return {
    id: raw.id,
    image: raw.image,
    tileWidth: tileSize.x,
    tileHeight: tileSize.y,
    columns: raw.columns === undefined ? 1 : raw.columns,
    tileCount: raw.tileCount === undefined ? 1 : raw.tileCount,
    margin,
    spacing,
    tiles,
  };
}

function parseObject(raw: any, layerIndex: number, objectIndex: number): World2DObjectData {
  const path = '/layers/' + layerIndex + '/objects/' + objectIndex;
  if (!isObject(raw)) fail(path, 'invalid_object', 'Object must be an object.');
  const position = vectorValue(raw.position, path + '/position');
  const size = vectorValue(raw.size, path + '/size');
  const origin = raw.origin === undefined ? { x: 0, y: 0 } : vectorValue(raw.origin, path + '/origin');
  let components: any[] = [];
  if (raw.components !== undefined) {
    if (!Array.isArray(raw.components)) fail(path + '/components', 'invalid_components', 'Object components must be an array.');
    components = cloneJson(raw.components);
  }
  let tags: string[] = [];
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) fail(path + '/tags', 'invalid_tags', 'Object tags must be an array.');
    tags = cloneJson(raw.tags);
  }
  return {
    id: raw.id,
    name: raw.name === undefined ? raw.id : raw.name,
    type: raw.type,
    position,
    rotation: raw.rotation === undefined ? 0 : raw.rotation,
    size,
    origin,
    visible: raw.visible === undefined ? true : raw.visible,
    tags,
    properties: propertiesValue(raw.properties),
    components,
  };
}

function appendUnique(values: any[], value: any): void {
  if (values.indexOf(value) < 0) values.push(value);
}

function appendFileProperties(value: any, assets: any[]): void {
  if (!isObject(value)) return;
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index++) {
    const property = value[keys[index]];
    if (isObject(property) && property.type === 'file' && typeof property.value === 'string') {
      appendUnique(assets, property.value);
    }
  }
}

function inferredAssets(root: any, tilesets: any[], layers: any[]): any[] {
  const references: any[] = [];
  for (let index = 0; index < tilesets.length; index++) {
    if (typeof tilesets[index].image === 'string') appendUnique(references, tilesets[index].image);
    const tiles = Array.isArray(tilesets[index].tiles) ? tilesets[index].tiles : [];
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) appendFileProperties(tiles[tileIndex].properties, references);
  }
  for (let index = 0; index < layers.length; index++) {
    appendFileProperties(layers[index].properties, references);
    if (layers[index].type === 'objects' && Array.isArray(layers[index].objects)) {
      for (let objectIndex = 0; objectIndex < layers[index].objects.length; objectIndex++) {
        appendFileProperties(layers[index].objects[objectIndex].properties, references);
      }
    }
  }

  if (root.assets !== undefined && !Array.isArray(root.assets)) {
    fail('/assets', 'invalid_assets', 'Additional assets must be an array of paths.');
  }
  const assets = references.slice();
  const explicit = root.assets === undefined ? [] : root.assets;
  const seenExtra: any[] = [];
  for (let index = 0; index < explicit.length; index++) {
    const item = explicit[index];
    if (typeof item === 'string' && references.indexOf(item) >= 0) continue;
    if (seenExtra.indexOf(item) >= 0) assets.push(item);
    else {
      seenExtra.push(item);
      assets.push(item);
    }
  }
  return assets;
}

function parseExpandedTileCells(value: any): Array<WorldTileCell | null> {
  return cloneJson(value);
}

function decodeCompactCells(
  data: any,
  cellCount: number,
  codebook: ReturnType<typeof createWorld2DTileCodebook>,
): Array<WorldTileCell | null> {
  const codes = decodeWorld2DTileGrid(data, cellCount);
  const cells: Array<WorldTileCell | null> = [];
  for (let index = 0; index < codes.length; index++) cells.push(codebook.decode(codes[index]));
  return cells;
}

function parseLayerBase(raw: any, path: string): any {
  return {
    id: raw.id,
    name: raw.name === undefined ? raw.id : raw.name,
    visible: raw.visible === undefined ? true : raw.visible,
    opacity: raw.opacity === undefined ? 1 : raw.opacity,
    offset: raw.offset === undefined ? { x: 0, y: 0 } : vectorValue(raw.offset, path + '/offset'),
    parallax: raw.parallax === undefined ? { x: 1, y: 1 } : vectorValue(raw.parallax, path + '/parallax'),
    properties: propertiesValue(raw.properties),
  };
}

function chooseMapSize(root: any, layerSizes: Array<WorldSize | null>): WorldSize | null {
  if (root.size !== undefined) {
    const explicit = sizeValue(root.size, '/size');
    checkedCellCount(explicit, '/size');
    return explicit;
  }
  return chooseCommonSize(layerSizes);
}

function normalizeVersion2(root: any): World2DDocument {
  if (root.format !== WORLD2D_FORMAT) fail('/format', 'invalid_format', 'format must be bornengine.world2d.');
  if (root.version !== WORLD2D_VERSION) fail('/version', 'unsupported_version', 'Only World2D version 2 storage is supported.');
  if (!Array.isArray(root.tilesets)) fail('/tilesets', 'invalid_tilesets', 'tilesets must be an array.');
  if (!Array.isArray(root.layers)) fail('/layers', 'invalid_layers', 'layers must be an array.');

  const explicitRootTileSize = root.tileSize === undefined ? null : vectorValue(root.tileSize, '/tileSize');
  if (explicitRootTileSize !== null &&
      (!safeInteger(explicitRootTileSize.x) || !safeInteger(explicitRootTileSize.y) ||
       explicitRootTileSize.x <= 0 || explicitRootTileSize.y <= 0)) {
    fail('/tileSize', 'invalid_dimensions', 'Map tileSize values must be positive safe integers.');
  }
  const sourceSizes: Array<World2DVector | null> = [];
  for (let index = 0; index < root.tilesets.length; index++) {
    const raw = root.tilesets[index];
    if (!isObject(raw)) fail('/tilesets/' + index, 'invalid_tileset', 'Tileset must be an object.');
    sourceSizes.push(tilesetSize(raw, '/tilesets/' + index));
  }

  const rawLayerSizes: Array<WorldSize | null> = [];
  const layerTileSizes: Array<World2DVector | null> = [];
  for (let index = 0; index < root.layers.length; index++) {
    const raw = root.layers[index];
    if (!isObject(raw)) fail('/layers/' + index, 'invalid_layer', 'Layer must be an object.');
    if (raw.type === 'tilemap') {
      const layerSize = raw.size === undefined ? root.size : raw.size;
      rawLayerSizes.push(dimensionsFromFields(layerSize, raw.width, raw.height, '/layers/' + index + '/size'));
      layerTileSizes.push(vectorValueOrNull(raw.tileSize, '/layers/' + index + '/tileSize'));
    } else {
      rawLayerSizes.push(null);
      layerTileSizes.push(null);
    }
  }

  const mapSize = chooseMapSize(root, rawLayerSizes);
  const defaultTileSize = chooseCommonTileSize(explicitRootTileSize, sourceSizes, layerTileSizes);
  const normalizedTilesets = root.tilesets.map((raw: any, index: number) =>
    parseTileset(raw, index, sourceSizes[index], defaultTileSize));
  const codebook = createWorld2DTileCodebook(normalizedTilesets);
  const normalizedLayers: World2DLayer[] = [];

  for (let index = 0; index < root.layers.length; index++) {
    const raw = root.layers[index];
    const path = '/layers/' + index;
    const base = parseLayerBase(raw, path);
    if (raw.type === 'tilemap') {
      const size = rawLayerSizes[index] === null ? mapSize : rawLayerSizes[index];
      if (size === null) fail(path + '/size', 'missing_dimensions', 'Tile layer needs its size or a map-level default.');
      const cellCount = checkedCellCount(size, path + '/size');
      const tileSize = layerTileSizes[index] === null ? defaultTileSize : layerTileSizes[index];
      if (tileSize === null) fail(path + '/tileSize', 'missing_tile_size', 'Tile layer needs tileSize or a map-level default.');
      if (raw.data === undefined) fail(path + '/data', 'invalid_tile_data', 'Tile layer data is required.');
      let data: Array<WorldTileCell | null>;
      if (Array.isArray(raw.data) && raw.data.every((item: any) => typeof item === 'number')) {
        try {
          data = decodeCompactCells(raw.data, cellCount, codebook);
        } catch (error) {
          const item = diagnosticFromError(error);
          fail(path + '/data' + item.path, item.code, item.message);
        }
      } else if (isObject(raw.data)) {
        try {
          data = decodeCompactCells(raw.data, cellCount, codebook);
        } catch (error) {
          const item = diagnosticFromError(error);
          fail(path + '/data' + item.path, item.code, item.message);
        }
      } else {
        data = parseExpandedTileCells(raw.data);
      }
      const layer: World2DTileLayer = {
        ...base,
        type: 'tilemap',
        width: size.width,
        height: size.height,
        tileSize: cloneJson(tileSize),
        data,
      };
      normalizedLayers.push(layer);
    } else if (raw.type === 'objects') {
      const objects = raw.objects === undefined ? [] : raw.objects;
      if (!Array.isArray(objects)) fail(path + '/objects', 'invalid_objects', 'Object layers require an objects array.');
      const normalizedObjects = objects.map((item: any, objectIndex: number) => parseObject(item, index, objectIndex));
      normalizedLayers.push({ ...base, type: 'objects', objects: normalizedObjects });
    } else {
      normalizedLayers.push({ ...base, type: raw.type } as any);
    }
  }

  const assets = inferredAssets(root, root.tilesets, root.layers);
  const document: World2DDocument = {
    format: WORLD2D_FORMAT,
    version: WORLD2D_VERSION,
    id: root.id,
    name: root.name === undefined ? root.id : root.name,
    assets,
    tilesets: normalizedTilesets,
    layers: normalizedLayers,
    metadata: root.metadata === undefined ? {} : cloneJson(root.metadata),
  };
  const checked = validateNormalizedWorld2D(document);
  if (!checked.ok) {
    throw new World2DStorageValidationError(checked.diagnostics);
  }
  return document;
}

function vectorValueOrNull(value: any, path: string): World2DVector | null {
  return value === undefined ? null : vectorValue(value, path);
}

/** Restores the expanded in-memory model from a strict v1 document or compact v2 storage. */
export function normalizeWorld2DStorage(input: unknown): World2DMigrationResult {
  if (!isObject(input)) {
    return diagnosticResult([{ path: '', code: 'invalid_document', message: 'World2D document must be a JSON object.' }]);
  }
  const root = input as Record<string, any>;
  try {
    if (root.format !== WORLD2D_FORMAT) fail('/format', 'invalid_format', 'format must be bornengine.world2d.');
    if (root.version === 1) {
      const checked = validateNormalizedWorld2D(root);
      if (!checked.ok) return diagnosticResult(checked.diagnostics);
      const document = cloneJson(root) as World2DDocument;
      document.version = WORLD2D_VERSION;
      return { ok: true, diagnostics: [], document };
    }
    if (root.version === WORLD2D_VERSION) {
      const document = normalizeVersion2(root);
      return { ok: true, diagnostics: [], document };
    }
    fail('/version', 'unsupported_version', 'World2D version is unsupported.');
  } catch (error) {
    if (error !== null && typeof error === 'object' && Array.isArray((error as any).diagnostics)) {
      return diagnosticResult((error as any).diagnostics as World2DDiagnostic[]);
    }
    return diagnosticResult([diagnosticFromError(error)]);
  }
}
