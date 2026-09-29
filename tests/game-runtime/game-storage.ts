import { GameStorage } from '../../src/storage/game-storage';
import type { GameStorageBackend } from '../../src/storage/game-storage';
import type { JsonValue } from '../../src/storage/game-storage';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

class MemoryBackend implements GameStorageBackend {
  readonly values = new Map<string, string>();
  readonly paths: string[] = [];
  supported = true;
  failNextWrite = false;

  isSupported(): boolean { return this.supported; }
  exists(path: string): boolean { return this.values.has(path); }
  read(path: string): string | null { return this.values.get(path) ?? null; }
  remove(path: string): boolean { return this.values.delete(path); }
  writeAtomic(path: string, data: string): boolean {
    this.paths.push(path);
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return false;
    }
    this.values.set(path, data);
    return true;
  }
}

const backend = new MemoryBackend();
const storage = new GameStorage('com.example.game', 'slot-1', backend);
const settings: JsonValue = {
  sound: { music: 0.4, sfx: 0.8 },
  controls: [{ action: 'jump', key: 32 }, { action: 'fire', button: 0 }],
};

const written = storage.write('settings', settings);
expect(written.ok, 'JSON-safe settings write succeeds');
expect(backend.paths[0] === '__bornengine_storage_v1__/com.example.game/slot-1/settings',
  'storage path scopes a key to app ID, slot, and format version');

const read = storage.read<JsonValue>('settings');
expect(read.ok && JSON.stringify(read.value) === JSON.stringify(settings),
  'versioned JSON envelope round-trips arbitrary game data');
expect(storage.exists('settings').ok && storage.exists('settings').value === true,
  'exists reports a stored key');

const largePayload: JsonValue = { entities: [] };
for (let index = 0; index < 1024; index++) {
  (largePayload as any).entities.push({ id: 'entity-' + index, position: [index, index * 2, 0] });
}
expect(storage.write('large-world', largePayload).ok,
  'large generic JSON payload writes without relying on object JSON.stringify');
const largeRead = storage.read<any>('large-world');
expect(largeRead.ok && largeRead.value.entities.length === 1024 &&
  largeRead.value.entities[1023].position[1] === 2046,
  'large world-shaped payload round-trips through the versioned envelope');

const world2dPayload: JsonValue = {
  format: 'bornengine.world2d',
  version: 1,
  scenes: [{
    id: 'arena',
    layers: [{ name: 'ground', tiles: [{ x: 2, y: 3, tile: 'grass' }] }],
    camera: { target: { x: 24, y: -8 }, zoom: 1 },
  }],
};
expect(storage.write('world2d', world2dPayload).ok,
  'JSON-safe World2D documents can be stored directly');
const world2dRead = storage.read<any>('world2d');
expect(world2dRead.ok && world2dRead.value.scenes[0].layers[0].tiles[0].y === 3 &&
  world2dRead.value.scenes[0].camera.target.y === -8,
  'World2D layers and XY positions round-trip without a platform-specific serializer');

const serializedWorld2d = '{"format":"bornengine.world2d","version":1,"scenes":[]}';
expect(storage.write('world2d-json', serializedWorld2d).ok &&
  storage.read<string>('world2d-json').value === serializedWorld2d,
  'serialized World2D JSON strings remain intact for custom serializers');

const previous = backend.read(backend.paths[0]);
backend.failNextWrite = true;
const failedReplace = storage.write('settings', { sound: { music: 0 } });
expect(!failedReplace.ok && failedReplace.status === 'storage_error' &&
  backend.read(backend.paths[0]) === previous,
  'failed atomic replacement leaves the prior save intact');

expect(!storage.write('../outside', {}).ok && !storage.read('../outside').ok &&
  !storage.remove('../outside').ok && !storage.exists('../outside').ok,
  'key traversal attempts are rejected before reaching the backend');
expect(!new GameStorage('../app', 'slot', backend).write('key', {}).ok &&
  !new GameStorage('app', '../slot', backend).exists('key').ok,
  'app and slot traversal attempts are rejected');

expect(!storage.write('non-json', { value: Number.NaN } as any).ok &&
  !storage.write('undefined', undefined as any).ok,
  'non-JSON-safe values are rejected');

const unsupportedBackend = new MemoryBackend();
unsupportedBackend.supported = false;
const unsupported = new GameStorage('com.example.game', 'default', unsupportedBackend);
expect(!unsupported.write('settings', settings).ok &&
  unsupported.write('settings', settings).status === 'unsupported',
  'default targets without a verified app-data adapter return unsupported');
expect(unsupported.read('settings').status === 'unsupported' &&
  unsupported.remove('settings').status === 'unsupported' &&
  unsupported.exists('settings').status === 'unsupported',
  'every operation reports unsupported consistently');

expect(storage.remove('settings').ok && !storage.exists('settings').value,
  'remove deletes one namespaced save');
console.log('GameStorage namespace and atomic-write fixture passed');
