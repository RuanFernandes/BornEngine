import { BUILTIN_WORLD2D_COMPONENT_KINDS, WORLD2D_FORMAT, WORLD2D_VERSION } from './types';
import { createWorld2DTileCodebook } from './tileCodes';
import type {
  World2DDiagnostic,
  World2DValidationResult,
  World2DVector,
} from './types';

function finite(value: any): boolean {
  if (typeof value !== 'number') return false;
  if (value !== value) return false;
  if (value === Infinity || value === -Infinity) return false;
  return true;
}

function integer(value: any): boolean {
  if (!finite(value)) return false;
  return Math.floor(value) === value;
}

function isObject(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return true;
}

function pointer(path: string, segment: string | number): string {
  const encoded = ('' + segment).replace(/~/g, '~0').replace(/\//g, '~1');
  return path + '/' + encoded;
}

function add(diagnostics: World2DDiagnostic[], path: string, code: string, message: string): void {
  diagnostics.push({ path, code, message });
}

function nonEmptyString(value: any): boolean {
  if (typeof value !== 'string') return false;
  return value.length > 0;
}

function validRelativePath(value: any): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (value !== value.trim()) return false;
  if (value.charAt(0) === '/') return false;
  if (value.indexOf('\\') >= 0) return false;
  if (value.indexOf(':') >= 0) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  const segments = value.split('/');
  for (let index = 0; index < segments.length; index++) {
    if (segments[index].length === 0 || segments[index] === '.' || segments[index] === '..') return false;
  }
  return true;
}

function vector2(value: any): boolean {
  if (!isObject(value)) return false;
  if (!finite(value.x)) return false;
  if (!finite(value.y)) return false;
  return true;
}

function positiveVector2(value: any): boolean {
  if (!vector2(value)) return false;
  if (value.x <= 0) return false;
  if (value.y <= 0) return false;
  return true;
}

function nonNegativeIntegerVector2(value: any): boolean {
  if (!vector2(value)) return false;
  return integer(value.x) && value.x >= 0 && integer(value.y) && value.y >= 0;
}

function validateJson(path: string, value: any, diagnostics: World2DDiagnostic[], depth: number): void {
  if (depth > 128) {
    add(diagnostics, path, 'json_too_deep', 'JSON data exceeds the supported nesting depth.');
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!finite(value)) add(diagnostics, path, 'non_finite_number', 'JSON numbers must be finite.');
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      validateJson(pointer(path, index), value[index], diagnostics, depth + 1);
    }
    return;
  }
  if (!isObject(value)) {
    add(diagnostics, path, 'invalid_json_value', 'Value is not plain JSON data.');
    return;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index++) {
    validateJson(pointer(path, keys[index]), value[keys[index]], diagnostics, depth + 1);
  }
}

function validateProperties(
  path: string,
  value: any,
  diagnostics: World2DDiagnostic[],
  assets: string[],
): void {
  if (!isObject(value)) {
    add(diagnostics, path, 'invalid_properties', 'Properties must be a name-keyed object.');
    return;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index++) {
    const name = keys[index];
    const propertyPath = pointer(path, name);
    const property = value[name];
    if (!nonEmptyString(name) || !isObject(property)) {
      add(diagnostics, propertyPath, 'invalid_property', 'Property must have a supported type and value.');
      continue;
    }
    const type = property.type;
    const item = property.value;
    if (type === 'string' || type === 'file' || type === 'color') {
      if (typeof item !== 'string') {
        add(diagnostics, pointer(propertyPath, 'value'), 'invalid_property_value', type + ' properties require a string value.');
      } else if (type === 'file' && !validRelativePath(item)) {
        add(diagnostics, pointer(propertyPath, 'value'), 'invalid_asset_path', 'File properties must use normalized project-relative paths.');
      } else if (type === 'file' && assets.indexOf(item) < 0) {
        add(diagnostics, pointer(propertyPath, 'value'), 'missing_asset', 'File properties must refer to an asset listed in assets.');
      } else if (type === 'color' && !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(item)) {
        add(diagnostics, pointer(propertyPath, 'value'), 'invalid_color', 'Color properties must use #RRGGBB or #AARRGGBB.');
      }
    } else if (type === 'int') {
      if (!integer(item)) add(diagnostics, pointer(propertyPath, 'value'), 'invalid_property_value', 'Integer properties require a finite integer value.');
    } else if (type === 'float') {
      if (!finite(item)) add(diagnostics, pointer(propertyPath, 'value'), 'invalid_property_value', 'Float properties require a finite number.');
    } else if (type === 'bool') {
      if (typeof item !== 'boolean') add(diagnostics, pointer(propertyPath, 'value'), 'invalid_property_value', 'Boolean properties require a boolean value.');
    } else {
      add(diagnostics, pointer(propertyPath, 'type'), 'unsupported_property_type', 'Property type is unsupported.');
    }
  }
}

function validateRect(path: string, value: any, diagnostics: World2DDiagnostic[], maximum: World2DVector | null): void {
  if (!isObject(value) || !finite(value.x) || !finite(value.y) || !finite(value.width) || !finite(value.height) ||
      value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0) {
    add(diagnostics, path, 'invalid_collision_rect', 'Collision rectangles require non-negative offsets and positive finite dimensions.');
    return;
  }
  if (maximum !== null && (value.x + value.width > maximum.x || value.y + value.height > maximum.y)) {
    add(diagnostics, path, 'collision_out_of_bounds', 'Collision rectangles must fit inside the tile dimensions.');
  }
}

function validateBuiltinComponent(
  path: string,
  component: any,
  tilesetIds: string[],
  tilesets: any[],
  diagnostics: World2DDiagnostic[],
): void {
  if (component.kind === 'spriteRenderer') {
    const data = component.data;
    if (!isObject(data)) {
      add(diagnostics, pointer(path, 'data'), 'invalid_component_data', 'spriteRenderer data must be an object.');
      return;
    }
    const tilesetIndex = tilesetIds.indexOf(data.tilesetId);
    if (tilesetIndex < 0) {
      add(diagnostics, pointer(pointer(path, 'data'), 'tilesetId'), 'unknown_tileset', 'spriteRenderer refers to an unknown tileset.');
    } else if (!integer(data.tileId) || data.tileId < 0 || data.tileId >= tilesets[tilesetIndex].tileCount) {
      add(diagnostics, pointer(pointer(path, 'data'), 'tileId'), 'tile_id_out_of_range', 'spriteRenderer tileId must be a zero-based ID in the referenced tileset.');
    }
    for (const flipKey of ['flipX', 'flipY', 'flipDiagonal']) {
      if (data[flipKey] !== undefined && typeof data[flipKey] !== 'boolean') {
        add(diagnostics, pointer(pointer(path, 'data'), flipKey), 'invalid_flip', 'Sprite flip fields must be booleans.');
      }
    }
    if (data.size !== undefined && (!vector2(data.size) || data.size.x < 0 || data.size.y < 0)) {
      add(diagnostics, pointer(pointer(path, 'data'), 'size'), 'invalid_size', 'Sprite size must contain non-negative finite dimensions.');
    }
    if (data.pivot !== undefined && !vector2(data.pivot)) {
      add(diagnostics, pointer(pointer(path, 'data'), 'pivot'), 'invalid_pivot', 'Sprite pivot must contain finite coordinates.');
    }
    if (data.tint !== undefined) {
      const tint = data.tint;
      if (!isObject(tint) || !finite(tint.r) || !finite(tint.g) || !finite(tint.b) || !finite(tint.a) ||
          tint.r < 0 || tint.r > 255 || tint.g < 0 || tint.g > 255 || tint.b < 0 || tint.b > 255 ||
          tint.a < 0 || tint.a > 255) {
        add(diagnostics, pointer(pointer(path, 'data'), 'tint'), 'invalid_tint', 'Tint channels must be finite values from 0 to 255.');
      }
    }
  } else if (component.kind === 'physicsBody2D') {
    const data = component.data;
    if (!isObject(data)) {
      add(diagnostics, pointer(path, 'data'), 'invalid_component_data', 'physicsBody2D data must be an object.');
      return;
    }
    if (data.type !== 'static' && data.type !== 'dynamic' && data.type !== 'kinematic') {
      add(diagnostics, pointer(pointer(path, 'data'), 'type'), 'invalid_body_type', 'Physics body type must be static, dynamic, or kinematic.');
    }
    const shape = data.shape;
    if (!isObject(shape)) {
      add(diagnostics, pointer(pointer(path, 'data'), 'shape'), 'invalid_shape', 'Physics body shape must be a box or circle.');
    } else if (shape.type === 'box') {
      if (!finite(shape.width) || !finite(shape.height) || shape.width <= 0 || shape.height <= 0) {
        add(diagnostics, pointer(pointer(path, 'data'), 'shape'), 'invalid_shape', 'Box dimensions must be positive finite values.');
      }
    } else if (shape.type === 'circle') {
      if (!finite(shape.radius) || shape.radius <= 0) add(diagnostics, pointer(pointer(path, 'data'), 'shape'), 'invalid_shape', 'Circle radius must be a positive finite value.');
    } else {
      add(diagnostics, pointer(pointer(path, 'data'), 'shape'), 'invalid_shape', 'Physics body shape must be a box or circle.');
    }
    if (data.isSensor !== undefined && typeof data.isSensor !== 'boolean') {
      add(diagnostics, pointer(pointer(path, 'data'), 'isSensor'), 'invalid_sensor', 'isSensor must be a boolean.');
    }
    if (data.layer !== undefined && (!integer(data.layer) || data.layer < 1 || data.layer > 0x7fffffff)) {
      add(diagnostics, pointer(pointer(path, 'data'), 'layer'), 'invalid_collision_filter', 'Physics layer must be a positive 31-bit integer.');
    }
    if (data.mask !== undefined && (!integer(data.mask) || data.mask < 0 || data.mask > 0x7fffffff)) {
      add(diagnostics, pointer(pointer(path, 'data'), 'mask'), 'invalid_collision_filter', 'Physics mask must be a non-negative 31-bit integer.');
    }
  }
}

function validateLayerBase(path: string, layer: any, diagnostics: World2DDiagnostic[], assets: string[]): void {
  if (!nonEmptyString(layer.id)) add(diagnostics, pointer(path, 'id'), 'missing_id', 'Layer ID must be a non-empty string.');
  if (typeof layer.name !== 'string') add(diagnostics, pointer(path, 'name'), 'invalid_name', 'Layer name must be a string.');
  if (typeof layer.visible !== 'boolean') add(diagnostics, pointer(path, 'visible'), 'invalid_visibility', 'Layer visibility must be a boolean.');
  if (!finite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
    add(diagnostics, pointer(path, 'opacity'), 'invalid_opacity', 'Layer opacity must be finite and between 0 and 1.');
  }
  if (!vector2(layer.offset)) add(diagnostics, pointer(path, 'offset'), 'invalid_vector', 'Layer offset must contain finite x and y values.');
  if (!vector2(layer.parallax)) add(diagnostics, pointer(path, 'parallax'), 'invalid_vector', 'Layer parallax must contain finite x and y values.');
  if (layer.properties !== undefined) {
    validateProperties(pointer(path, 'properties'), layer.properties, diagnostics, assets);
  }
}

function validateWorldBody(root: any, diagnostics: World2DDiagnostic[]): void {
  if (!isObject(root)) {
    add(diagnostics, '', 'invalid_document', 'World2D document must be a JSON object.');
    return;
  }
  if (root.format !== WORLD2D_FORMAT) add(diagnostics, '/format', 'invalid_format', 'format must be bornengine.world2d.');
  if (!integer(root.version)) {
    add(diagnostics, '/version', 'invalid_version', 'version must be an integer.');
  } else if (root.version !== 1 && root.version !== WORLD2D_VERSION) {
    add(diagnostics, '/version', 'unsupported_version', 'Only expanded World2D versions 1 and 2 are supported.');
  }
  if (!nonEmptyString(root.id)) add(diagnostics, '/id', 'missing_id', 'World ID must be a non-empty string.');
  if (!nonEmptyString(root.name)) add(diagnostics, '/name', 'invalid_name', 'World name must be a non-empty string.');

  const assetPaths: string[] = [];
  if (!Array.isArray(root.assets)) {
    add(diagnostics, '/assets', 'invalid_assets', 'assets must be an array of normalized project-relative paths.');
  } else {
    for (let index = 0; index < root.assets.length; index++) {
      const assetPath = root.assets[index];
      const path = pointer('/assets', index);
      if (!validRelativePath(assetPath)) {
        add(diagnostics, path, 'invalid_asset_path', 'Asset paths must be normalized project-relative paths using forward slashes.');
      } else if (assetPaths.indexOf(assetPath) >= 0) {
        add(diagnostics, path, 'duplicate_asset', 'Asset paths must be unique.');
      } else {
        assetPaths.push(assetPath);
      }
    }
  }

  const tilesetIds: string[] = [];
  const tilesets: any[] = [];
  if (!Array.isArray(root.tilesets)) {
    add(diagnostics, '/tilesets', 'invalid_tilesets', 'tilesets must be an array.');
  } else {
    for (let index = 0; index < root.tilesets.length; index++) {
      const tileset = root.tilesets[index];
      const path = pointer('/tilesets', index);
      if (!isObject(tileset)) {
        add(diagnostics, path, 'invalid_tileset', 'Tileset must be an object.');
        continue;
      }
      if (!nonEmptyString(tileset.id)) {
        add(diagnostics, pointer(path, 'id'), 'missing_id', 'Tileset ID must be a non-empty string.');
      } else if (tilesetIds.indexOf(tileset.id) >= 0) {
        add(diagnostics, pointer(path, 'id'), 'duplicate_id', 'Tileset IDs must be unique.');
      } else {
        tilesetIds.push(tileset.id);
        tilesets.push(tileset);
      }
      if (!validRelativePath(tileset.image)) {
        add(diagnostics, pointer(path, 'image'), 'invalid_asset_path', 'Tileset image must be a normalized project-relative asset path.');
      } else if (assetPaths.indexOf(tileset.image) < 0) {
        add(diagnostics, pointer(path, 'image'), 'missing_asset', 'Tileset image must be listed in assets.');
      }
      if (!integer(tileset.tileWidth) || tileset.tileWidth <= 0) add(diagnostics, pointer(path, 'tileWidth'), 'invalid_dimensions', 'tileWidth must be a positive integer.');
      if (!integer(tileset.tileHeight) || tileset.tileHeight <= 0) add(diagnostics, pointer(path, 'tileHeight'), 'invalid_dimensions', 'tileHeight must be a positive integer.');
      if (!integer(tileset.columns) || tileset.columns <= 0) add(diagnostics, pointer(path, 'columns'), 'invalid_dimensions', 'columns must be a positive integer.');
      if (!integer(tileset.tileCount) || tileset.tileCount <= 0) add(diagnostics, pointer(path, 'tileCount'), 'invalid_dimensions', 'tileCount must be a positive integer.');
      if (!nonNegativeIntegerVector2(tileset.margin)) add(diagnostics, pointer(path, 'margin'), 'invalid_dimensions', 'margin must contain non-negative integer x and y values.');
      if (!nonNegativeIntegerVector2(tileset.spacing)) add(diagnostics, pointer(path, 'spacing'), 'invalid_dimensions', 'spacing must contain non-negative integer x and y values.');
      if (!Array.isArray(tileset.tiles)) {
        add(diagnostics, pointer(path, 'tiles'), 'invalid_tiles', 'tiles must be an array.');
      } else {
        const tileIds: number[] = [];
        for (let tileIndex = 0; tileIndex < tileset.tiles.length; tileIndex++) {
          const tile = tileset.tiles[tileIndex];
          const tilePath = pointer(pointer(path, 'tiles'), tileIndex);
          if (!isObject(tile)) {
            add(diagnostics, tilePath, 'invalid_tile', 'Tile definition must be an object.');
            continue;
          }
          if (!integer(tile.tileId) || tile.tileId < 0 || tile.tileId >= tileset.tileCount) {
            add(diagnostics, pointer(tilePath, 'tileId'), 'tile_id_out_of_range', 'tileId must be a zero-based ID in the tileset.');
          } else if (tileIds.indexOf(tile.tileId) >= 0) {
            add(diagnostics, pointer(tilePath, 'tileId'), 'duplicate_tile_id', 'Tileset tile IDs must be unique.');
          } else {
            tileIds.push(tile.tileId);
          }
          if (tile.collision !== undefined) {
            const max = finite(tileset.tileWidth) && finite(tileset.tileHeight)
              ? { x: tileset.tileWidth, y: tileset.tileHeight }
              : null;
            validateRect(pointer(tilePath, 'collision'), tile.collision, diagnostics, max);
          }
          validateProperties(pointer(tilePath, 'properties'), tile.properties, diagnostics, assetPaths);
        }
      }
    }
    try {
      createWorld2DTileCodebook(root.tilesets);
    } catch (error) {
      const item = error !== null && typeof error === 'object' ? (error as any).diagnostic : null;
      if (item !== null && typeof item === 'object') add(diagnostics, item.path || '/tilesets', item.code || 'invalid_tileset_range', item.message || 'Tileset ranges are invalid.');
      else add(diagnostics, '/tilesets', 'invalid_tileset_range', 'Tileset ranges exceed the safe tile-code limit.');
    }
  }

  const layerIds: string[] = [];
  const objectIds: string[] = [];
  if (!Array.isArray(root.layers)) {
    add(diagnostics, '/layers', 'invalid_layers', 'layers must be an array.');
  } else {
    for (let layerIndex = 0; layerIndex < root.layers.length; layerIndex++) {
      const layer = root.layers[layerIndex];
      const path = pointer('/layers', layerIndex);
      if (!isObject(layer)) {
        add(diagnostics, path, 'invalid_layer', 'Layer must be an object.');
        continue;
      }
      validateLayerBase(path, layer, diagnostics, assetPaths);
      if (nonEmptyString(layer.id)) {
        if (layerIds.indexOf(layer.id) >= 0) add(diagnostics, pointer(path, 'id'), 'duplicate_id', 'Layer IDs must be unique.');
        else layerIds.push(layer.id);
      }
      if (layer.type === 'tilemap') {
        if (!integer(layer.width) || layer.width <= 0) add(diagnostics, pointer(path, 'width'), 'invalid_dimensions', 'Tile layer width must be a positive integer.');
        if (!integer(layer.height) || layer.height <= 0) add(diagnostics, pointer(path, 'height'), 'invalid_dimensions', 'Tile layer height must be a positive integer.');
        if (!positiveVector2(layer.tileSize)) add(diagnostics, pointer(path, 'tileSize'), 'invalid_dimensions', 'tileSize must contain positive finite x and y values.');
        if (!Array.isArray(layer.data)) {
          add(diagnostics, pointer(path, 'data'), 'invalid_tile_data', 'Tile layer data must be an array.');
        } else if (integer(layer.width) && integer(layer.height) && layer.width > 0 && layer.height > 0) {
          if (layer.width > Math.floor(1000000 / layer.height)) {
            add(diagnostics, pointer(path, 'data'), 'tile_grid_too_large', 'Tile layer exceeds the supported cell limit.');
          } else if (layer.data.length !== layer.width * layer.height) {
            add(diagnostics, pointer(path, 'data'), 'tile_layer_length', 'Tile layer data length must equal width multiplied by height.');
          }
        }
        if (Array.isArray(layer.data)) {
          for (let cellIndex = 0; cellIndex < layer.data.length; cellIndex++) {
            const cell = layer.data[cellIndex];
            if (cell === null) continue;
            const cellPath = pointer(pointer(path, 'data'), cellIndex);
            if (!isObject(cell)) {
              add(diagnostics, cellPath, 'invalid_tile_cell', 'Tile cells must be null or a WorldTileCell object.');
              continue;
            }
            const setIndex = tilesetIds.indexOf(cell.tilesetId);
            if (setIndex < 0) {
              add(diagnostics, pointer(cellPath, 'tilesetId'), 'unknown_tileset', 'Tile cell refers to an unknown tileset.');
            } else {
              const tileset = tilesets[setIndex];
              if (!integer(cell.tileId) || cell.tileId < 0 || cell.tileId >= tileset.tileCount) {
                add(diagnostics, pointer(cellPath, 'tileId'), 'tile_id_out_of_range', 'Tile cell tileId must be a zero-based ID in its tileset.');
              }
              if (positiveVector2(layer.tileSize) && finite(tileset.tileWidth) && finite(tileset.tileHeight) &&
                  (layer.tileSize.x !== tileset.tileWidth || layer.tileSize.y !== tileset.tileHeight)) {
                add(diagnostics, pointer(cellPath, 'tilesetId'), 'tile_size_mismatch', 'Tile layer tileSize must match each referenced tileset.');
              }
            }
            for (const flipKey of ['flipX', 'flipY', 'flipDiagonal']) {
              if (typeof cell[flipKey] !== 'boolean') {
                add(diagnostics, pointer(cellPath, flipKey), 'invalid_flip', 'Tile cells require explicit boolean flip fields.');
              }
            }
          }
        }
      } else if (layer.type === 'objects') {
        if (!Array.isArray(layer.objects)) {
          add(diagnostics, pointer(path, 'objects'), 'invalid_objects', 'Object layers require an objects array.');
          continue;
        }
        for (let objectIndex = 0; objectIndex < layer.objects.length; objectIndex++) {
          const object = layer.objects[objectIndex];
          const objectPath = pointer(pointer(path, 'objects'), objectIndex);
          if (!isObject(object)) {
            add(diagnostics, objectPath, 'invalid_object', 'Object must be an object.');
            continue;
          }
          if (!nonEmptyString(object.id)) {
            add(diagnostics, pointer(objectPath, 'id'), 'missing_id', 'Object ID must be a non-empty string.');
          } else if (objectIds.indexOf(object.id) >= 0) {
            add(diagnostics, pointer(objectPath, 'id'), 'duplicate_id', 'Object IDs must be unique across object layers.');
          } else {
            objectIds.push(object.id);
          }
          if (typeof object.name !== 'string') add(diagnostics, pointer(objectPath, 'name'), 'invalid_name', 'Object name must be a string.');
          if (typeof object.type !== 'string') add(diagnostics, pointer(objectPath, 'type'), 'invalid_object_type', 'Object type must be a string.');
          if (!vector2(object.position)) add(diagnostics, pointer(objectPath, 'position'), 'invalid_vector', 'Object position must contain finite x and y values.');
          if (!finite(object.rotation)) add(diagnostics, pointer(objectPath, 'rotation'), 'non_finite_number', 'Object rotation must be finite degrees.');
          if (!vector2(object.size) || object.size.x < 0 || object.size.y < 0) add(diagnostics, pointer(objectPath, 'size'), 'invalid_size', 'Object size must contain non-negative finite dimensions.');
          if (!vector2(object.origin) || object.origin.x < 0 || object.origin.x > 1 || object.origin.y < 0 || object.origin.y > 1) {
            add(diagnostics, pointer(objectPath, 'origin'), 'invalid_origin', 'Object origin must be normalized between 0 and 1.');
          }
          if (typeof object.visible !== 'boolean') add(diagnostics, pointer(objectPath, 'visible'), 'invalid_visibility', 'Object visibility must be a boolean.');
          if (!Array.isArray(object.tags)) {
            add(diagnostics, pointer(objectPath, 'tags'), 'invalid_tags', 'Object tags must be an array of strings.');
          } else {
            for (let tagIndex = 0; tagIndex < object.tags.length; tagIndex++) {
              if (typeof object.tags[tagIndex] !== 'string') add(diagnostics, pointer(pointer(objectPath, 'tags'), tagIndex), 'invalid_tag', 'Object tags must be strings.');
            }
          }
          validateProperties(pointer(objectPath, 'properties'), object.properties, diagnostics, assetPaths);
          if (!Array.isArray(object.components)) {
            add(diagnostics, pointer(objectPath, 'components'), 'invalid_components', 'Object components must be an array.');
          } else {
            for (let componentIndex = 0; componentIndex < object.components.length; componentIndex++) {
              const component = object.components[componentIndex];
              const componentPath = pointer(pointer(objectPath, 'components'), componentIndex);
              if (!isObject(component) || !nonEmptyString(component.kind)) {
                add(diagnostics, componentPath, 'invalid_component', 'Component descriptors require a non-empty kind.');
                continue;
              }
              if (!isObject(component.data)) {
                add(diagnostics, pointer(componentPath, 'data'), 'invalid_component_data', 'Component data must be a JSON object.');
                continue;
              }
              validateJson(pointer(componentPath, 'data'), component.data, diagnostics, 0);
              if (BUILTIN_WORLD2D_COMPONENT_KINDS.indexOf(component.kind as any) >= 0) {
                validateBuiltinComponent(componentPath, component, tilesetIds, tilesets, diagnostics);
              }
            }
          }
        }
      } else {
        add(diagnostics, pointer(path, 'type'), 'unsupported_layer_type', 'Layer type must be tilemap or objects.');
      }
    }
  }

  if (!isObject(root.metadata)) {
    add(diagnostics, '/metadata', 'invalid_metadata', 'metadata must be a JSON object.');
  } else {
    validateJson('/metadata', root.metadata, diagnostics, 0);
  }
}

/** Returns all schema diagnostics using JSON Pointer paths; never throws for invalid input. */
export function validateNormalizedWorld2D(input: unknown): World2DValidationResult {
  const diagnostics: World2DDiagnostic[] = [];
  try {
    validateWorldBody(input as any, diagnostics);
  } catch (_error) {
    add(diagnostics, '', 'invalid_document', 'World2D document could not be inspected safely.');
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function formatWorld2DDiagnostics(diagnostics: World2DDiagnostic[]): string {
  let output = '';
  for (let index = 0; index < diagnostics.length; index++) {
    const item = diagnostics[index];
    if (index > 0) output = output + '\n';
    output = output + (item.path.length === 0 ? '/' : item.path) + ' [' + item.code + ']: ' + item.message;
  }
  return output;
}
