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
    properties: { surface: { type: 'string', value: 'grass' } },
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
    properties: { layerRole: { type: 'string', value: 'actors' } },
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
          speed: { type: 'float', value: 2.5 },
          displayName: { type: 'string', value: 'Mira' },
          tint: { type: 'color', value: '#3366CC' },
          voice: { type: 'file', value: 'audio/player.wav' },
        },
        components: [
          { kind: 'gameplay.spawn-marker', data: { spawnId: 'start' } },
        ],
      },
      {
        id: 'spawn-002',
        name: 'Second Spawn',
        type: 'spawn',
        position: { x: 64, y: 48 },
        rotation: 0,
        size: { x: 24, y: 48 },
        origin: { x: 0, y: 0 },
        visible: true,
        tags: ['spawn'],
        properties: {},
        components: [],
      },
    ],
  };
}

function makeWorld(id: string, layers: World2DLayer[] = []): World2DDocument {
  const assets: string[] = [];
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    if (layer.type === 'tilemap' && assets.indexOf('assets/terrain.png') < 0) {
      assets.push('assets/terrain.png');
    }
    if (layer.type === 'objects') {
      for (let objectIndex = 0; objectIndex < layer.objects.length; objectIndex++) {
        const properties = layer.objects[objectIndex].properties;
        const propertyNames = Object.keys(properties);
        for (let propertyIndex = 0; propertyIndex < propertyNames.length; propertyIndex++) {
          const property = properties[propertyNames[propertyIndex]];
          if (property.type === 'file' && typeof property.value === 'string' && assets.indexOf(property.value) < 0) {
            assets.push(property.value);
          }
        }
      }
    }
  }
  assets.sort();
  return {
    format: 'bornengine.world2d',
    version: 1,
    id,
    name: id,
    assets,
    tilesets: layers.length > 0 && layers[0].type === 'tilemap'
      ? [{
          id: 'terrain',
          image: 'assets/terrain.png',
          tileWidth: 16,
          tileHeight: 16,
          columns: 2,
          tileCount: 2,
          margin: { x: 1, y: 2 },
          spacing: { x: 3, y: 4 },
          tiles: [
            { tileId: 0, properties: {} },
            { tileId: 1, collision: { x: 0, y: 8, width: 16, height: 8 }, properties: {} },
          ],
        }]
      : [],
    layers,
    metadata: { ordered: ['first', 'second'], unknown: { keep: true, zeta: 'last', alpha: 'first' } },
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

const invalidAtlasDimensions = makeWorld('invalid-atlas', [tileLayer(tileCells())]);
invalidAtlasDimensions.tilesets[0].spacing.y = 0.5;
const invalidAtlasResult = validateWorld2D(invalidAtlasDimensions);
expect(!invalidAtlasResult.ok && hasDiagnostic(invalidAtlasResult.diagnostics, 'invalid_dimensions', '/tilesets/0/spacing'),
  'tileset margin and spacing must be non-negative integer vectors');

const migration = migrateWorld2D(sample);
expect(migration.ok && migration.document.version === 2,
  'v1 migration produces the normalized v2 document');

const serializedResult = serializeWorld2D(sample);
expect(serializedResult.ok, 'sample serializes successfully');
const serialized = serializedResult.json;
const reparsedStorage = JSON.parse(serialized) as unknown;
expect(validateWorld2D(reparsedStorage).ok, 'serialized sample reparses and validates');
const reparsed = migrateWorld2D(reparsedStorage).document as World2DDocument;
expect(reparsed.tilesets[0].margin.x === 1 && reparsed.tilesets[0].margin.y === 2 &&
  reparsed.tilesets[0].spacing.x === 3 && reparsed.tilesets[0].spacing.y === 4,
  'asymmetric tileset margins and spacing survive serialization');
const serializedAgain = serializeWorld2D(reparsed).json;
expect(serializedAgain === serialized, 'sample serialization is deterministic');
expect((reparsed.metadata.unknown as { keep: boolean }).keep === true,
  'unknown nested metadata survives serialization');
const unknownMetadataKeys = Object.keys(reparsed.metadata.unknown as { [key: string]: World2DDocument['metadata'][string] });
expect(unknownMetadataKeys.length === 3 && unknownMetadataKeys[0] === 'keep' &&
  unknownMetadataKeys[1] === 'zeta' && unknownMetadataKeys[2] === 'alpha',
  'nested metadata key order survives serialization');
expect(reparsed.layers[0].properties !== undefined &&
  reparsed.layers[0].properties.surface.value === 'grass' &&
  reparsed.layers[1].properties !== undefined &&
  reparsed.layers[1].properties.layerRole.value === 'actors',
  'optional typed properties survive on both layer kinds');
const metadataKeys = Object.keys(reparsed.metadata);
expect(metadataKeys.length === 2 && metadataKeys[0] === 'ordered' && metadataKeys[1] === 'unknown',
  'metadata object key order survives serialization');
const sortedAssets = makeWorld('asset-order');
sortedAssets.assets = ['z/data.bin', 'a/data.bin'];
const sortedAssetsResult = serializeWorld2D(sortedAssets);
const sortedAssetsDocument = JSON.parse(sortedAssetsResult.json) as { assets?: string[] };
expect(sortedAssetsResult.ok && sortedAssetsDocument.assets !== undefined &&
  sortedAssetsDocument.assets[0] === 'a/data.bin' && sortedAssetsDocument.assets[1] === 'z/data.bin',
  'additional asset order is canonicalized');
const roundTripTileLayer = reparsed.layers[0];
expect(roundTripTileLayer.type === 'tilemap' && roundTripTileLayer.data[7] !== null &&
  roundTripTileLayer.data[7].flipX && roundTripTileLayer.data[7].flipY &&
  roundTripTileLayer.data[7].flipDiagonal,
  'sample round trip preserves explicit tile flip fields');
const roundTripObjectLayer = reparsed.layers[1];
const roundTripObjectProperties = roundTripObjectLayer.type === 'objects'
  ? Object.keys(roundTripObjectLayer.objects[0].properties)
  : [];
expect(roundTripObjectProperties.length === 6 && roundTripObjectProperties[0] === 'displayName' &&
  roundTripObjectProperties[1] === 'friendly' && roundTripObjectProperties[2] === 'health',
  'name-keyed property maps use canonical key order');

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
expect(!duplicateCheck.ok && hasDiagnostic(duplicateCheck.diagnostics, 'duplicate_id', '/layers/0/objects/2/id'),
  'duplicate object IDs identify the second occurrence');

const escapingAsset = makeWorld('escaping-asset', [tileLayer(tileCells())]);
escapingAsset.assets.push('../outside.png');
const assetCheck = validateWorld2D(escapingAsset);
expect(!assetCheck.ok && hasDiagnostic(assetCheck.diagnostics, 'invalid_asset_path', '/assets/1'),
  'escaping asset references are rejected with a path');
const missingFileAsset = makeWorld('missing-file-asset', [objectLayer()]);
missingFileAsset.assets = [];
const missingFileCheck = validateWorld2D(missingFileAsset);
expect(!missingFileCheck.ok && hasDiagnostic(missingFileCheck.diagnostics, 'missing_asset',
  '/layers/0/objects/0/properties/voice/value'),
  'file properties must refer to declared project assets');

const future = makeWorld('future');
future.version = 3;
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
const malformedJSONLoad = new World2DLoader().loadJSON('{', emptyScene);
expect(!malformedJSONLoad.ok && malformedJSONLoad.diagnostics.length > 0 && emptyScene.objects.length === 0,
  'malformed JSON returns structured diagnostics without changing the destination scene');

const failedScene = new GameScene(owner as Game);
const existingObject = new GameObject({ name: 'Existing' });
failedScene.add(existingObject);
const failingRegistry = new World2DComponentRegistry();
const failingRegistered = failingRegistry.registerComponentFactory('gameplay.spawn-marker', () => ({
  path: '/layers/0/objects/0/components/0',
  code: 'factory_rejected',
  message: 'fixture factory failure',
}));
const failedLoad = new World2DLoader(failingRegistry).load(objects, failedScene);
expect(failingRegistered && !failedLoad.ok &&
  hasDiagnostic(failedLoad.diagnostics, 'factory_rejected', '/layers/0/objects/0/components/0') &&
  failedScene.objects.length === 1 && failedScene.objects[0] === existingObject,
  'factory failure leaves existing destination scene contents unchanged');

class SpawnMarker extends GameComponent {
  readonly spawnId: string;
  awakeSceneObjectCount = 0;
  constructor(spawnId: string) {
    super();
    this.spawnId = spawnId;
  }
  onAwake(): void {
    const ownerObject = this.gameObject;
    if (ownerObject !== null && ownerObject.scene !== null) {
      this.awakeSceneObjectCount = ownerObject.scene.objects.length;
    }
  }
}
const successScene = new GameScene(owner as Game);
const successRegistry = new World2DComponentRegistry();
const successRegistered = successRegistry.registerComponentFactory('gameplay.spawn-marker', (data) => {
  const values = data as { spawnId: string };
  return new SpawnMarker(values.spawnId);
});
expect(successRegistered && !successRegistry.registerComponentFactory('spriteRenderer', () => new GameComponent()) &&
  !successRegistry.registerComponentFactory('gameplay.spawn-marker', () => new GameComponent()),
  'registry reserves built-in kinds and rejects duplicate registrations');
const successLoad = new World2DLoader(successRegistry).load(objects, successScene);
const loadedObject = successScene.objects.length === 2 ? successScene.objects[0] : null;
const marker = loadedObject === null ? null : loadedObject.getComponent(SpawnMarker);
expect(successLoad.ok && loadedObject !== null && loadedObject.name === 'Player Spawn' &&
  marker !== null && marker.spawnId === 'start' && marker.awakeSceneObjectCount === 2,
  'registered factories create every object before atomic scene attachment callbacks run');

successScene.destroy();
failedScene.destroy();
emptyScene.destroy();
context.dispose();
console.log('World2D format fixtures passed');
