---
title: Database and migrations
description: Store typed game data in a SQLite database with versioned migrations, transactions, and backups.
section: API
order: 35
---

`GameDatabase` stores data that must survive a restart, such as save slots, settings, and high scores. It uses SQLite, a small database that keeps all its data in one file. You describe your tables in TypeScript, change them over time with numbered migrations, and read or write rows through typed methods. The API never accepts SQL text. Every method returns a result object instead of throwing, so you check the outcome of each call.

Import the names on this page from `@bornengine/engine/storage`. The root package `@bornengine/engine` exports the same names.

## Before you start

Native builds include the SQLite backend only when the `sqlite` native feature is on. Add it when you create a project:

```sh
bornengine new MyGame --native-features sqlite
```

For an existing project, add it to the `[bornengine]` table in `perry.toml`:

```toml
[bornengine]
native_profile = "2d"
native_features = ["sqlite"]
```

Without the feature, `open()` returns `unsupported` on a native build. Web/WASM ships its own SQLite build and needs no feature.

On native Linux, `Game.run()` does not run promise continuations yet, so do not wait on database calls from `loop()` or `render()`. Open the database before you call `run()`, and write the final save after `run()` resolves. The `2d-platformer` example follows this pattern.

## Define a schema and migration

A schema describes the tables your game reads and writes. A migration is a numbered change that creates or alters the real tables. The schema gives TypeScript the row types; only migrations build tables in the file.

```ts
import { columns, defineMigration, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

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

async function openSaves(): Promise<GameDatabase<typeof schema> | null> {
  const database = new GameDatabase({
    appId: 'org.example.mygame',
    name: 'saves',
    schema,
    migrations,
  });
  const opened = await database.open();
  if (!opened.ok) {
    console.error('Could not open the save database:', opened.status);
    return null;
  }
  return database;
}
```

`appId` and `name` identify the database. Each is 1 to 128 characters of letters, digits, `.`, `_`, and `-`, starts with a letter or digit, and never contains `..`.

Columns:

- Kinds are `integer`, `real`, `text`, `blob` (a `Uint8Array`), and `boolean`. Integer columns hold safe integers and real columns hold finite numbers.
- Options are `primaryKey` (at most one per table), `autoIncrement` (only on an integer primary key), `notNull`, `nullable`, `unique`, and `default`. A column that is neither `notNull` nor a primary key accepts `null`.
- Table, column, and index names use letters, digits, and underscores, start with a letter or underscore, and have at most 64 characters.
- A table can list `indexes: [{ name, columns, unique }]`. Index names must be unique across the schema and cannot match a table name. Listing an index does not create it; add a `createIndex` step to a migration.

Migrations:

- A migration has a version and a function that records steps on a builder. Versions are positive integers in strictly increasing order, and each migration needs at least one step.
- The builder steps are `createTable`, `dropTable`, `addColumn`, `dropColumn`, `createIndex`, `dropIndex`, and `transform`. `transform(table, values)` sets the listed columns to fixed values on every row. `addColumn` must name a column that exists in your final schema.
- `open()` applies every migration whose version is above the stored version, in order. Each migration runs together with its version update as one atomic step. If a step fails, nothing from that migration is kept and `open()` returns `migration_error`.
- A new file starts at version 0. To change a table later, append a new migration. Do not edit a migration that players may already have applied.

`open()` returns `ok` if the database is already open. It returns `unsupported_version` when the stored version is higher than the last migration in your build, which happens when an older build opens a file written by a newer one. `database.state` is `'new'`, `'open'`, or `'closed'`.

Call `close()` when you are done. The `Game` does not own the database and never closes it for you. `close()` returns `busy` while a transaction is running.

## Read and write typed rows

```ts
import { columns, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

const schema = defineSchema({
  progress: defineTable({
    columns: {
      slot: columns.text({ primaryKey: true }),
      level: columns.text({ notNull: true }),
      score: columns.integer({ notNull: true, default: 0 }),
    },
  }),
});

async function saveScore(database: GameDatabase<typeof schema>, slot: string, score: number): Promise<boolean> {
  const existing = await database.findByPrimaryKey('progress', slot);
  if (!existing.ok) return false;
  const written =
    existing.value === null
      ? await database.insert('progress', { slot, level: 'cavern', score })
      : await database.update('progress', { score }, { slot: { eq: slot } });
  return written.ok;
}

async function bestScores(database: GameDatabase<typeof schema>): Promise<string[]> {
  const rows = await database.select('progress', {
    where: { score: { gte: 100 } },
    orderBy: [{ column: 'score', direction: 'desc' }],
    limit: 5,
  });
  if (!rows.ok || rows.value === null) return [];
  return rows.value.map((row) => row.slot + ': ' + row.score);
}

async function clearSlot(database: GameDatabase<typeof schema>, slot: string): Promise<boolean> {
  const removed = await database.delete('progress', { slot: { eq: slot } });
  return removed.ok;
}
```

Every method returns a `DatabaseResult<T>`. Check `ok` first. When `ok` is `true`, `value` holds the result, but it is typed `T | null`, so test it before you use it.

- `insert(table, values)` resolves with the new SQLite row ID. You can leave out columns that have a `default`, use `autoIncrement`, or accept `null`.
- `update(table, values, where)` and `delete(table, where)` resolve with the number of rows changed. An update needs at least one value.
- `select(table, options)` resolves with an array of rows. The options are `where`, `orderBy`, `limit`, and `offset`. `limit` and `offset` are non-negative integers.
- `findByPrimaryKey(table, key)` resolves with one row, or with `value: null` when no row has that key.

A filter maps column names to one comparison each: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` (a non-empty array), or `isNull` (a boolean). A filter with several columns requires all of them to match. Combine filters with `and` and `or` (non-empty arrays) and negate one with `not`. Use `isNull` to test for missing values.

TypeScript checks table names, column names, and value types as you write. The same checks run at run time, so a bad value returns `invalid_data` or `invalid_query` instead of reaching the file.

## Transactions

A transaction groups several writes so they all happen or none do. Use one when two rows must change together, such as replacing a save slot.

```ts
import { columns, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

const schema = defineSchema({
  progress: defineTable({
    columns: {
      slot: columns.text({ primaryKey: true }),
      level: columns.text({ notNull: true }),
      score: columns.integer({ notNull: true, default: 0 }),
    },
  }),
});

async function replaceSlot(database: GameDatabase<typeof schema>, score: number): Promise<boolean> {
  const saved = await database.transaction(async (tx) => {
    const removed = await tx.delete('progress', { slot: { eq: 'slot-1' } });
    if (!removed.ok) return removed;
    return tx.insert('progress', { slot: 'slot-1', level: 'cavern', score });
  });
  if (!saved.ok) {
    console.error('Save transaction failed:', saved.status);
    return false;
  }
  return true;
}
```

The callback receives `tx`, which has `insert`, `select`, `update`, and `delete`. It must return a `DatabaseResult`. Usually you return the result of the last operation.

- The transaction commits only if the callback returns an `ok` result and no operation inside it failed. If any `tx` call fails, the whole transaction rolls back, even when your callback ignores that failure.
- If the callback throws, the transaction rolls back and `transaction()` returns `storage_error`.
- While a transaction runs, calls on `database` itself (not `tx`) return `busy`. After the callback returns, `tx` stops working and returns `closed`.
- If a rollback itself fails, the database closes itself, `transaction()` returns `storage_error`, and `state` becomes `'closed'`. Call `open()` again before the next operation.
- Keep one open `GameDatabase` for each `appId` and `name` pair. Opening the same pair twice returns `busy`.

## Result statuses

`DatabaseResult<T>` is either `{ ok: true, status: 'ok', value }` or `{ ok: false, status, value: null }`. The status is one of these stable values:

| Status | Meaning |
| --- | --- |
| `ok` | The operation succeeded. |
| `invalid_namespace` | `appId` or `name` is not a valid namespace. |
| `invalid_schema` | The schema or the migration list failed validation. |
| `invalid_query` | A table, column, filter, `orderBy`, `limit`, or `offset` is invalid. |
| `invalid_data` | A value does not fit its column, a required column is missing, an update has no values, or the bytes passed to `import()` are not a `Uint8Array` of at least 100 bytes. |
| `not_open` | `open()` has not succeeded yet. |
| `closed` | The database was closed, or a `tx` object was used after its transaction ended. |
| `not_found` | A table in your schema does not exist in the stored file. A `createTable` migration is missing. |
| `busy` | Another writer owns the database, or you called `database` during a transaction. |
| `unsupported` | This build has no database backend, or an export is larger than 256 MiB. |
| `storage_error` | The platform failed an I/O call, no app data folder is available, or a transaction callback threw. |
| `quota_exceeded` | The disk or the browser storage quota is full. |
| `migration_error` | A migration step failed and was rolled back. |
| `corrupt_data` | The stored file or an imported image is damaged or does not match your schema. |
| `unsupported_version` | The stored version is newer than your last migration, or an imported image has a different version. |
| `constraint_error` | A primary key, `unique`, `notNull`, or other constraint rejected the write. |

Branch on the statuses you can act on and report the rest:

```ts
import type { DatabaseFailureStatus } from '@bornengine/engine/storage';

function describeFailure(status: DatabaseFailureStatus): string {
  switch (status) {
    case 'quota_exceeded':
      return 'Storage is full. Free some space or export a backup.';
    case 'unsupported_version':
      return 'This save was written by a newer version of the game.';
    case 'busy':
      return 'Another copy of the game is using this save.';
    default:
      return 'Saving failed: ' + status;
  }
}
```

## Export and restore

`export()` resolves with a `Uint8Array` that holds a complete SQLite database image. Pass the bytes to your own backup or sync code. `import(bytes)` replaces the open database with an image, in one step.

```ts
import { columns, defineMigration, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

const schema = defineSchema({
  progress: defineTable({
    columns: {
      slot: columns.text({ primaryKey: true }),
      level: columns.text({ notNull: true }),
    },
  }),
});

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('progress', schema.progress.columns);
  }),
];

async function checkBackup(database: GameDatabase<typeof schema>): Promise<boolean> {
  const exported = await database.export();
  if (!exported.ok || exported.value === null) return false;

  const restore = new GameDatabase({
    appId: 'org.example.mygame',
    name: 'restore-check',
    schema,
    migrations,
    inMemory: true,
  });
  const opened = await restore.open();
  if (!opened.ok) return false;

  const imported = await restore.import(exported.value);
  const closed = await restore.close();
  return imported.ok && closed.ok;
}
```

The image must come from a database with the same schema and the same migration version. `import()` returns `corrupt_data` if the bytes are not a SQLite image or the tables do not match, and `unsupported_version` if the versions differ. It returns `busy` during a transaction. An export larger than 256 MiB returns `unsupported`.

The database is not encrypted, so do not store passwords, tokens, or other secrets in it. Treat imported bytes as untrusted input and check their result.

## Persistence by platform

Persistent mode is the default. Set `inMemory: true` only when you want data that disappears when the database closes, such as a test or a temporary session. The engine never switches to memory on its own. If it cannot find a place to store the file, `open()` fails.

| Target | Where the data lives |
| --- | --- |
| macOS, iOS, tvOS, visionOS, watchOS | `$HOME/Library/Application Support/{appId}/{name}.sqlite3`. In a sandboxed app, `HOME` is the app container. |
| Linux | `{appId}/{name}.sqlite3` under `$XDG_DATA_HOME` when it is an absolute path, otherwise under `$HOME/.local/share`. |
| Windows | `{appId}\{name}.sqlite3` under `%LOCALAPPDATA%`, or under `%APPDATA%` when `LOCALAPPDATA` is not an absolute path. |
| Android | `{appId}/{name}.sqlite3` under the app data folder the Android host provides: `BLOOM_APP_DATA_PATH` when it is set, otherwise the app files folder the host also uses for assets. |
| Web/WASM | OPFS when the browser supports it, otherwise an IndexedDB snapshot. |

On native targets, the engine does not fall back to the working directory. If the platform gives no absolute data folder, `open()` returns `storage_error`. On Unix-like systems the `{appId}` folder is created with owner-only permissions. Commits and imports report `ok` only after the data is stored. A full disk returns `quota_exceeded`.

On Web/WASM:

- Each open database runs in its own worker and takes an exclusive Web Locks API lock named after its `appId` and `name`. The Web Locks API is a browser feature that lets only one holder own a named lock at a time. A second tab that opens the same database gets `busy`. If the browser has no Web Locks API, persistent `open()` returns `storage_error`.
- OPFS, the origin private file system, is a private folder that the browser gives each site. The database uses it when the browser also offers synchronous access handles. OPFS mode also opens IndexedDB, where it keeps a recovery journal for `import()`.
- Without OPFS, the database lives in memory while open, and every committed write stores a full snapshot in IndexedDB. Large databases write more slowly in this mode.
- Browser storage is subject to quota and eviction. When a durable write fails, you get `quota_exceeded` or `storage_error`. Offer an export, and do not assume a retry will keep the data.
- Close each database when you finish so the browser can release its worker and memory.

## Next steps

- [2D production workflow](../../guides/2d-production-workflow/) shows a save game built on this API.
- [Web/WASM](../../platforms/web-wasm/) and [Apple platforms](../../platforms/apple/) cover platform setup.
- [Game loop](../../concepts/game-loop/) explains when `run()` starts and when it resolves.
