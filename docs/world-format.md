# BornEngine World Format

This is the contract for any game that wants its levels to be authored in the
[Bloom world editor](https://github.com/Bloom-Engine/editor). A game that
follows it gets: a full 3D level editor (placement, terrain sculpt + splat
paint, water/rivers, lights, prefabs, undo everywhere), lossless round-trips
of its data, and play-in-editor. Nothing here requires reading another game's
source; this document is the spec. The reference consumer is
[`examples/world-viewer`](../examples/world-viewer/).

## 1. The files

A level is one `*.world.json`; a reusable composite object is one
`*.prefab.json`. Both are plain, pretty-printed JSON with a `schemaVersion`
(currently **2**). The schema's source of truth is
[`src/world/types.ts`](../src/world/types.ts) — every interface there is the
format. Summary:

| Block | What |
|---|---|
| `environment` | sky color, sun direction/color/intensity, ambient, linear fog, shadows toggle |
| `terrain` (nullable) | row-major heightmap (`width`×`depth`, `cellSize`, `origin`, `heights[]`) + splat `layers[]` (`textureRef`, per-cell `weights[]` 0..1) |
| `entities[]` | placed things: exactly one of `modelRef` (GLB path) / `prefabRef`, TRS transform (Euler radians), optional `tint`, `tags[]`, `userData{}` |
| `lights[]` | point lights (`position`, `color` 0-1, `intensity`, `range`) |
| `water[]` | axis-aligned box volumes with a wave-animated surface at `surfaceHeight` |
| `rivers[]` | Catmull-Rom splines with per-point `widths[]`, `depth`, `flowSpeed` |
| `metadata` | string→string map, yours to use (the editor also keeps its id counters here) |

Colors in world files are **0–1 floats** everywhere. (The runtime scene API
takes 0–255; the shared helpers convert — never convert twice.)

Load a file with `new WorldData(path).load()`. The class reads, parses, migrates,
and validates the document. Older schema versions are migrated automatically
(v1 worlds carrying `userData.kind === "point_light"` entities get them lifted
into `lights[]`); malformed files expose an error through `WorldData.error`.

## 2. Extension points — and what gets DROPPED

The saver is schema-explicit: it writes the fields it knows and nothing else.
An unknown field survives `loadWorld` (JSON keeps it) but is **silently absent
after the first save from the editor**. Both `WorldData.load()` and the editor warn
loudly when they see unknown fields (`listUnknownWorldFields`), naming each
one, before anyone can save.

Game-specific data therefore belongs in the three places that DO round-trip:

- **`entity.userData`** — string→string, discriminated however you like. The
  convention every existing consumer uses: `userData.kind` names what the
  entity *is* to your game (`"player_spawn"`, `"pickup"`, …), other keys carry
  parameters. All values are strings; parse them yourself.
- **`entity.tags[]`** — free strings; the editor edits them and games filter on
  them.
- **`world.metadata`** — world-level string→string.

Two `userData` conventions the editor understands (display only, never
semantics): `kind` picks the placeholder-box color for entities whose model is
missing or sentinel, and `halfExtents` (`"x, y, z"`) sizes that box. Games that
use different conventions lose nothing — placeholders just get a stable
hash-derived color and unit size.

## 3. `editor.project.json`

Drop one at your repo root and the editor can open your game. **Every key is
optional**; defaults in parentheses:

```json
{
  "name": "My Game",                     // ("Untitled Project") window title
  "gameId": "mygame",                    // ("") shown in the title bar
  "modelsDir": "assets/models",          // (that) flat dir of .glb/.gltf
  "prefabsDir": "assets/prefabs",        // (that) *.prefab.json
  "worldsDir": "assets/worlds",          // (that)
  "texturesDir": "assets/textures",      // (that) splat-layer sources, listed not loaded
  "defaultWorld": "level1.world.json",   // ("") opened at launch
  "playCommand": "main.exe",             // ("") enables the Play button — see §4
  "kindColors": {                        // (none) placeholder colors for YOUR kinds
    "spawn_point": "90, 220, 120"        // "r, g, b" 0-255
  }
}
```

The editor finds the file by walking up from its CWD, or takes
`--project <path>` explicitly; `--world <path>` opens a single world with or
without a project. A world opened with no project still edits and saves
losslessly — it just renders model-less placeholder boxes (no catalog).

## 4. Play-in-editor: the `--world` contract

The editor's Play button saves the current level to a scratch world file and
runs your `playCommand` with `--world <path>` appended, from your project
root. To opt in: accept that flag and load the given world instead of your
default. That's the whole contract. (The shooter's `worldFromArgs` in
`src/world-runtime.ts` is a 9-line reference.)

## 5. Consuming worlds at runtime

Two proven shapes:

**Generic path** (shortest; the world-viewer example is exactly this):

```ts
import { Game, Model, WorldData } from '@bornengine/engine';

const game = new Game();
const models = new Map<string, Model>();
const data = new WorldData('assets/worlds/level1.world.json');
if (!data.load()) {
  console.error(data.error || 'World load failed');
} else {
  const instance = data.instantiate(game, {
    getModel(path) {
      let model = models.get(path);
      if (model === undefined) {
        model = new Model(game, path);
        models.set(path, model);
      }
      return model.isLoaded ? model : null;
    },
    prefabs: null,
  });

  if (!instance.isLoaded) {
    console.error(instance.error);
  } else {
    game.run({
      update() {},
      render() { instance.applyLighting(); },
      onStop() {
        instance.dispose();
        game.dispose();
      },
    });
  }
}
```

`WorldData.instantiate()` creates game-owned nodes for terrain, entities (prefabs expanded, cycles
rejected), water volumes, and river ribbons through the same shared helpers
the editor renders with — a river cannot look different in-game than in the
editor. **`WorldInstance.applyLighting()` must run every frame**: the renderer clears its lighting block at frame start, so applying
the environment once lights exactly one frame. `WorldInstance.dispose()` releases the runtime nodes when replacing the level; cached models remain owned by the Game.

**Own spawn code** (full control; what the shooter does): load a `WorldData`
instance, read its `document`, then walk `document.*` yourself and feed your own
systems — physics colliders from `userData`, flat arrays, whatever your game
wants. You own the semantics; the editor still round-trips the data losslessly.

## 6. Versioning promises

- `WORLD_SCHEMA_VERSION` bumps only with a migration in
  [`src/world/version.ts`](../src/world/version.ts); old files keep loading.
- Files claiming a NEWER version than the engine fail validation loudly —
  never silently misread.
- The editor's self-test suite round-trips real shipped worlds
  (`WorldData.load() → WorldData.save() → deep-compare`); any normalization the saver
  applies to untouched data is treated as a bug there, not a tolerance.
