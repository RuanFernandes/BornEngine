---
title: Web / WASM
description: Build a BornEngine game for the browser with WebAssembly and WebGPU, and learn how the loop, assets, features, and saves differ from native targets.
section: Platforms
order: 54
---

The Web target runs your game in a browser. Perry compiles your TypeScript to a WebAssembly (WASM) module, and the engine itself is a second WASM module built from the Rust Web crate. A small JavaScript file joins the two and connects them to browser features: the canvas, keyboard, mouse, and touch events, asset fetching, and Web Audio.

The Web target does not support every native feature. This page shows how to build and serve a game, how it behaves, and what is missing.

## Build

The build is a shell script in the BornEngine repository, `native/web/build.sh`. Run it from a clone of the repository. The published npm package contains the script but not every file it copies, such as `splice_game.py` and the SQLite worker sources, so the script does not work from `node_modules`.

You need:

- a clone of the repository, checked out at the tag that matches the `@bornengine/engine` version in your game (for example `git checkout v0.18.2`), so that the game and the engine module use the same native function list;
- Rust with the `wasm32-unknown-unknown` target, and [wasm-pack](https://wasm-bindgen.github.io/wasm-pack/installer/);
- Node.js and npm, because the first run executes `npm ci` in `native/web` to install the bundler and the SQLite WASM files, which needs network access;
- Python 3;
- Perry, available as `perry` on your `PATH`;
- a browser with WebGPU to open the result.

```sh
git clone https://github.com/RuanFernandes/BornEngine
cd BornEngine
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
export PATH="$(dirname "$(bornengine perry path)"):$PATH"
./native/web/build.sh --dev /path/to/my-game/main.ts --output /path/to/my-game/dist/web
cd /path/to/my-game/dist/web && python3 -m http.server 8080
```

Open `http://localhost:8080`. Serve the folder over HTTP: the page loads module scripts, a worker, and asset files, which a browser does not allow from a `file://` address.

The script does three things:

1. It builds the engine module (`bloom_web.wasm`) with `wasm-pack`.
2. It compiles your game with `perry <game.ts> --target wasm`.
3. It assembles the output folder, splices the engine bootstrap into Perry's HTML page, and copies the `assets/` folder that sits next to your entry file.

`--dev` skips `wasm-opt`, a tool that shrinks WebAssembly files, for faster rebuilds. `--release` is the default and optimizes the engine module for size with `wasm-opt -Oz`. `--output DIR` chooses the output folder; without it the script writes to `dist/web` inside the repository clone. A build replaces the generated files in the output folder (`index.html`, `pkg/`, `assets/`, and the bridge and worker files), so keep your own files elsewhere.

The CLI can also ask Perry for a Web build with `bornengine build main.ts --os web` (or `--target wasm`), but it does not run `build.sh`. It does not build the engine module or splice in the bootstrap, and its output has not been verified to run a BornEngine game. Use the script. The CLI's native profile settings never apply to Web builds.

## Game loop and browser APIs

A browser cannot let game code block the page. When you call `Game.run()` on Web, the game hands the frame loop to the browser, which calls your hooks once per animation frame (`requestAnimationFrame`) and then returns right away. On native targets `run()` blocks until the game ends. The hooks and their order are the same on both:

```ts
import { Colors, Game } from '@bornengine/engine';

class BrowserGame extends Game {
  private angle = 0;

  constructor() {
    super({ window: { title: 'Browser game', width: 800, height: 450 } });
  }

  protected override loop(deltaTime: number): void {
    this.angle += deltaTime;
  }

  protected override render(): void {
    const width = this.input.getScreenWidth();
    const height = this.input.getScreenHeight();
    const center = {
      x: width / 2 + Math.cos(this.angle) * 120,
      y: height / 2 + Math.sin(this.angle) * 120,
    };
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawCircle(center, 24, Colors.ORANGE);
    this.renderer.drawText(`Canvas: ${width} x ${height}`, { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new BrowserGame().run();
```

The code is the same as a native game. These points differ in the browser:

- **The canvas fills the page.** The generated page stretches the canvas over the whole browser window and resizes it when the window changes. The `width` and `height` in your window options do not set its size, and the `fullscreen` option is ignored. Read `game.input.getScreenWidth()` and `getScreenHeight()` for the real size, as the example does, or use a `Viewport2D` to keep a fixed logical size.
- **The window title is the page title.** `window.title` and `setTitle()` set `document.title`.
- **The browser sets the frame rate.** `targetFps` has no effect on Web. The loop runs once per animation frame, usually at the display's refresh rate. Use `deltaTime` for movement.
- **Fullscreen needs a gesture.** `game.window.toggleFullscreen()` asks the browser for fullscreen, and the browser refuses unless a key press or click triggered the call. The engine ignores the refusal.
- **Input.** Keyboard, mouse (with the wheel and pointer lock), and touch events work. The bootstrap does not read the browser's Gamepad API, so physical gamepads are not available. On-screen controls from `game.mobile` still work.
- **Audio starts after the first input.** Browsers keep an audio context suspended until the player presses a key or clicks. The engine resumes audio on the first key press or pointer press, so sounds before that are silent.
- **A frame error stops the game.** If your code throws in `onStart()`, `loop()`, or `render()`, the engine stops the game and stores the message in `game.error`, as it does on native targets.

### Rendering needs WebGPU

The engine draws with WebGPU. Before it starts the renderer, the bootstrap checks for the API and for a usable adapter. If the check fails, the page shows `Failed to start:` followed by one of these messages, and the console logs `[bloom] bootstrap failed:`:

- `This browser has no WebGPU support. Use a current Chrome/Edge (113+) or Firefox (141+).`
- `No WebGPU adapter available. Check chrome://gpu — hardware acceleration must be enabled and the GPU not blocklisted.`
- `WebGPU device setup timed out. Check chrome://gpu — a WebGPU adapter is required (hardware acceleration on, GPU not blocklisted).`

The engine's Web crate also lists a WebGL fallback, but the bootstrap fails before that code can run, so treat WebGPU as required. Whether it is available depends on the browser, the operating system, the GPU, and the hardware-acceleration setting. Check that your target browsers can create an adapter before you ship.

## Assets and support

**Asset files.** The page loads files from the folder it is served from, so keep asset paths relative to the project, as in `assets/player.png`. The engine reads images (PNG, JPEG, BMP, and TGA), audio (WAV and OGG), models (glTF and GLB), and fonts (TTF and OTF). MP3 decoding is not supported on Web.

**Loading is synchronous.** Your code asks for a file and gets it back in the same call, so the bootstrap fetches files with blocking requests unless it has them in a cache. If a file named `assets_manifest.json` sits next to the page, the bootstrap reads it first and prefetches the files it lists while it shows a progress counter. The build script does not create that manifest. Without one, each asset is fetched when your code first asks for it.

**File helpers use browser storage.** On Web, `game.input.writeFile()` stores text in the page's `localStorage`, and `readFile()` and `fileExists()` look there first and then in the served files. On native targets the same calls use the file system.

**3D physics comes from JoltPhysics.js.** At startup the bootstrap loads `jolt-physics.mjs` from the page's folder, and if that file is missing it loads JoltPhysics.js from the jsDelivr CDN. The build script does not copy a local `jolt-physics.mjs`, so a built page needs network access for 3D physics unless you add the file yourself. If loading fails, the console shows `[bloom] Jolt init failed:` and calls to the 3D physics API do nothing.

**Features that are missing or limited on Web:**

- No physical gamepads, as above.
- No clipboard, file dialogs, or window icon. They return an empty string or do nothing.
- No debug UI inspector, because the Dear ImGui backend is a desktop feature.
- No path tracing. `renderer.setPathTracing()` has no effect, because it needs hardware ray queries that WebGPU does not offer.
- No GPU timings in the profiler. They read as zero.
- The present-mode selector does nothing, because the browser controls presentation.
- These renderer calls have no Web implementation: `setBloomIntensity()`, `setTonemap()`, `setSharpenStrength()`, `setAutoExposureKey()`, and `setAutoExposureRate()`.
- These scene node calls have no Web implementation: `SceneNode.setTrs()` and `updateGeometry()`.
- No embedded host surface. `game.window.attachNativeSurface()` returns `false`.

The repository's check that every platform matches the native function list (`tools/validate-ffi.js`) records path tracing, the post-processing controls, and the scene node calls as known Web gaps. Perry's web runtime source replaces a missing native function with one that does nothing; this was read in the source, not run in a browser.

Multiplayer works through the official Colyseus JavaScript SDK, which the build script bundles as `colyseus_bridge.bundle.js`.

## SQLite persistence

`GameDatabase` works on Web without any build option. Each open database runs SQLite (the official SQLite WASM build) inside its own Web Worker, and the worker handles one request at a time. The worker is created from `sqlite_database_worker.js`, and it loads `sqlite3.wasm` from the same folder. Both files must be served next to `index.html`; the build script copies them there. Close each database when you are done, because a database that stays open keeps its worker and its memory.

Persistent mode is the default. It stores data in one of two places:

- **Origin Private File System (OPFS).** The worker uses OPFS when the browser offers it, including synchronous file access handles. Before it replaces an OPFS database during `import()`, it saves a copy of the current database in IndexedDB. If the page or worker stops during the replacement, the next open restores that copy first. If the copy cannot be saved, the import fails before it changes the database.
- **IndexedDB.** When the browser does not support OPFS, the worker keeps the whole database as an image in IndexedDB. An OPFS error, or damage to an OPFS database, is reported as an error and does not switch silently to a new empty store.

The engine takes an exclusive Web Lock for each database identity, so only one tab writes to a database at a time. A second tab that opens the same database gets the `busy` status.

```ts
import { columns, defineMigration, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

const schema = defineSchema({
  saves: defineTable({
    columns: {
      slot: columns.text({ primaryKey: true }),
      data: columns.text({ notNull: true }),
    },
  }),
});

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('saves', schema.saves.columns);
  }),
];

const database = new GameDatabase({
  appId: 'org.example.browsergame',
  name: 'saves',
  schema,
  migrations,
});

export async function openSaves(): Promise<boolean> {
  const opened = await database.open();
  if (opened.ok) return true;
  if (opened.status === 'busy') console.warn('Another tab already has this save open.');
  else if (opened.status === 'quota_exceeded') console.warn('The browser has no storage left for this site.');
  else console.warn(`Could not open the save database: ${opened.status}`);
  return false;
}
```

Browser storage has limits. A browser can refuse a write when the site is over its quota (`quota_exceeded`) or when storage fails for another reason (`storage_error`), and it can clear a site's data at any time. A successful write is not a backup. Offer `export()` so players can keep a copy of their save, and check the status of every call.

`inMemory: true` selects volatile storage on purpose. The engine never uses it as a silent fallback. The database file is not encrypted, so keep passwords and tokens out of it.

See [Database and migrations](../../api/storage/) for schemas, transactions, and import and export.

## Next steps

- [Platforms](../) compares every target.
- [Game loop](../../concepts/game-loop/) explains the hooks used above.
- [Assets](../../concepts/assets/) explains asset paths and ownership.
- [Database and migrations](../../api/storage/) documents `GameDatabase` in full.
- [Troubleshooting](../../troubleshooting/) lists the errors you may meet on Web.
