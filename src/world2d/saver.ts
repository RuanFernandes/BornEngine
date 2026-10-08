import { createWorld2DTileCodebook } from './tileCodes';
import { encodeWorld2DTileGrid } from './tileGridCodec';
import { normalizeWorld2DStorage } from './storage';
import { WORLD2D_FORMAT, WORLD2D_VERSION } from './types';
import type {
  World2DDiagnostic,
  World2DDocument,
  World2DLayer,
  World2DObjectData,
  World2DSerializeOptions,
  World2DSerializeResult,
  World2DTileDefinition,
  World2DTileLayer,
  World2DTilesetData,
  WorldTileCell,
} from './types';

interface Size2 {
  x: number;
  y: number;
}

class ReadableTileGrid {
  readonly values: number[];
  readonly width: number;

  constructor(values: number[], width: number) {
    this.values = values;
    this.width = width;
  }
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function number(value: number): string {
  return value === 0 ? '0' : '' + value;
}

function indent(depth: number): string {
  let output = '';
  for (let index = 0; index < depth; index++) output += '  ';
  return output;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort(compareStrings);
}

function setJsonProperty(target: Record<string, any>, key: string, value: any): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
    return;
  }
  target[key] = value;
}

function emitReadableGrid(grid: ReadableTileGrid, depth: number): string {
  let output = '[\n';
  for (let row = 0; row < grid.values.length; row += grid.width) {
    const rowEnd = Math.min(row + grid.width, grid.values.length);
    output += indent(depth + 1);
    for (let index = row; index < rowEnd; index++) {
      if (index > row) output += ', ';
      output += number(grid.values[index]);
    }
    if (rowEnd < grid.values.length) output += ',';
    output += '\n';
  }
  return output + indent(depth) + ']';
}

function emitJson(value: any, depth: number, readable: boolean, sortObjects: boolean): string {
  if (value instanceof ReadableTileGrid) return emitReadableGrid(value, depth);
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return number(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (!readable) return '[' + value.map((item) => emitJson(item, depth + 1, false, sortObjects)).join(',') + ']';
    return (
      '[\n' +
      value.map((item) => indent(depth + 1) + emitJson(item, depth + 1, true, sortObjects)).join(',\n') +
      '\n' +
      indent(depth) +
      ']'
    );
  }
  if (typeof value !== 'object') throw new Error('Value is not JSON data.');
  const keys = sortObjects ? sortedKeys(value) : Object.keys(value);
  if (keys.length === 0) return '{}';
  if (!readable) {
    return (
      '{' + keys.map((key) => quote(key) + ':' + emitJson(value[key], depth + 1, false, sortObjects)).join(',') + '}'
    );
  }
  return (
    '{\n' +
    keys
      .map((key) => indent(depth + 1) + quote(key) + ': ' + emitJson(value[key], depth + 1, true, sortObjects))
      .join(',\n') +
    '\n' +
    indent(depth) +
    '}'
  );
}

function emptyRecord(value: Record<string, unknown> | undefined): boolean {
  if (value === undefined) return true;
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return false;
  }
  return true;
}

function orderedObject(value: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = {};
  for (const key of sortedKeys(value)) setJsonProperty(output, key, value[key]);
  return output;
}

function orderedJson(value: any): any {
  if (Array.isArray(value)) return value.map(orderedJson);
  if (value === null || typeof value !== 'object') return value;
  const output: Record<string, any> = {};
  for (const key of Object.keys(value).sort(compareStrings)) setJsonProperty(output, key, orderedJson(value[key]));
  return output;
}

function tuple(value: { x: number; y: number }): [number, number] {
  return [value.x, value.y];
}

function sameSize(left: Size2, right: Size2): boolean {
  return left.x === right.x && left.y === right.y;
}

function canBeDefaultTileSize(size: Size2 | null): size is Size2 {
  return (
    size !== null &&
    size.x > 0 &&
    size.y > 0 &&
    Math.floor(size.x) === size.x &&
    Math.floor(size.y) === size.y &&
    Math.abs(size.x) <= 9007199254740991 &&
    Math.abs(size.y) <= 9007199254740991
  );
}

function chooseMapSize(layers: World2DLayer[]): Size2 | null {
  const counts: Record<string, number> = {};
  for (const layer of layers) {
    if (layer.type !== 'tilemap') continue;
    const key = layer.width + ',' + layer.height;
    counts[key] = (counts[key] || 0) + 1;
  }
  let maximum = 0;
  for (const key of Object.keys(counts)) maximum = Math.max(maximum, counts[key]);
  for (const layer of layers) {
    if (layer.type !== 'tilemap') continue;
    const key = layer.width + ',' + layer.height;
    if (counts[key] === maximum) return { x: layer.width, y: layer.height };
  }
  return null;
}

function chooseTileSize(document: World2DDocument): Size2 | null {
  const candidates: Size2[] = [];
  for (const tileset of document.tilesets) candidates.push({ x: tileset.tileWidth, y: tileset.tileHeight });
  for (const layer of document.layers) if (layer.type === 'tilemap') candidates.push(layer.tileSize);
  if (candidates.length === 0) return null;

  const counts: Record<string, number> = {};
  let maximum = 0;
  for (const candidate of candidates) {
    const key = candidate.x + ',' + candidate.y;
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > maximum) maximum = counts[key];
  }
  const primary = document.tilesets.length === 0 ? null : document.tilesets[0];
  if (primary !== null) {
    const key = primary.tileWidth + ',' + primary.tileHeight;
    if (counts[key] === maximum) return { x: primary.tileWidth, y: primary.tileHeight };
  }
  let best: Size2 | null = null;
  for (const candidate of candidates) {
    if (counts[candidate.x + ',' + candidate.y] !== maximum) continue;
    if (best === null || candidate.x < best.x || (candidate.x === best.x && candidate.y < best.y)) best = candidate;
  }
  return best;
}

function propertyReferences(properties: Record<string, any> | undefined, output: string[]): void {
  if (properties === undefined) return;
  for (const key of Object.keys(properties)) {
    const property = properties[key];
    if (
      property !== null &&
      typeof property === 'object' &&
      property.type === 'file' &&
      typeof property.value === 'string' &&
      output.indexOf(property.value) < 0
    )
      output.push(property.value);
  }
}

function referencedAssets(document: World2DDocument): string[] {
  const output: string[] = [];
  for (const tileset of document.tilesets) {
    if (output.indexOf(tileset.image) < 0) output.push(tileset.image);
    for (const tile of tileset.tiles) propertyReferences(tile.properties, output);
  }
  for (const layer of document.layers) {
    propertyReferences(layer.properties, output);
    if (layer.type === 'objects') for (const object of layer.objects) propertyReferences(object.properties, output);
  }
  return output;
}

function diskTileDefinition(tile: World2DTileDefinition): Record<string, unknown> {
  const output: Record<string, unknown> = { tileId: tile.tileId };
  if (tile.collision !== undefined)
    output.collision = [tile.collision.x, tile.collision.y, tile.collision.width, tile.collision.height];
  if (!emptyRecord(tile.properties)) output.properties = orderedObject(tile.properties);
  return output;
}

function diskTileset(tileset: World2DTilesetData, common: Size2 | null): Record<string, unknown> {
  const output: Record<string, unknown> = { id: tileset.id, image: tileset.image };
  const tileSize = { x: tileset.tileWidth, y: tileset.tileHeight };
  if (common === null || !sameSize(tileSize, common)) output.tileSize = tuple(tileSize);
  if (tileset.columns !== 1) output.columns = tileset.columns;
  if (tileset.tileCount !== 1) output.tileCount = tileset.tileCount;
  if (tileset.margin.x !== 0 || tileset.margin.y !== 0) output.margin = tuple(tileset.margin);
  if (tileset.spacing.x !== 0 || tileset.spacing.y !== 0) output.spacing = tuple(tileset.spacing);
  if (tileset.tiles.length > 0) output.tiles = tileset.tiles.map(diskTileDefinition);
  return output;
}

function diskObject(object: World2DObjectData): Record<string, unknown> {
  const output: Record<string, unknown> = { id: object.id };
  if (object.name !== object.id) output.name = object.name;
  output.type = object.type;
  output.position = tuple(object.position);
  if (object.rotation !== 0) output.rotation = object.rotation;
  output.size = tuple(object.size);
  if (object.origin.x !== 0 || object.origin.y !== 0) output.origin = tuple(object.origin);
  if (!object.visible) output.visible = false;
  if (object.tags.length > 0) output.tags = object.tags;
  if (!emptyRecord(object.properties)) output.properties = orderedObject(object.properties);
  if (object.components.length > 0)
    output.components = object.components.map((component) => ({
      kind: component.kind,
      data: orderedJson(component.data),
    }));
  return output;
}

function layerBase(layer: World2DLayer): Record<string, unknown> {
  const output: Record<string, unknown> = { id: layer.id };
  if (layer.name !== layer.id) output.name = layer.name;
  output.type = layer.type;
  if (!layer.visible) output.visible = false;
  if (layer.opacity !== 1) output.opacity = layer.opacity;
  if (layer.offset.x !== 0 || layer.offset.y !== 0) output.offset = tuple(layer.offset);
  if (layer.parallax.x !== 1 || layer.parallax.y !== 1) output.parallax = tuple(layer.parallax);
  if (!emptyRecord(layer.properties)) output.properties = orderedObject(layer.properties || {});
  return output;
}

function diskLayer(
  layer: World2DLayer,
  document: World2DDocument,
  mapSize: Size2 | null,
  commonTileSize: Size2 | null,
  options: World2DSerializeOptions,
): Record<string, unknown> {
  const output = layerBase(layer);
  if (layer.type === 'objects') {
    if (layer.objects.length > 0) output.objects = layer.objects.map(diskObject);
    return output;
  }

  const tileLayer = layer as World2DTileLayer;
  const size = { x: tileLayer.width, y: tileLayer.height };
  if (mapSize === null || !sameSize(size, mapSize)) output.size = tuple(size);
  if (commonTileSize === null || !sameSize(tileLayer.tileSize, commonTileSize))
    output.tileSize = tuple(tileLayer.tileSize);
  const codebook = createWorld2DTileCodebook(document.tilesets);
  const codes = tileLayer.data.map((cell: WorldTileCell | null) => codebook.encode(cell));
  output.data =
    options.mode === 'readable' ? new ReadableTileGrid(codes, tileLayer.width) : encodeWorld2DTileGrid(codes, options);
  return output;
}

function buildDiskDocument(document: World2DDocument, options: World2DSerializeOptions): Record<string, unknown> {
  const output: Record<string, unknown> = {
    format: WORLD2D_FORMAT,
    version: WORLD2D_VERSION,
    id: document.id,
  };
  if (document.name !== document.id) output.name = document.name;

  const mapSize = chooseMapSize(document.layers);
  const selectedTileSize = chooseTileSize(document);
  const commonTileSize = canBeDefaultTileSize(selectedTileSize) ? selectedTileSize : null;
  if (mapSize !== null) output.size = [mapSize.x, mapSize.y];
  if (commonTileSize !== null) output.tileSize = [commonTileSize.x, commonTileSize.y];

  const inferred = referencedAssets(document);
  const extraAssets = document.assets.filter((asset) => inferred.indexOf(asset) < 0).sort(compareStrings);
  if (extraAssets.length > 0) output.assets = extraAssets;
  output.tilesets = document.tilesets.map((tileset) => diskTileset(tileset, commonTileSize));
  output.layers = document.layers.map((layer) => diskLayer(layer, document, mapSize, commonTileSize, options));
  if (!emptyRecord(document.metadata)) output.metadata = document.metadata;
  return output;
}

function normalizeOptions(options: World2DSerializeOptions | undefined): World2DSerializeOptions {
  if (options === undefined) return { mode: 'compact', effort: 'max' };
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Serialization options must be an object.');
  if (options.mode !== undefined && options.mode !== 'compact' && options.mode !== 'readable')
    throw new Error('Serialization mode is unsupported.');
  if (options.effort !== undefined && options.effort !== 'fast' && options.effort !== 'max')
    throw new Error('Serialization effort is unsupported.');
  return { mode: options.mode || 'compact', effort: options.effort || 'max' };
}

function caughtDiagnostic(error: any): World2DDiagnostic {
  if (
    error !== null &&
    typeof error === 'object' &&
    error.diagnostic !== null &&
    typeof error.diagnostic === 'object'
  ) {
    const item = error.diagnostic;
    if (typeof item.path === 'string' && typeof item.code === 'string' && typeof item.message === 'string') return item;
  }
  return { path: '', code: 'serialization_failed', message: 'World2D document could not be serialized safely.' };
}

/** Writes compact v2 storage by default, while retaining readable JSON on request. */
export function serializeWorld2D(input: unknown, options?: World2DSerializeOptions): World2DSerializeResult {
  const normalized = normalizeWorld2DStorage(input);
  if (!normalized.ok || normalized.document === null) {
    return { ok: false, diagnostics: normalized.diagnostics, json: '' };
  }
  try {
    const normalizedOptions = normalizeOptions(options);
    const stored = buildDiskDocument(normalized.document, normalizedOptions);
    return {
      ok: true,
      diagnostics: [],
      json: emitJson(stored, 0, normalizedOptions.mode === 'readable', false),
    };
  } catch (error) {
    return { ok: false, diagnostics: [caughtDiagnostic(error)], json: '' };
  }
}
