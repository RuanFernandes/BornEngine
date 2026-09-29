import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import {
  World2DComponentRegistry,
  World2DLoader,
  migrateWorld2D,
  serializeWorld2D,
  validateWorld2D,
} from '../../src/world2d';
import type {
  World2DDocument,
  World2DDiagnostic,
  World2DLayer,
  WorldTileCell,
} from '../../src/world2d';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function hasDiagnostic(diagnostics: World2DDiagnostic[], code: string, path: string): boolean {
  for (let index = 0; index < diagnostics.length; index++) {
    if (diagnostics[index].code === code && diagnostics[index].path === path) return true;
  }
  return false;
}

function tileCells(): Array<WorldTileCell | null> {
  const cells: Array<WorldTileCell | null> = [];
  for (let mask = 0; mask < 8; mask++) {
    cells.push({
      tilesetId: 'terrain',
      tileId: 0,
      flipX: (mask & 1) !== 0,
      flipY: (mask & 2) !== 0,
      flipDiagonal: (mask & 4) !== 0,
    });
  }
  return cells;
}

function tileLayer(data: Array<WorldTileCell | null>): World2DLayer {
  return {
    id: 'ground',
    type: 'tilemap',
    name: 'Ground',
    visible: true,
    opacity: 1,
    offset: { x: 0, y: 0 },
    parallax: { x: 1, y: 1 },
    width: 4,
    height: 2,
    tileSize: { x: 16, y: 16 },
    data,
  };
}

function objectLayer(): World2DLayer {
  return {
    id: 'actors',
    type: 'objects',
    name: 'Actors',
    visible: true,
    opacity: 1,
    offset: { x: 0, y: 0 },
    parallax: { x: 1, y: 1 },
    objects: [
      {
        id: 'spawn-001',
        name: 'Player Spawn',
        type: 'spawn',
        position: { x: 32, y: 48 },
        rotation: 0,
        size: { x: 24, y: 48 },
        origin: { x: 0, y: 0 },
        visible: true,
        tags: ['spawn', 'player'],
        properties: {
          health: { type: 'int', value: 3 },
          friendly: { type: 'bool', value: true },
        },
        components: [
          { kind: 'gameplay.spawn-marker', data: { spawnId: 'start' } },
        ],
      },
    ],
  };
}

function makeWorld(id: string, layers: World2DLayer[] = []): World2DDocument {
  return {
    format: 'bornengine.world2d',
    version: 1,
    id,
    name: id,
    assets: layers.length > 0 && layers[0].type === 'tilemap'
      ? ['assets/terrain.png']
      : [],
    tilesets: layers.length > 0 && layers[0].type === 'tilemap'
      ? [{
          id: 'terrain',
          image: 'assets/terrain.png',
          tileWidth: 16,
          tileHeight: 16,
          columns: 2,
          tileCount: 2,
          margin: 0,
          spacing: 0,
          tiles: [
            { tileId: 0, properties: {} },
            { tileId: 1, collision: { x: 0, y: 8, width: 16, height: 8 }, properties: {} },
          ],
        }]
      : [],
    layers,
    metadata: { ordered: ['first', 'second'], unknown: { keep: true } },
  };
}

const simple = makeWorld('empty-meadow');
const tilemap = makeWorld('flip-grid', [tileLayer(tileCells())]);
const objects = makeWorld('spawn-points', [objectLayer()]);
const sample = makeWorld('sample-platform', [tileLayer(tileCells()), objectLayer()]);
expect(validateWorld2D(simple).ok, 'empty simple world validates');
expect(validateWorld2D(tilemap).ok, 'tilemap validates with all eight flip combinations');
expect(validateWorld2D(objects).ok, 'object layer validates typed properties and components');
expect(validateWorld2D(sample).ok, 'sample world combines tile and object layers');

const migration = migrateWorld2D(sample);
expect(migration.ok && migration.document.version === 1,
  'current v1 migration preserves the current document');

const serialized = serializeWorld2D(sample);
const reparsed = JSON.parse(serialized) as World2DDocument;
expect(validateWorld2D(reparsed).ok, 'serialized sample reparses and validates');
expect(serializeWorld2D(reparsed) === serialized, 'sample serialization is deterministic');
expect(reparsed.metadata.unknown.keep === true,
  'unknown nested metadata survives serialization');

const badLength = makeWorld('bad-length', [tileLayer(tileCells())]);
if (badLength.layers[0].type === 'tilemap') badLength.layers[0].data.pop();
const lengthCheck = validateWorld2D(badLength);
expect(!lengthCheck.ok && hasDiagnostic(lengthCheck.diagnostics, 'tile_layer_length', '/layers/0/data'),
  'tile layer length errors identify the data path');

const badCell = makeWorld('bad-cell', [tileLayer(tileCells())]);
if (badCell.layers[0].type === 'tilemap' && badCell.layers[0].data[1] !== null) {
  badCell.layers[0].data[1].tileId = 9;
}
const cellCheck = validateWorld2D(badCell);
expect(!cellCheck.ok && hasDiagnostic(cellCheck.diagnostics, 'tile_id_out_of_range', '/layers/0/data/1/tileId'),
  'out-of-range local tile IDs identify the field path');

const duplicate = makeWorld('duplicate-object', [objectLayer()]);
if (duplicate.layers[0].type === 'objects') duplicate.layers[0].objects.push(duplicate.layers[0].objects[0]);
const duplicateCheck = validateWorld2D(duplicate);
expect(!duplicateCheck.ok && hasDiagnostic(duplicateCheck.diagnostics, 'duplicate_id', '/layers/0/objects/1/id'),
  'duplicate object IDs identify the second occurrence');

const escapingAsset = makeWorld('escaping-asset', [tileLayer(tileCells())]);
escapingAsset.assets.push('../outside.png');
const assetCheck = validateWorld2D(escapingAsset);
expect(!assetCheck.ok && hasDiagnostic(assetCheck.diagnostics, 'invalid_asset_path', '/assets/1'),
  'escaping asset references are rejected with a path');

const future = makeWorld('future');
future.version = 2;
const futureCheck = validateWorld2D(future);
const futureMigration = migrateWorld2D(future);
expect(!futureCheck.ok && hasDiagnostic(futureCheck.diagnostics, 'unsupported_version', '/version'),
  'future schema versions are rejected');
expect(!futureMigration.ok && hasDiagnostic(futureMigration.diagnostics, 'unsupported_version', '/version'),
  'migration rejects future schema versions without throwing');

const owner: object = {};
const context = GameContext.create();
expect(context !== null, 'test creates an isolated GameContext');
if (context === null) process.exit(1);
bindGameContext(owner, context);
const emptyScene = new GameScene(owner as Game);
const emptyRegistry = new World2DComponentRegistry();
let emptyFactoryCalls = 0;
emptyRegistry.registerComponentFactory('unused', () => {
  emptyFactoryCalls++;
  return new GameComponent();
});
const emptyLoad = new World2DLoader(emptyRegistry).load(simple, emptyScene);
expect(emptyLoad.ok && emptyFactoryCalls === 0 && emptyScene.objects.length === 0,
  'empty worlds load safely without invoking unrelated factories');

const failedScene = new GameScene(owner as Game);
const failingRegistry = new World2DComponentRegistry();
failingRegistry.registerComponentFactory('gameplay.spawn-marker', () => ({
  path: '/layers/0/objects/0/components/0',
  code: 'factory_rejected',
  message: 'fixture factory failure',
}));
const failedLoad = new World2DLoader(failingRegistry).load(objects, failedScene);
expect(!failedLoad.ok && failedScene.objects.length === 0 && failedLoad.diagnostics.length > 0,
  'factory failure leaves destination scene unchanged');

class SpawnMarker extends GameComponent {
  readonly spawnId: string;
  constructor(spawnId: string) {
    super();
    this.spawnId = spawnId;
  }
}
const successScene = new GameScene(owner as Game);
const successRegistry = new World2DComponentRegistry();
successRegistry.registerComponentFactory('gameplay.spawn-marker', (data) => {
  const values = data as { spawnId: string };
  return new SpawnMarker(values.spawnId);
});
const successLoad = new World2DLoader(successRegistry).load(objects, successScene);
const loadedObject = successScene.objects.length === 1 ? successScene.objects[0] : null;
const marker = loadedObject === null ? null : loadedObject.getComponent(SpawnMarker);
expect(successLoad.ok && loadedObject !== null && loadedObject.name === 'Player Spawn' &&
  marker !== null && marker.spawnId === 'start',
  'registered factories create components before atomic scene attachment');

successScene.destroy();
failedScene.destroy();
emptyScene.destroy();
context.dispose();
console.log('World2D format fixtures passed');
