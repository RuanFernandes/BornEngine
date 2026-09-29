# BornEngine Examples Modernization Design

## Goal

Make every runnable project already under `examples/` demonstrate the current BornEngine API and compile against the engine in this repository. Add two self-contained multiplayer examples with Perry clients and minimal Colyseus servers.

## Scope

- Update all current example projects under `examples/`, including the imported Bloom renderer samples, to use BornEngine package names, exports, types, ownership, and lifecycle.
- Keep each example's purpose and gameplay recognizable while changing the API surface it uses.
- Add exactly two multiplayer projects under `examples/`: an authoritative 2D arena and a room-messaging/chat example. Each project includes its own small server folder, instructions, and a client that uses the current BornEngine Colyseus API.
- Add a catalog and repeatable compile/smoke validation for the examples.
- Use the current engine `main` API as the source of truth. Make narrowly scoped engine changes only if a current example exposes a genuine API gap; otherwise keep this as example, test, and documentation work.

## Out of Scope

- Do not copy the separate `MeuGame` project into BornEngine, alter its files, or delete its repository.
- Do not change `bornengine-cli` or the engine's separate 3D architecture.
- Do not remove the engine's low-level renderer or FFI interfaces. Diagnostic examples may continue to call them when that is their purpose.
- Do not require game authentication, hosted matchmaking, deployment credentials, or external services for local multiplayer samples.

## Current Repository Findings

- The repository has 23 directories under `examples/`.
- The 2D platformer, top-down, sprite-animation, and physics/tilemap examples already use several current BornEngine systems.
- Many older gameplay and scene examples still use callback-driven entrypoints; `renderer-test` and `intel-sponza` still import `bloom/*` and contain Bloom-specific package names.
- `perry-embed` is intentionally driven by Perry's host frame scheduler and should keep using `Game.runFrame()`.
- `examples/colyseus-smoke` already exercises the engine's Colyseus facade but is not a playable multiplayer game.

## Design

### Example lifecycle and API migration

Runnable games use a `Game` subclass with `onStart()`, `loop(deltaTime)`, `render()`, and `onStop()` as appropriate. Gameplay state advances in `loop`; scene-owned gameplay calls `this.scenes.update(deltaTime)`, and rendering uses `this.renderer` or the active scene. Resource cleanup follows `Game`, `Scene`, and resource ownership APIs.

Use `Vector2D` for 2D domain values where the engine API accepts 2D positions, sizes, directions, or velocities. Use `GameObject`, `GameComponent`, `Scene`, `SpriteRenderer`, `SpriteAnimator`, `PhysicsWorld2D`, `Tilemap`, `CameraRig2D`, `AssetManager`, input maps, audio, storage, and UI in examples whose gameplay benefits from those systems. Keep 3D examples on the current 3D renderer and model APIs; this work migrates their BornEngine imports and lifecycle without redesigning 3D.

Every example directory remains a distinct runnable or diagnostic sample. Low-level renderer and screenshot tests retain their low-level focus, but use BornEngine package exports and must compile against this repository. The embedded Perry example retains host-owned scheduling and documents why it uses `runFrame()`.

Replace Bloom-only imports, module aliases, package names, and user-facing branding in example-owned files with the BornEngine surface. References to an upstream Perry symbol named `BloomView` are retained only where Perry itself requires that symbol; BornEngine integration code uses the engine's current native-surface API.

### Multiplayer examples

- `examples/multiplayer-arena/` is a small 2D authoritative arena. The client sends movement intent, the Colyseus server validates and simulates it, and each client displays room state keyed by session ID. It demonstrates reconnect/drop handling and current `Game`, scene, input, and sprite APIs.
- `examples/multiplayer-chat/` demonstrates joining a room, sending/receiving bounded text messages, showing room membership, and handling leave/reconnect. Its server validates message size and broadcasts messages; it does not trust client-authored room membership.
- Each directory contains a Perry client, a minimal TypeScript Colyseus server with its own package manifest and lockfile, and exact local run/test commands. Servers bind to localhost by default; the endpoint is configurable for LAN use.
- Existing `examples/colyseus-smoke/` remains a protocol and lifecycle smoke example and is migrated to the current `Game` lifecycle.
- The standalone `BornEngine-ExampleMultiPlayer` repository is retained until both new examples and their server/client checks pass; then remove its local checkout and delete its GitHub repository as explicitly requested.

### Catalog and validation

Add `examples/README.md` as the entrypoint for every sample, describing its purpose, requirements, working directory, and run/build command. Update stale per-example instructions so they match actual package names, imports, and the current CLI.

Provide a repeatable check that compiles each runnable Perry entrypoint against the local BornEngine package, detects stale Bloom aliases/removed imports, and runs the two multiplayer server contracts. Graphical samples are compile-checked rather than launched in headless CI. Keep server integration tests deterministic and local; no public server is required.

## Failure and lifecycle behavior

Examples handle expected startup failures through the current API's `error` and readiness properties, stop cleanly, and dispose game-owned clients, scenes, assets, audio, and other resources through their owners. Multiplayer clients display connection and room errors without assuming a join succeeded. Server handlers clamp or reject untrusted input before mutating shared state.

## Acceptance Criteria

1. Every existing runnable example under `examples/` uses the current BornEngine package/API and compiles with the repository's Perry toolchain.
2. No example-owned import or package manifest uses Bloom-only aliases such as `bloom/core` or `bloom/models`.
3. 2D gameplay samples use `Vector2D` and current scene/component APIs where appropriate; existing 3D samples remain focused on their existing 3D purpose.
4. `perry-embed` still uses a host-owned frame loop and compiles with `Game.runFrame()`.
5. The arena and chat examples each start from their local server, compile as BornEngine clients, and pass a two-client or equivalent server integration smoke that verifies shared room behavior and cleanup.
6. The sample catalog's commands work from the documented directories, and examples do not depend on `MeuGame`, another checkout, unpublished engine revisions, or absolute local paths.
7. The standalone multiplayer repository is not retired until the new examples pass their checks; the external `MeuGame`, CLI repository, and user's local lockfile remain unchanged.

## Review Risks

- Perry may expose API or standard-library differences that a TypeScript-only checker misses; Perry compilation is required for every entrypoint.
- Renderer diagnostic programs have large bespoke loops and screenshot behavior; migration must preserve their capture controls and deterministic setup.
- Native Colyseus callbacks are polled through the owning `Game`; samples must not reintroduce a separate unowned polling loop.
- Asset paths must resolve when launched from the documented project root, not only from the engine repository root.
- Two server samples can drift from existing Colyseus test fixtures; keep their contracts independently executable and document shared protocol behavior.
