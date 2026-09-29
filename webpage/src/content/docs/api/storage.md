---
title: Game storage
description: Store versioned JSON saves and settings in a Game-scoped namespace.
section: API / Assets
order: 35
---

`createGameStorage()` selects the built-in storage adapter for the current target. The current adapter persists records in browser `localStorage` for Web/WASM; other built-in targets return `unsupported`. Hosts can supply their own `GameStorageBackend` when they provide app-data storage.

## Create a namespaced store

```ts
import { createGameStorage } from '@bornengine/engine/storage';

const saves = createGameStorage('com.example.mygame', 'slot-1');
if (saves.isSupported) {
  const result = saves.write('progress', {
    scene: 'forest',
    player: { position: { x: 120, y: 48 }, health: 80 },
  });
  if (!result.ok) console.error('Could not save:', result.status);
}
```

Every record is isolated by `appId`, `slot`, and `key`, and wrapped in the storage format version. Each segment must start with a letter or number and contain only letters, numbers, `.`, `_`, or `-`; `appId` and `slot` are limited to 64 characters, while keys are limited to 128. Names containing `..` are rejected.

`write()` accepts finite JSON values only: `null`, booleans, strings, finite numbers, arrays, and plain object data. It rejects cycles and values such as `undefined`, functions, `NaN`, and infinity. The browser adapter replaces each record in one `localStorage` write.

## Read, check, and remove

```ts
const loaded = saves.read<{ scene: string; player: { position: { x: number; y: number }; health: number } }>('progress');
if (loaded.ok && loaded.value !== null) {
  console.log(loaded.value.scene, loaded.value.player.health);
} else if (loaded.status === 'not_found') {
  console.log('Start a new save.');
}

const exists = saves.exists('progress');
const removed = saves.remove('progress');
```

All methods return `GameStorageResult` objects rather than throwing. Status values are `ok`, `unsupported`, `invalid_namespace`, `invalid_key`, `invalid_data`, `not_found`, `corrupt_data`, and `storage_error`. Removing a missing key succeeds with `value: false`; reading a missing key returns `not_found`. A malformed or mismatched envelope returns `corrupt_data`.

`GameStorage` without a backend is unsupported; use `createGameStorage()` for the built-in target selection. Advanced hosts may pass a `GameStorageBackend` to `new GameStorage(appId, slot, backend)`. Its `writeAtomic()` implementation must preserve the previous value when a write fails.

For a full production workflow that saves input bindings, see the [2D production guide](../../guides/2d-production-workflow/).
