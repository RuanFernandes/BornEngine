---
title: Database and migrations
description: Persist typed game data in SQLite across native and Web targets.
section: API / Data
order: 35
---

`GameDatabase` is a small typed SQLite layer for game saves and settings. Define tables in TypeScript, evolve them with versioned migrations, and make changes through CRUD methods or a transaction. The engine builds SQL from the schema and filters; the public API does not accept SQL strings.

Native projects compile the SQLite implementation only when the `sqlite` native feature is enabled. Add it when scaffolding, or add `native_features = ["sqlite"]` under `[bornengine]` in `perry.toml` and rebuild with the BornEngine CLI:

```sh
bornengine new MyGame --native-features sqlite
```

Without the feature, the database API remains present but native database operations return `unsupported`. Web/WASM retains its existing persistent SQLite implementation and does not need this native build feature.

## Define a schema and migration

```ts
import {
  columns,
  defineMigration,
  defineSchema,
  defineTable,
  GameDatabase,
} from '@bornengine/engine/storage';

const schema = defineSchema({
  progress: defineTable({
    columns: {
      slot: columns.text({ primaryKey: true }),
      level: columns.text({ notNull: true }),
      score: columns.integer({ notNull: true, default: 0 }),
    },
  }),
});

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('progress', schema.progress.columns);
  }),
];

const database = new GameDatabase({
  appId: 'org.example.mygame',
  name: 'saves',
  schema,
  migrations,
});

const opened = await database.open();
if (!opened.ok) console.error('Database open failed:', opened.status);
```

`appId` and `name` identify the database and must be valid namespaces. Column kinds are `integer`, `real`, `text`, `blob` (`Uint8Array`), and `boolean`. Column options include `primaryKey`, `autoIncrement`, `notNull`, `nullable`, `unique`, and `default`. `defineTable()` can also declare named indexes.

The TypeScript schema describes the latest row shape and checks inserts, updates, and query filters at compile time and runtime. It does not create physical tables by itself. `open()` applies only the ordered migrations you provide. A new database with no initial migration has no application tables.

Migration versions must be strictly increasing positive integers. Migrations use the finite builder operations `createTable`, `dropTable`, `addColumn`, `dropColumn`, `createIndex`, `dropIndex`, and `transform`; arbitrary SQL and partial indexes are not supported. Each migration runs atomically with its version update. A failed migration rolls back and `open()` returns `migration_error` or a more specific status.

## Read and write typed rows

```ts
const row = await database.findByPrimaryKey('progress', 'slot-1');
if (row.ok && row.value !== null) {
  console.log(row.value.level, row.value.score);
}

const inserted = await database.insert('progress', {
  slot: 'slot-1',
  level: 'cavern',
  score: 0,
});

const updated = await database.update(
  'progress',
  { score: 1250 },
  { slot: { eq: 'slot-1' } },
);
const removed = await database.delete('progress', { slot: { eq: 'slot-1' } });
```

`select()` accepts typed filters, `and`/`or`/`not`, comparisons (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, and `isNull`), `orderBy`, `limit`, and `offset`. `findByPrimaryKey()` returns `value: null` for a missing row. Every operation returns a `DatabaseResult<T>`; check `ok` before using `value`.

## Transactions

Transactions commit only when the async callback returns an `{ ok: true, status: 'ok', ... }` result. Any failed operation marks the transaction failed, and the transaction rolls back even if the callback ignores that operation's result.

```ts
const saved = await database.transaction(async (tx) => {
  const removed = await tx.delete('progress', { slot: { eq: 'slot-1' } });
  if (!removed.ok) return removed;
  return tx.insert('progress', { slot: 'slot-1', level: 'cavern', score: 1250 });
});

if (!saved.ok) console.error('Save transaction failed:', saved.status);
```

Keep one open `GameDatabase` writer for an identity in a native engine process. Web persistent mode enforces one writer per origin and database identity across tabs. SQLite/platform locks may also report `busy` when another process owns a write. Outside a transaction, an operation while that handle's transaction is active returns `busy`; `close()` also returns `busy` until the transaction settles.

## Result statuses

Statuses are stable API values:

| Status | Meaning |
| --- | --- |
| `ok` | The operation succeeded. |
| `invalid_namespace` | `appId` or database name is malformed. |
| `invalid_schema` | The schema or migration sequence is invalid. |
| `invalid_query` | A table, filter, sort, or selection is invalid. |
| `invalid_data` | A value does not match its declared column. |
| `not_open` / `closed` | The handle has not been opened or has already closed. |
| `not_found` | A requested database resource was not found. |
| `busy` | A writer or transaction currently owns the database. |
| `unsupported` | The current runtime does not provide the requested backend. |
| `storage_error` | The platform failed to complete storage I/O. |
| `quota_exceeded` | The Web storage quota rejected a durable write. |
| `migration_error` | A migration could not be applied atomically. |
| `corrupt_data` | The stored database or imported image is malformed. |
| `unsupported_version` | The database schema version is newer than this build supports. |
| `constraint_error` | SQLite rejected a primary key, unique, or other declared constraint. |

## Export and restore

`export()` returns a `Uint8Array` containing a SQLite database image. Store that byte array through a platform file picker, account backup, or other host-provided backup channel. `import(bytes)` atomically replaces the open database only when the image matches its already-migrated tables and supported full-index definitions. It returns an error status rather than accepting a mismatched schema. Close the handle after its work is complete and check the returned status; a successful browser write resolves after the selected backend has durably committed its snapshot.

The engine does not encrypt SQLite files. Treat saves as user data, validate imported bytes, and do not store passwords, tokens, payment details, or other secrets in `GameDatabase`. Use the platform Keychain/Keystore or another secret-storage service for credentials.

## Persistence by platform

Persistent mode is the default. Set `inMemory: true` only when a deliberately volatile database is needed, such as a test or temporary session; it is never selected silently as a fallback.

| Target | Persistent backend |
| --- | --- |
| macOS, iOS, tvOS, watchOS, visionOS | SQLite under the app container's `Library/Application Support/{appId}/{name}.sqlite3`. |
| Linux | SQLite under `$XDG_DATA_HOME/{appId}` or `$HOME/.local/share/{appId}`. |
| Windows | SQLite under `%LOCALAPPDATA%/{appId}`; `%APPDATA%` is used when the local-data variable is unavailable. |
| Android | SQLite under the app-private files directory configured by the Android host. |
| Web/WASM | Each open database owns a dedicated worker. It uses OPFS when available and falls back to an IndexedDB SQLite snapshot when OPFS capability is unsupported. |

Web persistent mode gives each open database its own request queue and takes an exclusive Web Locks API lock for its identity so another tab cannot write concurrently. Close each database when finished to release its worker and memory. Browser storage is subject to quota and browser eviction policy; it is not a guaranteed backup. If durable writes fail, inspect `quota_exceeded` or `storage_error`, offer a backup/export path, and avoid assuming a later retry will preserve data.

See the [Web/WASM storage notes](../../platforms/web-wasm/) and [Apple platform guide](../../platforms/apple/) for platform details, or the [2D production workflow](../../guides/2d-production-workflow/) for a game save example.
