---
title: Migrate to BornEngine 0.6
description: Replace the flat 0.5 function-and-handle API with Game-owned classes and services.
section: Reference
order: 81
---

BornEngine 0.6 changes the public TypeScript surface to classes owned by a `Game`. The old free-function API has no compatibility aliases. Migrate the runtime owner first, then move each subsystem operation onto its service or resource instance.

## Application lifecycle

| 0.5 | 0.6 |
| --- | --- |
| `initWindow(width, height, title)` | `new Game({ window: { width, height, title } })` |
| `while (!windowShouldClose())` | `game.run({ update, render, onStop })` |
| `beginDrawing()` / `endDrawing()` | Managed by `Game.run()` |
| `closeWindow()` | `game.dispose()` |
| `runGame(update)` | `game.run({ update, render })` |
| `setWindowTitle(title)` | `game.window.setTitle(title)` |

## Services and resources

| 0.5 operation | 0.6 owner |
| --- | --- |
| `clearBackground(color)` | `game.renderer.clear(color)` |
| `drawRect(...)`, `drawText(...)` | `game.renderer.drawRectangle(...)`, `game.renderer.drawText(...)` |
| `loadTexture(path)` / `unloadTexture(texture)` | `new Texture(game, path)` / `texture.dispose()` |
| `loadModel(path)` / `unloadModel(model)` | `new Model(game, path)` / `model.dispose()` |
| `loadSound(path)` / `playSound(sound)` | `game.audio.loadSound(path)` / `sound.play()` |
| `loadMusic(path)` / `updateMusicStream(music)` | `game.audio.loadMusic(path)` / `game.audio.update(deltaTime)` |
| `isKeyDown(key)` | `game.input.isKeyDown(key)` |
| `new InputActionMap()` | `game.input.createActionMap()` |
| `createSceneNode()` / `setSceneNodeTrs(...)` | `game.sceneGraph.createNode()` / `node.setTrs(position, yaw, scale)` |
| `createWorld(options)` / `step(world, dt)` | `new PhysicsWorld(game, options)` / `world.step(dt)` |
| `pumpColyseusClients()` | Automatic during `game.run()` |

## Resource ownership changes

Construct runtime resources with their owning `Game`. Check `isLoaded` and `error` after fallible resource creation. Dispose resources when their lifetime ends; `Game.dispose()` also releases resources still registered with that game. A resource from a different game is rejected, and its native handle is no longer part of the public API.

The engine currently permits one active native runtime at a time. Dispose one `Game` before constructing the next. For host-owned native windows, use embedded mode and call `runFrame()` from the host scheduler.

## Migration sequence

1. Create `Game` and move window configuration into its options.
2. Split the old drawing loop into `update` and `render`; remove manual begin/end calls.
3. Move free functions to `game.renderer`, `game.input`, `game.audio`, or the owning resource class.
4. Replace public numeric handles with resource instances.
5. Add explicit disposal and startup/load error checks.

See the [quickstart](../../getting-started/quickstart/) and the subsystem references for complete class-first examples.
