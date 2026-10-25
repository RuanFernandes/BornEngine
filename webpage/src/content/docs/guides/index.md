---
title: Guides
description: Task-focused pages that combine several BornEngine modules, from physics and assets to complete game recipes.
section: Guides
order: 0
---

A guide shows how several parts of the engine work together to finish one job. The [API reference](../api/) describes each module on its own. A guide gives you working code for a task and explains the choices in it.

## Start here

If you are new to BornEngine, build the player in [Your first player](../getting-started/first-player/) first. It makes a player that moves with the keyboard, draws a sprite, and is followed by a camera. Along the way it introduces four ideas that every guide on this page assumes: `Game`, `Scene`, `GameObject`, and `GameComponent`.

## Systems and formats

- [Physics](physics/) steps a 3D Jolt world and covers queries, contacts, characters, vehicles, soft bodies, and joints.
- [Skeletal animation](skeletal-animation/) exports a rigged character to GLB, loads it, and draws it with GPU skinning.
- [World format](world-format/) documents the versioned JSON for 2D maps, 3D worlds, and prefabs.
- [Asset pipeline](assets/) explains how asset paths resolve on desktop, mobile, Apple bundles, and the browser.
- [Runtime debugging](debugging/) turns on the inspector and adds your own developer windows.
- [Build a retained GUI](gui-controls/) organizes reusable controls, handles events, and styles them with profiles.
- [Build a multiplayer game with Colyseus](multiplayer/) connects a client to an authoritative server.

## 2D guides

- [2D production workflow](2d-production-workflow/) takes a Tiled room to a tested, packaged 2D game.
- [Migrating a 2D game to the class-first API](migrating-2d-api/) moves a function-driven loop to `Game`, `Scene`, and `GameObject`.

## Composition recipes

These end-to-end recipes show how the modules fit together in a real game loop.

- [Build a 2D game](2d-game/) uses a `Game` subclass, scene components, sprite animation, and particle effects.
- [2D physics and tilemaps](physics2d-tilemap/) builds a level from atlas tiles and a fixed-step physics world.
- [Reusable sprite animation templates](sprite-animation-templates/) binds your own images to shared layered clips.
- [Add physics gameplay](physics-gameplay/) steps an owned physics world and syncs bodies with game objects.
- [Add audio and UI](audio-and-ui/) uses the game's audio and UI services for menus and HUDs.
- [Build a 3D scene](3d-scene/) sets up a camera, models, and retained scene nodes.
- [Organize assets and worlds](assets-and-worlds/) loads resources once and instantiates validated world data.
- [JSON blueprints](blueprints/) defines data-driven game content with versioned templates.

Pick the recipe closest to the game you are building. Return to the [API reference](../api/) when you need the full list of calls for a module.
