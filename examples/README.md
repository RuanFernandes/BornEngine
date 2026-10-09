# BornEngine Examples

These samples target the current BornEngine API from this repository. Game examples use a `Game` subclass; the engine's TypeScript package is referenced locally so changes in the repository are compiled directly.

## Requirements and checks

- Install the Perry compiler and the native toolchain for the target platform. Some graphics samples also load the assets stored in their own example directory.
- Install the existing `bornengine` CLI from the separate `bornengine-cli` project; its README documents installation and host requirements.
- Run `npm install` in a sample's package directory before its first build. Multiplayer servers have separate manifests and lockfiles; use the commands in that sample's README.
- The [`scripting-sandbox`](./scripting-sandbox/) uses a pnpm workspace; install its dependencies from that example's directory with `pnpm install`.
- From the repository root, run `npm run examples:check:static` for the API/import audit and validator tests, or `npm run examples:check` to compile the Perry entrypoints and run both multiplayer server test suites. The compile check uses `--no-link`, so it validates TypeScript and Perry code generation without claiming a native game launch.
- The scripting sandbox has React/Monaco and built-in docs, plus browser and native game clients. Run `pnpm check`, `pnpm test`, `pnpm e2e`, and `pnpm native:check` from `scripting-sandbox/`.
- Launch graphical samples from their example directory so relative asset paths resolve as documented.

For a standard native sample, build and launch from its directory:

```sh
npm install
bornengine run main.ts
```

Use the entrypoint listed below instead of `main.ts` for the scene-graph programs. Platform-specific samples may have additional commands in their local README.

## 2D games

| Example | What it demonstrates | Entrypoint |
| --- | --- | --- |
| [`2d-platformer`](./2d-platformer/) | Side-scrolling movement, jumping, collision, and audio | `main.ts` |
| [`2d-top-down`](./2d-top-down/) | Top-down movement, input, and camera behavior | `main.ts` |
| [`dungeon-crawl`](./dungeon-crawl/) | Grid-based dungeon movement and encounters | `main.ts` |
| [`isometric-rpg`](./isometric-rpg/) | Isometric world movement and interaction | `main.ts` |
| [`physics2d-tilemap`](./physics2d-tilemap/) | Tilemaps, 2D physics, and scene components | `main.ts` |
| [`pong`](./pong/) | A compact two-paddle arcade game | `main.ts` |
| [`space-blaster`](./space-blaster/) | Scrolling shooter movement and projectile gameplay | `main.ts` |
| [`sprite-animation`](./sprite-animation/) | Sprite sheets, animation states, and effects | `main.ts` |
| [`voxel-sandbox`](./voxel-sandbox/) | Editable voxel terrain and 3D camera controls | `main.ts` |

## 3D scenes and renderer diagnostics

| Example | What it demonstrates | Entrypoint |
| --- | --- | --- |
| [`bistro`](./bistro/) | Loading and rendering the Bistro model scene | `main.ts` |
| [`intel-sponza`](./intel-sponza/) | Sponza rendering and GPU diagnostics | `main.ts` |
| [`kart-racer`](./kart-racer/) | A 3D kart and vehicle controls | `main.ts` |
| [`pbr-spheres`](./pbr-spheres/) | Physically based materials and lighting | `main.ts` |
| [`renderer-test`](./renderer-test/) | Low-level renderer regression and screenshot checks | `main.ts` |
| [`scene-graph`](./scene-graph/) | Scene nodes, rooms, shadows, and interaction | `main.ts`, `interactive.ts`, `room.ts`, `shadows.ts` |
| [`sponza`](./sponza/) | Loading and navigating the Sponza scene | `main.ts` |
| [`test-gltf-watch`](./test-gltf-watch/) | glTF asset reload and rendering checks | `main.ts` |
| [`test-scene-watch`](./test-scene-watch/) | Scene reload and rendering checks | `main.ts` |
| [`test3d`](./test3d/) | Core 3D rendering and input smoke | `main.ts` |
| [`world-viewer`](./world-viewer/) | Loading, inspecting, and saving BornEngine world data | `main.ts` |

## Platform and integration samples

| Example | What it demonstrates | Entrypoint |
| --- | --- | --- |
| [`colyseus-smoke`](./colyseus-smoke/) | Colyseus connection, room lifecycle, and math smoke checks | `main.ts`, `lifecycle-smoke.ts`, `math-smoke.ts` |
| [`perry-embed`](./perry-embed/) | Embedding a BornEngine native surface in Perry's host-owned UI loop | `main.ts`; see its README |
| [`ui-smoke`](./ui-smoke/) | BornEngine UI and input integration | `main.ts` |

## Scripting sample

| Example | What it demonstrates | Entry point |
| --- | --- | --- |
| [`scripting-sandbox`](./scripting-sandbox/) | React/Monaco script manager, built-in docs, QuickJS-isolated client scripts, revisioned Colyseus hot reload, browser preview, Perry-native Linux multiplayer client, and trusted server rules | Browser workbench and `native-client/main.ts`; see its README |

## Multiplayer samples

Both multiplayer examples include a BornEngine client and a separate local Colyseus server. Start the server in its own terminal, then compile and launch the client as described in the sample README. The default server address is localhost; each README explains how to select a LAN address.

| Example | What it demonstrates | Server contract |
| --- | --- | --- |
| [`multiplayer-arena`](./multiplayer-arena/) | Authoritative 2D movement and room state shared by clients | Client sends input intent; server validates and simulates movement |
| [`multiplayer-chat`](./multiplayer-chat/) | Room membership and bounded message exchange | Server validates messages and owns membership state |
