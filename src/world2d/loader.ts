import { GameComponent } from '../game/game-component';
import { GameObject } from '../game/game-object';
import type { GameScene } from '../game/game-scene';
import { PhysicsBody2D } from '../physics2d/physics-body-2d';
import type { PhysicsWorld2D } from '../physics2d/physics-world-2d';
import { SpriteRenderer } from '../sprites/sprite-renderer';
import type { SpriteFrame } from '../sprites/sprite-sheet';
import { Tilemap } from '../tilemap/tilemap';
import { migrateWorld2D } from './migrate';
import type {
  World2DComponentDescriptor,
  World2DDocument,
  World2DDiagnostic,
  World2DJsonValue,
  World2DLayer,
  World2DLoadInstance,
  World2DLoadResult,
  World2DObjectData,
  World2DPhysicsBodyData,
  World2DSpriteRendererData,
  World2DTileDefinition,
  World2DTileLayer,
  World2DTilesetData,
} from './types';

export interface World2DComponentFactoryContext {
  readonly document: World2DDocument;
  readonly documentRoot: string;
  readonly scene: GameScene;
  readonly layer: World2DLayer;
  readonly object: World2DObjectData;
  resolveAssetPath(path: string): string | null;
}

export type World2DComponentFactory = (
  data: Record<string, World2DJsonValue>,
  context: World2DComponentFactoryContext,
) => GameComponent | World2DDiagnostic;

export interface World2DLoaderOptions {
  /** Root directory used to resolve normalized project-relative asset paths. */
  documentRoot?: string;
  /** Resolves an atlas tile into a loaded, Game-owned frame. */
  resolveSpriteFrame?: (tileset: World2DTilesetData, tileId: number, resolvedImagePath: string) => SpriteFrame | null;
  /** Required when a physicsBody2D descriptor is present. */
  physicsWorld2D?: PhysicsWorld2D | null;
}

interface ResolvedFrame {
  tilesetId: string;
  tileId: number;
  frame: SpriteFrame;
}

interface FrameResolution {
  frames: ResolvedFrame[];
  diagnostics: World2DDiagnostic[];
}

function diagnostic(path: string, code: string, message: string): World2DDiagnostic {
  return { path, code, message };
}

function isDiagnostic(value: any): value is World2DDiagnostic {
  return (
    value !== null && typeof value === 'object' && typeof value.code === 'string' && typeof value.message === 'string'
  );
}

function isBuiltin(kind: string): boolean {
  if (kind === 'spriteRenderer') return true;
  if (kind === 'physicsBody2D') return true;
  return false;
}

function findTileset(document: World2DDocument, id: string): World2DTilesetData | null {
  for (let index = 0; index < document.tilesets.length; index++) {
    if (document.tilesets[index].id === id) return document.tilesets[index];
  }
  return null;
}

function findTile(tileset: World2DTilesetData, tileId: number): World2DTileDefinition | null {
  for (let index = 0; index < tileset.tiles.length; index++) {
    if (tileset.tiles[index].tileId === tileId) return tileset.tiles[index];
  }
  return null;
}

function pathJoin(root: string, relative: string): string {
  if (root.length === 0) return relative;
  let prefix = root;
  while (prefix.length > 1 && prefix.charAt(prefix.length - 1) === '/') {
    prefix = prefix.slice(0, prefix.length - 1);
  }
  return prefix + (prefix.charAt(prefix.length - 1) === '/' ? '' : '/') + relative;
}

function findFrame(frames: ResolvedFrame[], tilesetId: string, tileId: number): SpriteFrame | null {
  for (let index = 0; index < frames.length; index++) {
    if (frames[index].tilesetId === tilesetId && frames[index].tileId === tileId) return frames[index].frame;
  }
  return null;
}

function appendFrame(
  document: World2DDocument,
  options: World2DLoaderOptions,
  documentRoot: string,
  frames: ResolvedFrame[],
  diagnostics: World2DDiagnostic[],
  tilesetId: string,
  tileId: number,
  path: string,
): void {
  if (findFrame(frames, tilesetId, tileId) !== null) return;
  const tileset = findTileset(document, tilesetId);
  if (tileset === null) return;
  if (options.resolveSpriteFrame === undefined) {
    diagnostics.push(
      diagnostic(path, 'asset_resolver_missing', 'Loading this descriptor requires a sprite-frame resolver.'),
    );
    return;
  }
  try {
    const frame = options.resolveSpriteFrame(tileset, tileId, pathJoin(documentRoot, tileset.image));
    if (frame === null || frame === undefined) {
      diagnostics.push(
        diagnostic(path, 'sprite_frame_missing', 'The sprite-frame resolver could not resolve this tile.'),
      );
      return;
    }
    if (frame.sheet === null || frame.sheet === undefined || frame.sheet.error !== null) {
      diagnostics.push(diagnostic(path, 'sprite_frame_invalid', 'Resolved sprite frame belongs to an invalid sheet.'));
      return;
    }
    frames.push({ tilesetId, tileId, frame });
  } catch (_error) {
    diagnostics.push(diagnostic(path, 'asset_resolution_failed', 'Sprite-frame resolution failed.'));
  }
}

function collectFrames(
  document: World2DDocument,
  scene: GameScene,
  options: World2DLoaderOptions,
  documentRoot: string,
): FrameResolution {
  const frames: ResolvedFrame[] = [];
  const diagnostics: World2DDiagnostic[] = [];
  for (let layerIndex = 0; layerIndex < document.layers.length; layerIndex++) {
    const layer = document.layers[layerIndex];
    const layerPath = '/layers/' + layerIndex;
    if (layer.type === 'tilemap') {
      for (let cellIndex = 0; cellIndex < layer.data.length; cellIndex++) {
        const cell = layer.data[cellIndex];
        if (cell === null) continue;
        const path = layerPath + '/data/' + cellIndex;
        appendFrame(document, options, documentRoot, frames, diagnostics, cell.tilesetId, cell.tileId, path);
      }
    } else {
      for (let objectIndex = 0; objectIndex < layer.objects.length; objectIndex++) {
        const object = layer.objects[objectIndex];
        for (let componentIndex = 0; componentIndex < object.components.length; componentIndex++) {
          const component = object.components[componentIndex];
          const path = layerPath + '/objects/' + objectIndex + '/components/' + componentIndex;
          if (component.kind === 'spriteRenderer') {
            const data = component.data as any as World2DSpriteRendererData;
            appendFrame(document, options, documentRoot, frames, diagnostics, data.tilesetId, data.tileId, path);
          } else if (component.kind === 'physicsBody2D') {
            const world = options.physicsWorld2D;
            if (world === undefined || world === null || !world.isReady) {
              diagnostics.push(
                diagnostic(path, 'physics_world_missing', 'physicsBody2D requires a ready PhysicsWorld2D.'),
              );
            } else if (world.context !== scene.context) {
              diagnostics.push(
                diagnostic(
                  path,
                  'physics_world_mismatch',
                  'PhysicsWorld2D belongs to a different Game than the destination scene.',
                ),
              );
            }
          }
        }
      }
    }
  }
  for (let index = 0; index < frames.length; index++) {
    if (!frames[index].frame.sheet._canAttachTo(scene.context)) {
      diagnostics.push(
        diagnostic(
          '/tilesets/' + frames[index].tilesetId,
          'sprite_frame_game_mismatch',
          'Resolved sprite frame belongs to a different Game.',
        ),
      );
    }
  }
  return { frames, diagnostics };
}

function cloneJsonValue(value: World2DJsonValue): World2DJsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const array: World2DJsonValue[] = [];
    for (let index = 0; index < value.length; index++) array.push(cloneJsonValue(value[index]));
    return array;
  }
  const object: Record<string, World2DJsonValue> = {};
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index++) object[keys[index]] = cloneJsonValue(value[keys[index]]);
  return object;
}

function layerObject(layer: World2DLayer, x: number, y: number, name: string): GameObject {
  return new GameObject({
    name,
    position: { x, y, z: 0 },
    active: layer.visible,
  });
}

function addComponent(
  object: GameObject,
  component: GameComponent,
  path: string,
  diagnostics: World2DDiagnostic[],
): void {
  if (object.addComponent(component) === null) {
    diagnostics.push(diagnostic(path, 'component_attach_failed', 'Component could not be attached to its GameObject.'));
  }
}

function frameForCell(frames: ResolvedFrame[], tilesetId: string, tileId: number): SpriteFrame | null {
  return findFrame(frames, tilesetId, tileId);
}

function uniqueTileIds(layer: World2DTileLayer, tilesetId: string): number[] {
  const tileIds: number[] = [];
  for (let index = 0; index < layer.data.length; index++) {
    const cell = layer.data[index];
    if (cell === null || cell.tilesetId !== tilesetId || tileIds.indexOf(cell.tileId) >= 0) continue;
    tileIds.push(cell.tileId);
  }
  return tileIds;
}

function uniqueTilesetIds(layer: World2DTileLayer): string[] {
  const ids: string[] = [];
  for (let index = 0; index < layer.data.length; index++) {
    const cell = layer.data[index];
    if (cell !== null && ids.indexOf(cell.tilesetId) < 0) ids.push(cell.tilesetId);
  }
  return ids;
}

function cleanup(roots: GameObject[]): void {
  for (let index = roots.length - 1; index >= 0; index--) {
    if (!roots[index].destroyed) roots[index].destroy();
  }
}

export class World2DComponentRegistry {
  private kinds: string[] = [];
  private factories: World2DComponentFactory[] = [];

  /** Registers a namespaced, game-owned component kind. Built-in names are reserved. */
  registerComponentFactory(kind: string, factory: World2DComponentFactory): boolean {
    if (typeof kind !== 'string') return false;
    if (kind.trim().length === 0) return false;
    if (typeof factory !== 'function') return false;
    if (isBuiltin(kind)) return false;
    if (this.kinds.indexOf(kind) >= 0) return false;
    this.kinds.push(kind);
    this.factories.push(factory);
    return true;
  }

  hasComponentFactory(kind: string): boolean {
    return this.kinds.indexOf(kind) >= 0;
  }

  /** @internal Finds a registered game-owned factory without exposing mutable storage. */
  _factory(kind: string): World2DComponentFactory | null {
    const index = this.kinds.indexOf(kind);
    return index < 0 ? null : this.factories[index];
  }
}

export class World2DLoader {
  readonly registry: World2DComponentRegistry;
  readonly options: World2DLoaderOptions;

  constructor(registry: World2DComponentRegistry = new World2DComponentRegistry(), options: World2DLoaderOptions = {}) {
    this.registry = registry;
    this.options = options === null || options === undefined ? {} : options;
  }

  loadJSON(text: string, scene: GameScene, documentRoot = this.options.documentRoot || ''): World2DLoadResult {
    let input: any;
    try {
      input = JSON.parse(text);
    } catch (_error) {
      return {
        ok: false,
        diagnostics: [diagnostic('', 'invalid_json', 'World2D source is not valid JSON.')],
        document: null,
        instances: [],
      };
    }
    return this.load(input, scene, documentRoot);
  }

  load(input: unknown, scene: GameScene, documentRoot = this.options.documentRoot || ''): World2DLoadResult {
    const migrated = migrateWorld2D(input);
    if (!migrated.ok || migrated.document === null) {
      return { ok: false, diagnostics: migrated.diagnostics, document: null, instances: [] };
    }
    const document = migrated.document;
    const missingFactories: World2DDiagnostic[] = [];
    for (let layerIndex = 0; layerIndex < document.layers.length; layerIndex++) {
      const layer = document.layers[layerIndex];
      if (layer.type !== 'objects') continue;
      for (let objectIndex = 0; objectIndex < layer.objects.length; objectIndex++) {
        const object = layer.objects[objectIndex];
        for (let componentIndex = 0; componentIndex < object.components.length; componentIndex++) {
          const component = object.components[componentIndex];
          if (isBuiltin(component.kind) || this.registry.hasComponentFactory(component.kind)) continue;
          missingFactories.push(
            diagnostic(
              '/layers/' + layerIndex + '/objects/' + objectIndex + '/components/' + componentIndex + '/kind',
              'component_factory_missing',
              'No component factory is registered for kind "' + component.kind + '".',
            ),
          );
        }
      }
    }
    if (missingFactories.length > 0) {
      return { ok: false, diagnostics: missingFactories, document: null, instances: [] };
    }

    const frameResolution = collectFrames(document, scene, this.options, documentRoot);
    if (frameResolution.diagnostics.length > 0) {
      return { ok: false, diagnostics: frameResolution.diagnostics, document: null, instances: [] };
    }

    const roots: GameObject[] = [];
    const instances: World2DLoadInstance[] = [];
    const diagnostics: World2DDiagnostic[] = [];
    try {
      for (let layerIndex = 0; layerIndex < document.layers.length; layerIndex++) {
        const layer = document.layers[layerIndex];
        if (layer.type === 'tilemap') {
          this.buildTileLayer(document, layer, layerIndex, frameResolution.frames, roots, instances, diagnostics);
        } else {
          this.buildObjectLayer(
            document,
            layer,
            layerIndex,
            scene,
            documentRoot,
            frameResolution.frames,
            roots,
            instances,
            diagnostics,
          );
        }
        if (diagnostics.length > 0) {
          cleanup(roots);
          return { ok: false, diagnostics, document: null, instances: [] };
        }
      }
    } catch (_error) {
      cleanup(roots);
      return {
        ok: false,
        diagnostics: [diagnostic('', 'construction_failed', 'World2D runtime objects could not be constructed.')],
        document: null,
        instances: [],
      };
    }

    if (!scene._attachSubtreesAtomically(roots)) {
      cleanup(roots);
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            '/layers',
            'scene_attach_failed',
            'World2D objects could not be attached atomically to the destination scene.',
          ),
        ],
        document: null,
        instances: [],
      };
    }
    return { ok: true, diagnostics: [], document, instances };
  }

  private buildTileLayer(
    document: World2DDocument,
    layer: World2DTileLayer,
    layerIndex: number,
    frames: ResolvedFrame[],
    roots: GameObject[],
    instances: World2DLoadInstance[],
    diagnostics: World2DDiagnostic[],
  ): void {
    const tilesetIds = uniqueTilesetIds(layer);
    for (let groupIndex = 0; groupIndex < tilesetIds.length; groupIndex++) {
      const tilesetId = tilesetIds[groupIndex];
      const tileset = findTileset(document, tilesetId);
      if (tileset === null) continue;
      const usedIds = uniqueTileIds(layer, tilesetId);
      const definitions: any[] = [];
      for (let tileIndex = 0; tileIndex < usedIds.length; tileIndex++) {
        const tileId = usedIds[tileIndex];
        const frame = frameForCell(frames, tilesetId, tileId);
        if (frame === null) {
          diagnostics.push(
            diagnostic(
              '/layers/' + layerIndex + '/data',
              'sprite_frame_missing',
              'A tilemap cell has no resolved sprite frame.',
            ),
          );
          return;
        }
        const sourceTile = findTile(tileset, tileId);
        const definition: any = { id: tileId + 1, frame };
        if (sourceTile !== null && sourceTile.collision !== undefined) definition.collision = sourceTile.collision;
        definitions.push(definition);
      }
      if (definitions.length === 0) continue;

      const values: number[] = [];
      const flips: any[] = [];
      for (let cellIndex = 0; cellIndex < layer.data.length; cellIndex++) {
        const source = layer.data[cellIndex];
        if (source === null || source.tilesetId !== tilesetId) {
          values.push(0);
          flips.push(null);
        } else {
          values.push(source.tileId + 1);
          flips.push({ flipX: source.flipX, flipY: source.flipY, flipDiagonal: source.flipDiagonal });
        }
      }
      const sheet = definitions[0].frame.sheet;
      const tilemapOptions: any = {
        columns: layer.width,
        rows: layer.height,
        tileWidth: layer.tileSize.x,
        tileHeight: layer.tileSize.y,
        tiles: definitions,
        data: values,
        cellFlips: flips,
        visible: layer.visible,
        tint: { r: 255, g: 255, b: 255, a: Math.round(layer.opacity * 255) },
      };
      const map = new Tilemap(sheet, tilemapOptions);
      if (map.error !== null) {
        diagnostics.push(diagnostic('/layers/' + layerIndex, 'tilemap_construction_failed', map.error));
        return;
      }
      const object = layerObject(layer, layer.offset.x, layer.offset.y, layer.name + ' (' + tileset.id + ')');
      addComponent(object, map, '/layers/' + layerIndex, diagnostics);
      if (diagnostics.length > 0) {
        object.destroy();
        return;
      }
      roots.push(object);
      instances.push({ sourceId: layer.id, sourceKind: 'tilemap', tilesetId, gameObject: object });
    }
  }

  private buildObjectLayer(
    document: World2DDocument,
    layer: any,
    layerIndex: number,
    scene: GameScene,
    documentRoot: string,
    frames: ResolvedFrame[],
    roots: GameObject[],
    instances: World2DLoadInstance[],
    diagnostics: World2DDiagnostic[],
  ): void {
    for (let objectIndex = 0; objectIndex < layer.objects.length; objectIndex++) {
      const source = layer.objects[objectIndex] as World2DObjectData;
      const objectPath = '/layers/' + layerIndex + '/objects/' + objectIndex;
      const rotationRadians = (source.rotation * Math.PI) / 360;
      const object = new GameObject({
        name: source.name,
        position: {
          x: source.position.x + layer.offset.x,
          y: source.position.y + layer.offset.y,
          z: 0,
        },
        rotation: { x: 0, y: 0, z: Math.sin(rotationRadians), w: Math.cos(rotationRadians) },
        active: layer.visible && source.visible,
      });
      for (let componentIndex = 0; componentIndex < source.components.length; componentIndex++) {
        const descriptor = source.components[componentIndex];
        const componentPath = objectPath + '/components/' + componentIndex;
        const component = this.createComponent(
          document,
          layer,
          source,
          scene,
          documentRoot,
          descriptor,
          componentPath,
          frames,
          diagnostics,
        );
        if (component === null) {
          if (diagnostics.length > 0) {
            object.destroy();
            return;
          }
          continue;
        }
        addComponent(object, component, componentPath, diagnostics);
        if (diagnostics.length > 0) {
          object.destroy();
          return;
        }
      }
      roots.push(object);
      instances.push({ sourceId: source.id, sourceKind: 'object', tilesetId: null, gameObject: object });
    }
  }

  private createComponent(
    document: World2DDocument,
    layer: World2DLayer,
    object: World2DObjectData,
    scene: GameScene,
    documentRoot: string,
    descriptor: World2DComponentDescriptor,
    componentPath: string,
    frames: ResolvedFrame[],
    diagnostics: World2DDiagnostic[],
  ): GameComponent | null {
    if (descriptor.kind === 'spriteRenderer') {
      const data = descriptor.data as any as World2DSpriteRendererData;
      const frame = frameForCell(frames, data.tilesetId, data.tileId);
      if (frame === null) {
        diagnostics.push(
          diagnostic(componentPath, 'sprite_frame_missing', 'SpriteRenderer descriptor has no resolved frame.'),
        );
        return null;
      }
      if (data.flipDiagonal === true) {
        diagnostics.push(
          diagnostic(
            componentPath + '/data/flipDiagonal',
            'unsupported_sprite_flip',
            'Diagonal flips are supported for tilemap cells but not spriteRenderer components.',
          ),
        );
        return null;
      }
      const tint =
        data.tint === undefined
          ? { r: 255, g: 255, b: 255, a: 255 }
          : { r: data.tint.r, g: data.tint.g, b: data.tint.b, a: data.tint.a };
      tint.a = tint.a * layer.opacity;
      const sprite = new SpriteRenderer(frame, {
        size: data.size === undefined ? object.size : data.size,
        pivot: data.pivot === undefined ? object.origin : data.pivot,
        flipX: data.flipX === true,
        flipY: data.flipY === true,
        tint,
        visible: object.visible && layer.visible,
      });
      if (sprite.error !== null) {
        diagnostics.push(diagnostic(componentPath, 'sprite_renderer_invalid', sprite.error));
        return null;
      }
      return sprite;
    }
    if (descriptor.kind === 'physicsBody2D') {
      const data = descriptor.data as any as World2DPhysicsBodyData;
      const world = this.options.physicsWorld2D;
      if (world === undefined || world === null || !world.isReady) {
        diagnostics.push(
          diagnostic(componentPath, 'physics_world_missing', 'physicsBody2D requires a ready PhysicsWorld2D.'),
        );
        return null;
      }
      const body = new PhysicsBody2D(world, {
        type: data.type,
        shape: data.shape,
        isSensor: data.isSensor,
        layer: data.layer,
        mask: data.mask,
      });
      if (body.error !== null) {
        diagnostics.push(diagnostic(componentPath, 'physics_body_invalid', body.error));
        body.dispose();
        return null;
      }
      return body;
    }
    const factory = this.registry._factory(descriptor.kind);
    if (factory === null) {
      diagnostics.push(
        diagnostic(
          componentPath + '/kind',
          'component_factory_missing',
          'No component factory is registered for kind "' + descriptor.kind + '".',
        ),
      );
      return null;
    }
    try {
      const context: World2DComponentFactoryContext = {
        document,
        documentRoot,
        scene,
        layer,
        object,
        resolveAssetPath: (path: string): string | null => {
          if (document.assets.indexOf(path) < 0) return null;
          return pathJoin(documentRoot, path);
        },
      };
      const result = factory(cloneJsonValue(descriptor.data) as Record<string, World2DJsonValue>, context);
      if (result instanceof GameComponent) return result;
      if (isDiagnostic(result)) {
        diagnostics.push({
          path: result.path.length > 0 ? result.path : componentPath,
          code: result.code,
          message: result.message,
        });
        return null;
      }
      diagnostics.push(
        diagnostic(
          componentPath,
          'invalid_factory_result',
          'Component factory must return a GameComponent or a structured diagnostic.',
        ),
      );
      return null;
    } catch (_error) {
      diagnostics.push(
        diagnostic(
          componentPath,
          'component_factory_failed',
          'Component factory threw while constructing its component.',
        ),
      );
      return null;
    }
  }
}
