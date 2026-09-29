import { validateWorld2D } from './validate';
import type {
  World2DDocument,
  World2DDiagnostic,
  World2DJsonValue,
  World2DLayer,
  World2DObjectData,
  World2DPropertyData,
  World2DSerializeResult,
  World2DTileDefinition,
  World2DTileLayer,
  World2DTilesetData,
  WorldTileCell,
} from './types';

function quote(value: string): string {
  let output = '"';
  for (let index = 0; index < value.length; index++) {
    const character = value.charCodeAt(index);
    if (character === 34) output = output + '\\"';
    else if (character === 92) output = output + '\\\\';
    else if (character === 10) output = output + '\\n';
    else if (character === 13) output = output + '\\r';
    else if (character === 9) output = output + '\\t';
    else if (character === 8) output = output + '\\b';
    else if (character === 12) output = output + '\\f';
    else if (character < 32) {
      let hex = character.toString(16);
      while (hex.length < 4) hex = '0' + hex;
      output = output + '\\u' + hex;
    } else output = output + value.charAt(index);
  }
  return output + '"';
}

function number(value: number): string {
  if (value === Math.floor(value) && Math.abs(value) < 1e15) return '' + value;
  return '' + value;
}

function indent(depth: number): string {
  let output = '';
  for (let index = 0; index < depth; index++) output = output + '  ';
  return output;
}

function compareStrings(left: string, right: string): number {
  const limit = left.length < right.length ? left.length : right.length;
  for (let index = 0; index < limit; index++) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode < rightCode) return -1;
    if (leftCode > rightCode) return 1;
  }
  if (left.length < right.length) return -1;
  if (left.length > right.length) return 1;
  return 0;
}

function sortedKeys(value: any): string[] {
  const keys = Object.keys(value);
  for (let index = 1; index < keys.length; index++) {
    const item = keys[index];
    let position = index;
    while (position > 0) {
      if (compareStrings(keys[position - 1], item) <= 0) break;
      keys[position] = keys[position - 1];
      position--;
    }
    keys[position] = item;
  }
  return keys;
}

function jsonValue(value: World2DJsonValue, depth: number, sortObjects: boolean): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return number(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    let output = '[\n';
    for (let index = 0; index < value.length; index++) {
      output = output + indent(depth + 1) + jsonValue(value[index], depth + 1, sortObjects);
      if (index + 1 < value.length) output = output + ',';
      output = output + '\n';
    }
    return output + indent(depth) + ']';
  }
  const keys = sortObjects ? sortedKeys(value) : Object.keys(value);
  if (keys.length === 0) return '{}';
  let output = '{\n';
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    output = output + indent(depth + 1) + quote(key) + ': ' +
      jsonValue(value[key], depth + 1, sortObjects);
    if (index + 1 < keys.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth) + '}';
}

function vector(value: { x: number; y: number }): string {
  return '{ "x": ' + number(value.x) + ', "y": ' + number(value.y) + ' }';
}

function rect(value: { x: number; y: number; width: number; height: number }): string {
  return '{ "x": ' + number(value.x) + ', "y": ' + number(value.y) +
    ', "width": ' + number(value.width) + ', "height": ' + number(value.height) + ' }';
}

function properties(value: Record<string, World2DPropertyData>, depth: number): string {
  const keys = sortedKeys(value);
  if (keys.length === 0) return '{}';
  let output = '{\n';
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    output = output + indent(depth + 1) + quote(key) + ': { "type": ' + quote(value[key].type) +
      ', "value": ' + jsonValue(value[key].value, depth + 1, true) + ' }';
    if (index + 1 < keys.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth) + '}';
}

function tileDefinition(value: World2DTileDefinition, depth: number): string {
  let output = '{\n';
  output = output + indent(depth + 1) + '"tileId": ' + number(value.tileId) + ',\n';
  if (value.collision !== undefined) {
    output = output + indent(depth + 1) + '"collision": ' + rect(value.collision) + ',\n';
  }
  output = output + indent(depth + 1) + '"properties": ' + properties(value.properties, depth + 1) + '\n';
  return output + indent(depth) + '}';
}

function tileset(value: World2DTilesetData, depth: number): string {
  let output = '{\n';
  output = output + indent(depth + 1) + '"id": ' + quote(value.id) + ',\n';
  output = output + indent(depth + 1) + '"image": ' + quote(value.image) + ',\n';
  output = output + indent(depth + 1) + '"tileWidth": ' + number(value.tileWidth) + ',\n';
  output = output + indent(depth + 1) + '"tileHeight": ' + number(value.tileHeight) + ',\n';
  output = output + indent(depth + 1) + '"columns": ' + number(value.columns) + ',\n';
  output = output + indent(depth + 1) + '"tileCount": ' + number(value.tileCount) + ',\n';
  output = output + indent(depth + 1) + '"margin": ' + number(value.margin) + ',\n';
  output = output + indent(depth + 1) + '"spacing": ' + number(value.spacing) + ',\n';
  output = output + indent(depth + 1) + '"tiles": ';
  if (value.tiles.length === 0) return output + '[]\n' + indent(depth) + '}';
  output = output + '[\n';
  for (let index = 0; index < value.tiles.length; index++) {
    output = output + indent(depth + 2) + tileDefinition(value.tiles[index], depth + 2);
    if (index + 1 < value.tiles.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth + 1) + ']\n' + indent(depth) + '}';
}

function cell(value: WorldTileCell | null): string {
  if (value === null) return 'null';
  return '{ "tilesetId": ' + quote(value.tilesetId) + ', "tileId": ' + number(value.tileId) +
    ', "flipX": ' + (value.flipX ? 'true' : 'false') +
    ', "flipY": ' + (value.flipY ? 'true' : 'false') +
    ', "flipDiagonal": ' + (value.flipDiagonal ? 'true' : 'false') + ' }';
}

function cells(values: Array<WorldTileCell | null>, depth: number): string {
  if (values.length === 0) return '[]';
  let output = '[\n';
  for (let index = 0; index < values.length; index++) {
    output = output + indent(depth + 1) + cell(values[index]);
    if (index + 1 < values.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth) + ']';
}

function component(value: { kind: string; data: Record<string, World2DJsonValue> }, depth: number): string {
  return '{\n'
    + indent(depth + 1) + '"kind": ' + quote(value.kind) + ',\n'
    + indent(depth + 1) + '"data": ' + jsonValue(value.data, depth + 1, true) + '\n'
    + indent(depth) + '}';
}

function objectData(value: World2DObjectData, depth: number): string {
  let output = '{\n';
  output = output + indent(depth + 1) + '"id": ' + quote(value.id) + ',\n';
  output = output + indent(depth + 1) + '"name": ' + quote(value.name) + ',\n';
  output = output + indent(depth + 1) + '"type": ' + quote(value.type) + ',\n';
  output = output + indent(depth + 1) + '"position": ' + vector(value.position) + ',\n';
  output = output + indent(depth + 1) + '"rotation": ' + number(value.rotation) + ',\n';
  output = output + indent(depth + 1) + '"size": ' + vector(value.size) + ',\n';
  output = output + indent(depth + 1) + '"origin": ' + vector(value.origin) + ',\n';
  output = output + indent(depth + 1) + '"visible": ' + (value.visible ? 'true' : 'false') + ',\n';
  output = output + indent(depth + 1) + '"tags": ' + jsonValue(value.tags, depth + 1, true) + ',\n';
  output = output + indent(depth + 1) + '"properties": ' + properties(value.properties, depth + 1) + ',\n';
  output = output + indent(depth + 1) + '"components": ';
  if (value.components.length === 0) return output + '[]\n' + indent(depth) + '}';
  output = output + '[\n';
  for (let index = 0; index < value.components.length; index++) {
    output = output + indent(depth + 2) + component(value.components[index], depth + 2);
    if (index + 1 < value.components.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth + 1) + ']\n' + indent(depth) + '}';
}

function objectArray(values: World2DObjectData[], depth: number): string {
  if (values.length === 0) return '[]';
  let output = '[\n';
  for (let index = 0; index < values.length; index++) {
    output = output + indent(depth + 1) + objectData(values[index], depth + 1);
    if (index + 1 < values.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth) + ']';
}

function layer(value: World2DLayer, depth: number): string {
  let output = '{\n';
  output = output + indent(depth + 1) + '"id": ' + quote(value.id) + ',\n';
  output = output + indent(depth + 1) + '"type": ' + quote(value.type) + ',\n';
  output = output + indent(depth + 1) + '"name": ' + quote(value.name) + ',\n';
  output = output + indent(depth + 1) + '"visible": ' + (value.visible ? 'true' : 'false') + ',\n';
  output = output + indent(depth + 1) + '"opacity": ' + number(value.opacity) + ',\n';
  output = output + indent(depth + 1) + '"offset": ' + vector(value.offset) + ',\n';
  output = output + indent(depth + 1) + '"parallax": ' + vector(value.parallax) + ',\n';
  if (value.properties !== undefined) {
    output = output + indent(depth + 1) + '"properties": ' + properties(value.properties, depth + 1) + ',\n';
  }
  if (value.type === 'tilemap') {
    const tileLayerValue: World2DTileLayer = value;
    output = output + indent(depth + 1) + '"width": ' + number(tileLayerValue.width) + ',\n';
    output = output + indent(depth + 1) + '"height": ' + number(tileLayerValue.height) + ',\n';
    output = output + indent(depth + 1) + '"tileSize": ' + vector(tileLayerValue.tileSize) + ',\n';
    output = output + indent(depth + 1) + '"data": ' + cells(tileLayerValue.data, depth + 1) + '\n';
  } else {
    output = output + indent(depth + 1) + '"objects": ' + objectArray(value.objects, depth + 1) + '\n';
  }
  return output + indent(depth) + '}';
}

function arrayOf<T>(values: T[], depth: number, emit: (value: T, depth: number) => string): string {
  if (values.length === 0) return '[]';
  let output = '[\n';
  for (let index = 0; index < values.length; index++) {
    output = output + indent(depth + 1) + emit(values[index], depth + 1);
    if (index + 1 < values.length) output = output + ',';
    output = output + '\n';
  }
  return output + indent(depth) + ']';
}

function serializeValidDocument(document: World2DDocument): string {
  const assets: string[] = [];
  for (let index = 0; index < document.assets.length; index++) assets.push(document.assets[index]);
  for (let index = 1; index < assets.length; index++) {
    const item = assets[index];
    let position = index;
    while (position > 0) {
      if (compareStrings(assets[position - 1], item) <= 0) break;
      assets[position] = assets[position - 1];
      position--;
    }
    assets[position] = item;
  }
  let output = '{\n';
  output = output + '  "format": ' + quote(document.format) + ',\n';
  output = output + '  "version": ' + number(document.version) + ',\n';
  output = output + '  "id": ' + quote(document.id) + ',\n';
  output = output + '  "name": ' + quote(document.name) + ',\n';
  output = output + '  "assets": ' + jsonValue(assets, 1, true) + ',\n';
  output = output + '  "tilesets": ' + arrayOf(document.tilesets, 1, tileset) + ',\n';
  output = output + '  "layers": ' + arrayOf(document.layers, 1, layer) + ',\n';
  output = output + '  "metadata": ' + jsonValue(document.metadata, 1, false) + '\n';
  return output + '}';
}

/** Produces canonical pretty JSON after validation, without relying on JSON.stringify. */
export function serializeWorld2D(input: unknown): World2DSerializeResult {
  const checked = validateWorld2D(input);
  if (!checked.ok) return { ok: false, diagnostics: checked.diagnostics, json: '' };
  try {
    return {
      ok: true,
      diagnostics: [],
      json: serializeValidDocument(input as World2DDocument),
    };
  } catch (_error) {
    const diagnostic: World2DDiagnostic = {
      path: '',
      code: 'serialization_failed',
      message: 'World2D document could not be serialized safely.',
    };
    return { ok: false, diagnostics: [diagnostic], json: '' };
  }
}
