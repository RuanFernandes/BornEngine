---
title: Migrate to the class-first API
description: Replace the flat function-and-handle API with Game-owned classes, services, and current persistence APIs.
section: Reference
order: 81
---

BornEngine 0.6 introduced the class-first public TypeScript surface; the current API continues that model and has no compatibility aliases for the old free-function API. Migrate the runtime owner first, then move each subsystem operation onto its service or resource instance. Use the current API reference for additions made after 0.6.

## Application lifecycle

| 0.5 | 0.6 |
| --- | --- |
| `initWindow(width, height, title)` | `new Game({ window: { width, height, title } })` |
| `while (!windowShouldClose())` | `game.run()` on a `Game` subclass |
| `beginDrawing()` / `endDrawing()` | Managed by `Game.run()` |
| `closeWindow()` | `game.dispose()` |
| `runGame(update)` | `game.run()` on a `Game` subclass |
| `setWindowTitle(title)` | `game.window.setTitle(title)` |

## Services and resources

| 0.5 operation | 0.6 owner |
| --- | --- |
| `clearBackground(color)` | `game.renderer.clear(color)` |
| `drawRect(...)`, `drawText(...)` | `game.renderer.drawRectangle(...)`, `game.renderer.drawText(...)` |
| `loadTexture(path)` / `unloadTexture(texture)` | `game.assets.loadTexture(path)` / `game.assets.releaseTexture(path)` |
| `loadModel(path)` / `unloadModel(model)` | `game.assets.loadModel(path)` / `game.assets.releaseModel(path)` |
| `loadSound(path)` / `playSound(sound)` | `game.audio.loadSound(path)` / `sound.play()` |
| `loadMusic(path)` / `updateMusicStream(music)` | `game.audio.loadMusic(path)` / `game.audio.update(deltaTime)` |
| `isKeyDown(key)` | `game.input.isKeyDown(key)` |
| `new InputActionMap()` | `game.input.createActionMap()` |
| `createSceneNode()` / `setSceneNodeTrs(...)` | `game.sceneGraph.createNode()` / `node.setTrs(position, yaw, scale)` |
| `createWorld(options)` / `step(world, dt)` | `new PhysicsWorld(game, options)` / `world.step(dt)` |
| `pumpColyseusClients()` | Automatic during `game.run()` |

## Resource ownership changes

Create assets through their owner scope: use `game.assets` for resources shared across scenes and `scene.assets` for resources released when a scene unloads. For example, use `game.assets.loadTexture(path)` rather than constructing a `Texture` with a Game; `Texture` has no public constructor. Some context-bound systems, including `PhysicsWorld` and `ColyseusClient`, still receive their owning `Game`. Check `isLoaded` and `error` after fallible resource creation. Dispose manually created resources when their lifetime ends; the owning Game and Scene managers release resources they still own. A resource from a different Game is rejected, and its native handle is not part of the public API.

The engine currently permits one active native runtime at a time. Dispose one `Game` before constructing the next. For host-owned native windows, use embedded mode and call `runFrame()` from the host scheduler.

## 2D camera and coordinates

`Camera2D` remains a plain record for direct `renderer.begin2D(camera)` passes. For a scene camera that follows a target, attach `CameraRig2D` to a `GameObject` and bind it with `scene.bindCameraRig2D(rig)`. Set `scene.viewport2D` to a `Viewport2D` when the game uses a fixed logical resolution. Input conversion then uses the active scene camera and viewport by default; a caller may still pass an explicit camera. Positions inside letterbox bars return `null` from `screenToWorld()`.

The existing full-window coordinate behavior stays in place when `viewport2D` is unset. See the [2D camera API](../../api/camera2d/) for dead zones, bounds, zoom, shake, scale modes, and parallax.

## Migration sequence

1. Create `Game` and move window configuration into its options.
2. Move the old drawing loop into a subclass `loop(deltaTime)` and `render()`; remove manual begin/end calls.
3. Move free functions to `game.renderer`, `game.input`, `game.audio`, or the owning resource class.
4. Replace public numeric handles with resource instances.
5. Add explicit disposal and startup/load error checks.

See the [quickstart](../../getting-started/quickstart/) and the subsystem references for complete class-first examples.

## Current lifecycle and data APIs

The class-first API has no overload for the old callback runner or JSON storage helper. Update those calls while moving to the current runtime:

The old `GameStorage` API is removed. `GameDatabase` is the current typed persistence API.
The callback overload `Game.run(callbacks)` is removed; standalone games use subclass lifecycle hooks and `Game.run()` without arguments.

| Removed API | Current API |
| --- | --- |
| `game.run({ update, render, onStop })` / `Game.run(callbacks)` | Subclass `Game`, override `loop()`, `render()`, and `onStop()`, then call `game.run()` with no arguments. `runFrame()` is reserved for an embedded host that owns the surface and scheduler. |
| `GameStorage`, `createGameStorage()`, `GameStorageBackend` | `GameDatabase` with `defineSchema()`, explicit `defineMigration()` entries, and typed CRUD/transaction methods. |
| JSON records in `localStorage` | SQLite rows. Persistent mode is the default on supported targets; use `inMemory: true` only when volatile storage is intended. |

`Game.run()` resolves after `onStop()` and owned-resource cleanup. Lifecycle failures are reported in `game.error`; inspect it after awaiting the Promise. See [Core](../../api/core/) for lifecycle details and [Database and migrations](../../api/storage/) for schema, migration, and cross-platform persistence examples.
