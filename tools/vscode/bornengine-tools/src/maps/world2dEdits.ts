import type {
  World2DComponentDescriptor,
  World2DDocument,
  World2DJsonValue,
  World2DLayer,
  World2DLayerBase,
  World2DObjectData,
  World2DObjectLayer,
  World2DPropertyData,
  World2DTileCell,
  World2DTileLayer,
  World2DTilesetData,
  World2DVector,
} from '@bornengine/engine/world2d/editor';

type ObjectUpdates = Partial<Pick<World2DObjectData, 'name' | 'type' | 'visible' | 'tags' | 'properties' | 'components'>>;
const MAX_TILE_LAYER_CELLS = 1_000_000;
type LayerUpdates = Partial<Pick<World2DLayerBase, 'name' | 'visible' | 'opacity' | 'offset' | 'parallax'>> & {
  width?: number;
  height?: number;
  tileSize?: World2DVector;
};

export type World2DEditOperation =
  | { type: 'paintTiles'; layerId: string; tiles: Array<{ x: number; y: number; cell: World2DTileCell }> }
  | { type: 'paintTile'; layerId: string; x: number; y: number; cell: World2DTileCell }
  | { type: 'fillTiles'; layerId: string; x: number; y: number; cell: World2DTileCell }
  | { type: 'eraseTile'; layerId: string; x: number; y: number }
  | { type: 'addLayer'; layer: World2DLayer; index?: number }
  | { type: 'resizeTileLayer'; layerId: string; width: number; height: number }
  | { type: 'updateLayer'; layerId: string; updates: LayerUpdates }
  | { type: 'reorderLayer'; layerId: string; toIndex: number }
  | { type: 'addTileset'; tileset: World2DTilesetData }
  | { type: 'setMainTileset'; tilesetId: string }
  | { type: 'placeObject'; layerId: string; object: World2DObjectData }
  | { type: 'removeObject'; layerId: string; objectId: string }
  | { type: 'transformObject'; layerId: string; objectId: string; transform: Partial<{
      position: World2DVector;
      rotation: number;
      size: World2DVector;
      origin: World2DVector;
    }> }
  | { type: 'updateObject'; layerId: string; objectId: string; updates: ObjectUpdates }
  | { type: 'setObjectProperty'; layerId: string; objectId: string; propertyName: string; value: World2DPropertyData | null }
  | { type: 'setObjectComponent'; layerId: string; objectId: string; kind: string; data: Record<string, World2DJsonValue> | null };

function fail(message: string): never {
  throw new Error(message);
}

function layerIndex(document: World2DDocument, layerId: string): number {
  const index = document.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) fail(`World2D layer "${layerId}" was not found.`);
  return index;
}

function tileLayer(document: World2DDocument, layerId: string): { layer: World2DTileLayer; index: number } {
  const index = layerIndex(document, layerId);
  const layer = document.layers[index];
  if (!layer || layer.type !== 'tilemap') fail(`World2D layer "${layerId}" is not a tile layer.`);
  return { layer, index };
}

function objectLayer(document: World2DDocument, layerId: string): { layer: World2DObjectLayer; index: number } {
  const index = layerIndex(document, layerId);
  const layer = document.layers[index];
  if (!layer || layer.type !== 'objects') fail(`World2D layer "${layerId}" is not an object layer.`);
  return { layer, index };
}

function replaceLayer(document: World2DDocument, index: number, layer: World2DLayer): World2DDocument {
  const layers = document.layers.slice();
  layers[index] = layer;
  return { ...document, layers };
}

function cloneObject(object: World2DObjectData): World2DObjectData {
  return {
    ...object,
    position: { ...object.position },
    size: { ...object.size },
    origin: { ...object.origin },
    tags: [...object.tags],
    properties: { ...object.properties },
    components: object.components.map((component) => ({ ...component, data: { ...component.data } })),
  };
}

function replaceObject(
  document: World2DDocument,
  layerId: string,
  objectId: string,
  update: (object: World2DObjectData) => World2DObjectData,
): World2DDocument {
  const { layer, index } = objectLayer(document, layerId);
  const objectIndex = layer.objects.findIndex((object) => object.id === objectId);
  if (objectIndex < 0) fail(`World2D object "${objectId}" was not found in layer "${layerId}".`);
  const objects = layer.objects.slice();
  const current = objects[objectIndex];
  if (!current) fail(`World2D object "${objectId}" was not found in layer "${layerId}".`);
  objects[objectIndex] = update(current);
  return replaceLayer(document, index, { ...layer, objects });
}

function assertVector(value: World2DVector, label: string, positive = false): void {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) fail(`${label} must contain finite x and y values.`);
  if (positive && (value.x <= 0 || value.y <= 0)) fail(`${label} must contain positive x and y values.`);
}

function resizedTileLayer(layer: World2DTileLayer, width: number, height: number): World2DTileLayer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail('Tile layer dimensions must be positive integers.');
  }
  if (width * height > MAX_TILE_LAYER_CELLS) {
    fail(`Tile layer dimensions cannot exceed the maximum of ${MAX_TILE_LAYER_CELLS.toLocaleString()} cells.`);
  }
  const data: Array<World2DTileCell | null> = Array(width * height).fill(null);
  const copyWidth = Math.min(layer.width, width);
  const copyHeight = Math.min(layer.height, height);
  for (let y = 0; y < copyHeight; y++) {
    for (let x = 0; x < copyWidth; x++) data[y * width + x] = layer.data[y * layer.width + x] ?? null;
  }
  return { ...layer, width, height, data };
}

function assertNormalizedAssetPath(value: string): boolean {
  if (!value || value !== value.trim() || value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function assertProperty(value: World2DPropertyData, assets: string[]): void {
  if (!value || typeof value !== 'object') fail('World2D object properties require a type and value.');
  const valid = value.type === 'string' || value.type === 'file' || value.type === 'color'
    ? typeof value.value === 'string'
    : value.type === 'int'
      ? Number.isInteger(value.value)
      : value.type === 'float'
        ? typeof value.value === 'number' && Number.isFinite(value.value)
        : value.type === 'bool'
          ? typeof value.value === 'boolean'
          : false;
  if (!valid) fail(`World2D property type "${String(value.type)}" has an invalid value.`);
  if (value.type === 'color' && !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value.value as string)) {
    fail('Color properties must use #RRGGBB or #AARRGGBB.');
  }
  if (value.type === 'file') {
    const assetPath = value.value as string;
    if (!assertNormalizedAssetPath(assetPath) || !assets.includes(assetPath)) {
      fail('File properties must refer to a normalized project-relative asset listed in the document.');
    }
  }
}

function cloneTileset(tileset: World2DTilesetData): World2DTilesetData {
  return {
    ...tileset,
    margin: { ...tileset.margin },
    spacing: { ...tileset.spacing },
    tiles: tileset.tiles.map((tile) => ({
      ...tile,
      collision: tile.collision ? { ...tile.collision } : undefined,
      properties: { ...tile.properties },
    })),
  };
}

function checkedTileCell(document: World2DDocument, layer: World2DTileLayer, cell: World2DTileCell): World2DTileCell {
  const tileset = document.tilesets.find((candidate) => candidate.id === cell.tilesetId);
  if (!tileset) fail(`Tileset "${cell.tilesetId}" was not found.`);
  if (!Number.isInteger(cell.tileId) || cell.tileId < 0 || cell.tileId >= tileset.tileCount) {
    fail('Tile ID is outside the referenced tileset bounds.');
  }
  if (layer.tileSize.x !== tileset.tileWidth || layer.tileSize.y !== tileset.tileHeight) {
    fail('Tile layer cell size must match the referenced tileset.');
  }
  if (typeof cell.flipX !== 'boolean' || typeof cell.flipY !== 'boolean' || typeof cell.flipDiagonal !== 'boolean') {
    fail('Tile cell flip fields must be booleans.');
  }
  return { ...cell };
}

function sameTile(left: World2DTileCell | null | undefined, right: World2DTileCell | null): boolean {
  if (!left || !right) return left == null && right == null;
  return left.tilesetId === right.tilesetId && left.tileId === right.tileId &&
    left.flipX === right.flipX && left.flipY === right.flipY && left.flipDiagonal === right.flipDiagonal;
}

function fillTileRegion(
  document: World2DDocument,
  layer: World2DTileLayer,
  x: number,
  y: number,
  replacement: World2DTileCell,
): World2DTileLayer {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= layer.width || y >= layer.height) {
    fail('Tile coordinates are outside the layer bounds.');
  }
  const seedIndex = y * layer.width + x;
  const source = layer.data[seedIndex] ?? null;
  if (sameTile(source, replacement)) return layer;

  const visited = new Uint8Array(layer.width * layer.height);
  const queue = [seedIndex];
  visited[seedIndex] = 1;
  const data = layer.data.slice();
  const visitNeighbor = (neighbor: number): void => {
    if (neighbor < 0 || visited[neighbor]) return;
    visited[neighbor] = 1;
    if (sameTile(layer.data[neighbor], source)) queue.push(neighbor);
  };
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    if (index === undefined) continue;
    data[index] = { ...replacement };
    const cellX = index % layer.width;
    const cellY = Math.floor(index / layer.width);
    visitNeighbor(cellX > 0 ? index - 1 : -1);
    visitNeighbor(cellX + 1 < layer.width ? index + 1 : -1);
    visitNeighbor(cellY > 0 ? index - layer.width : -1);
    visitNeighbor(cellY + 1 < layer.height ? index + layer.width : -1);
  }
  return { ...layer, data };
}

export function applyWorld2DEdit(document: World2DDocument, operation: World2DEditOperation): World2DDocument {
  switch (operation.type) {
    case 'paintTiles': {
      const { layer, index } = tileLayer(document, operation.layerId);
      if (!Array.isArray(operation.tiles)) fail('Bulk tile paint requires a list of tile placements.');

      const placements = new Map<number, World2DTileCell>();
      for (const tile of operation.tiles) {
        if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) ||
            tile.x < 0 || tile.y < 0 || tile.x >= layer.width || tile.y >= layer.height) {
          fail('Tile coordinates are outside the layer bounds.');
        }
        placements.set(tile.y * layer.width + tile.x, checkedTileCell(document, layer, tile.cell));
      }

      const changed = [...placements].filter(([cellIndex, cell]) => !sameTile(layer.data[cellIndex], cell));
      if (changed.length === 0) return document;
      const data = layer.data.slice();
      for (const [cellIndex, cell] of changed) data[cellIndex] = cell;
      return replaceLayer(document, index, { ...layer, data });
    }

    case 'paintTile':
    case 'eraseTile': {
      const { layer, index } = tileLayer(document, operation.layerId);
      if (!Number.isInteger(operation.x) || !Number.isInteger(operation.y) ||
          operation.x < 0 || operation.y < 0 || operation.x >= layer.width || operation.y >= layer.height) {
        fail('Tile coordinates are outside the layer bounds.');
      }
      const cellIndex = operation.y * layer.width + operation.x;
      let cell: World2DTileCell | null = null;
      if (operation.type === 'paintTile') {
        cell = checkedTileCell(document, layer, operation.cell);
      }
      const data = layer.data.slice();
      data[cellIndex] = cell;
      return replaceLayer(document, index, { ...layer, data });
    }

    case 'fillTiles': {
      const { layer, index } = tileLayer(document, operation.layerId);
      const replacement = checkedTileCell(document, layer, operation.cell);
      const filled = fillTileRegion(document, layer, operation.x, operation.y, replacement);
      if (filled === layer) return document;
      return replaceLayer(document, index, filled);
    }

    case 'addLayer': {
      if (document.layers.some((layer) => layer.id === operation.layer.id)) fail(`World2D layer ID "${operation.layer.id}" already exists.`);
      const index = operation.index ?? document.layers.length;
      if (!Number.isInteger(index) || index < 0 || index > document.layers.length) fail('Layer insertion index is outside the valid range.');
      const layers = document.layers.slice();
      layers.splice(index, 0, operation.layer);
      return { ...document, layers };
    }

    case 'resizeTileLayer': {
      const { layer, index } = tileLayer(document, operation.layerId);
      return replaceLayer(document, index, resizedTileLayer(layer, operation.width, operation.height));
    }

    case 'updateLayer': {
      const index = layerIndex(document, operation.layerId);
      const layer = document.layers[index];
      if (!layer) fail(`World2D layer "${operation.layerId}" was not found.`);
      const updates = operation.updates;
      if (updates.name !== undefined && typeof updates.name !== 'string') fail('Layer name must be a string.');
      if (updates.visible !== undefined && typeof updates.visible !== 'boolean') fail('Layer visibility must be a boolean.');
      if (updates.opacity !== undefined && (!Number.isFinite(updates.opacity) || updates.opacity < 0 || updates.opacity > 1)) {
        fail('Layer opacity must be finite and between 0 and 1.');
      }
      if (updates.offset) assertVector(updates.offset, 'Layer offset');
      if (updates.parallax) assertVector(updates.parallax, 'Layer parallax');

      const common = {
        ...(updates.name === undefined ? {} : { name: updates.name }),
        ...(updates.visible === undefined ? {} : { visible: updates.visible }),
        ...(updates.opacity === undefined ? {} : { opacity: updates.opacity }),
        ...(updates.offset === undefined ? {} : { offset: { ...layer.offset, ...updates.offset } }),
        ...(updates.parallax === undefined ? {} : { parallax: { ...layer.parallax, ...updates.parallax } }),
      };
      if (layer.type === 'tilemap') {
        if (updates.tileSize) assertVector(updates.tileSize, 'Tile size', true);
        const width = updates.width ?? layer.width;
        const height = updates.height ?? layer.height;
        const resized = updates.width === undefined && updates.height === undefined
          ? layer
          : resizedTileLayer(layer, width, height);
        return replaceLayer(document, index, {
          ...resized,
          ...common,
          ...(updates.tileSize === undefined ? {} : { tileSize: { ...layer.tileSize, ...updates.tileSize } }),
        });
      }
      if (updates.width !== undefined || updates.height !== undefined || updates.tileSize !== undefined) {
        fail('Grid dimensions and tile size can only be changed on tile layers.');
      }
      return replaceLayer(document, index, { ...layer, ...common });
    }

    case 'reorderLayer': {
      const fromIndex = layerIndex(document, operation.layerId);
      if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= document.layers.length) {
        fail('Layer destination index is outside the valid range.');
      }
      const layers = document.layers.slice();
      const [layer] = layers.splice(fromIndex, 1);
      if (!layer) fail('World2D layer could not be reordered.');
      layers.splice(operation.toIndex, 0, layer);
      return { ...document, layers };
    }

    case 'addTileset': {
      if (document.tilesets.some((tileset) => tileset.id === operation.tileset.id)) fail(`Tileset ID "${operation.tileset.id}" already exists.`);
      const tilesets = [...document.tilesets, cloneTileset(operation.tileset)];
      const assets = document.assets.includes(operation.tileset.image)
        ? document.assets
        : [...document.assets, operation.tileset.image];
      return { ...document, assets, tilesets };
    }

    case 'setMainTileset': {
      const currentIndex = document.tilesets.findIndex((tileset) => tileset.id === operation.tilesetId);
      if (currentIndex < 0) fail(`Tileset "${operation.tilesetId}" was not found.`);
      if (currentIndex === 0) return document;
      const tilesets = document.tilesets.slice();
      const [primary] = tilesets.splice(currentIndex, 1);
      if (!primary) fail(`Tileset "${operation.tilesetId}" could not be selected as the main source.`);
      tilesets.unshift(primary);
      return { ...document, tilesets };
    }

    case 'placeObject': {
      const { layer, index } = objectLayer(document, operation.layerId);
      const duplicate = document.layers.some((candidate) => candidate.type === 'objects' &&
        candidate.objects.some((object) => object.id === operation.object.id));
      if (duplicate) fail(`World2D object ID "${operation.object.id}" already exists.`);
      const objects = [...layer.objects, cloneObject(operation.object)];
      return replaceLayer(document, index, { ...layer, objects });
    }

    case 'removeObject': {
      const { layer, index } = objectLayer(document, operation.layerId);
      if (!layer.objects.some((object) => object.id === operation.objectId)) fail(`World2D object "${operation.objectId}" was not found in layer "${operation.layerId}".`);
      const objects = layer.objects.filter((object) => object.id !== operation.objectId);
      return replaceLayer(document, index, { ...layer, objects });
    }

    case 'transformObject':
      return replaceObject(document, operation.layerId, operation.objectId, (object) => {
        const transform = operation.transform;
        if (transform.position) assertVector(transform.position, 'Object position');
        if (transform.size) assertVector(transform.size, 'Object size');
        if (transform.size && (transform.size.x < 0 || transform.size.y < 0)) fail('Object size cannot be negative.');
        if (transform.origin && (!Number.isFinite(transform.origin.x) || !Number.isFinite(transform.origin.y) ||
            transform.origin.x < 0 || transform.origin.x > 1 || transform.origin.y < 0 || transform.origin.y > 1)) {
          fail('Object origin must be normalized between 0 and 1.');
        }
        if (transform.rotation !== undefined && !Number.isFinite(transform.rotation)) fail('Object rotation must be finite.');
        return {
          ...object,
          ...transform,
          position: transform.position ? { ...object.position, ...transform.position } : object.position,
          size: transform.size ? { ...object.size, ...transform.size } : object.size,
          origin: transform.origin ? { ...object.origin, ...transform.origin } : object.origin,
        };
      });

    case 'updateObject':
      return replaceObject(document, operation.layerId, operation.objectId, (object) => {
        const updates = operation.updates;
        if (updates.name !== undefined && typeof updates.name !== 'string') fail('Object name must be a string.');
        if (updates.type !== undefined && typeof updates.type !== 'string') fail('Object type must be a string.');
        if (updates.visible !== undefined && typeof updates.visible !== 'boolean') fail('Object visibility must be a boolean.');
        if (updates.tags && !updates.tags.every((tag) => typeof tag === 'string')) fail('Object tags must be strings.');
        if (updates.properties) {
          for (const property of Object.values(updates.properties)) assertProperty(property, document.assets);
        }
        const components = updates.components?.map((component) => ({ ...component, data: { ...component.data } }));
        return {
          ...object,
          ...updates,
          tags: updates.tags ? [...updates.tags] : object.tags,
          properties: updates.properties ? { ...updates.properties } : object.properties,
          components: components ?? object.components,
        };
      });

    case 'setObjectProperty':
      return replaceObject(document, operation.layerId, operation.objectId, (object) => {
        if (!operation.propertyName) fail('Object property name must not be empty.');
        const properties = { ...object.properties };
        if (operation.value === null) delete properties[operation.propertyName];
        else {
          assertProperty(operation.value, document.assets);
          properties[operation.propertyName] = { ...properties[operation.propertyName], ...operation.value };
        }
        return { ...object, properties };
      });

    case 'setObjectComponent':
      return replaceObject(document, operation.layerId, operation.objectId, (object) => {
        if (!operation.kind) fail('World2D component kind must not be empty.');
        const componentIndex = object.components.findIndex((component) => component.kind === operation.kind);
        const components = object.components.slice();
        if (operation.data === null) {
          if (componentIndex < 0) fail(`Object component "${operation.kind}" was not found.`);
          components.splice(componentIndex, 1);
        } else {
          const data = operation.data;
          const existing = componentIndex >= 0 ? components[componentIndex] : null;
          const next: World2DComponentDescriptor = {
            ...(existing ?? {}),
            kind: operation.kind,
            data: { ...(existing?.data ?? {}), ...data } as World2DComponentDescriptor['data'],
          };
          if (componentIndex >= 0) components[componentIndex] = next;
          else components.push(next);
        }
        return { ...object, components };
      });

    default: {
      const exhaustive: never = operation;
      return fail(`Unsupported World2D edit operation: ${String((exhaustive as { type?: unknown }).type)}.`);
    }
  }
}
