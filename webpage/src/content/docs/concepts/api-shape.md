---
title: API shape
description: Where engine names are imported from, what each object owns, and which values are plain data.
section: Concepts
order: 12
---

BornEngine's API is organized around a few owners. The `Game` owns the services a program needs. A `Scene` owns the objects in one level. A game object owns its components. Most of the names you use come from the package root, and the less common modules come from subpaths.

## Imports

Import the common names from the package root:

```ts
import { Colors, GameComponent, GameObject, Key, Renderer, Scene, Texture, Vec3 } from '@bornengine/engine';
```

Import specialized modules from a subpath. Each subpath is a module with a narrower set of names:

| Import | Use it for |
| --- | --- |
| `@bornengine/engine/annotations` | `@Asset` and `@GameComponent<T>(options)` field decorators |
| `@bornengine/engine/audio` | `SoundManager`, sound and music helpers, buses |
| `@bornengine/engine/camera2d` | `CameraRig2D`, `Viewport2D`, parallax layers |
| `@bornengine/engine/colyseus` | Multiplayer client and rooms |
| `@bornengine/engine/input` | `InputActionMap` and input helpers |
| `@bornengine/engine/physics2d` | `PhysicsWorld2D`, `PhysicsBody2D`, `CharacterBody2D` |
| `@bornengine/engine/physics` | 3D physics world, bodies, and characters |
| `@bornengine/engine/scene` | The 3D `SceneGraph` and `SceneNode` |
| `@bornengine/engine/sprites` | `SpriteSheet`, `SpriteRenderer`, `SpriteAnimator` |
| `@bornengine/engine/storage` | `GameDatabase` and schema helpers |
| `@bornengine/engine/tilemap` | `Tilemap` |

The full list is in [API overview](../../api/).

Two names appear in more than one place, so check the import when you add a line:

- `GameComponent` is the base class you extend. It is exported from the root and from `@bornengine/engine/game`.
- `GameComponent()` is the decorator exported from `@bornengine/engine/annotations`. Pass the component class as the type argument, as in `@GameComponent<CameraRig2D>({ ... })`, to check the options and get autocomplete. A file that uses `@GameComponent` imports the decorator from there. Keep the base class in a different file, or import one of the two under another name.

`@bornengine/engine/scene` is the 3D scene graph. The `Scene` class you extend for levels comes from the root or from `@bornengine/engine/game`.

## Ownership

- **Game.** One `Game` owns the window, renderer, input, audio, scene manager, and assets. Only one `Game` can be active in a process. Services and resources created for another game are rejected.
- **Scene.** A scene owns its objects, its components, and its scene assets. Unloading the scene releases them.
- **Game object.** An object belongs to one scene, or to no scene before it is added. An object belongs to one parent, or to the scene directly.
- **Component.** A component belongs to exactly one game object.

Shared resources such as a UI font belong to `game.assets`. Level resources belong to `scene.assets`. The [assets concept](../assets/) explains the difference.

## Create resources through the owner

Create textures, sounds, fonts, and models through the asset manager, not with `new`. From a `Game` subclass, `this.assets.loadTexture('assets/player.png')` returns the texture for that path. The asset manager knows which game and scope the resource belongs to, and it caches the result by path. `Texture` has a private constructor, so `new` is not available for it.

## Classes and plain values

Objects that hold native state are classes with methods, such as `Texture`, `Sound`, `Model`, `PhysicsWorld2D`, and `ColyseusClient`. They have a lifecycle, so release them through their owner or with the `release` methods.

Plain data stays plain. A `Color` is an object with `r`, `g`, `b`, and `a` fields. A `Rect` is an object with `x`, `y`, `width`, and `height`. A `Vector2DLike` is any object with `x` and `y`. Pass object literals wherever these types are accepted.

`Vector2D` and `Vec3` are small mutable classes for math. Their fields are public, so you can write `position.x += speed`.

## Checking results

Loaders do not throw for missing files. A texture from `loadTexture` can exist with `isLoaded === false` and an `error` message. Check `isLoaded` before you draw it, or use the `@Asset` decorator, which throws during scene attachment instead. See [Assets](../assets/).

## Next steps

- [Scenes, objects, and components](../scenes-and-objects/) shows the lifecycle hooks.
- [Assets](../assets/) explains paths, caching, and release.
- [Core API](../../api/core/) lists the `Game` members.
