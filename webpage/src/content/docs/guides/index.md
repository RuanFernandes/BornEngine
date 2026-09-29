---
title: Guides
description: Focused paths for physics, assets, skeletal animation, and world files.
section: Guides
order: 0
---

Use these guides when the API reference is not enough context for a complete system.

- [Physics](physics/) — step the simulation and structure gameplay bodies.
- [2D physics and tilemaps](physics2d-tilemap/) — combine a fixed-step 2D world, scene bodies, atlas tiles, and collision rectangles.
- [Skeletal animation](skeletal-animation/) — export GLB assets and drive animation layers.
- [World format](world-format/) — author versioned 3D worlds and 2D tilemap/object documents.
- [Assets](assets/) — package runtime files across native and Web/WASM targets.
- [Runtime debugging](debugging/) — enable the optional inspector and add diagnostic windows.
- [2D production workflow](2d-production-workflow/) — author, validate, save, and package a 2D game world.
- [Migrate the 2D API](migrating-2d-api/) — move gameplay into `Game`, `Scene`, `GameObject`, and `Vector2D`.

## Composition recipes

These end-to-end paths show how the modules fit together in a real game loop:

- [Build a 2D game](2d-game/) — class-first scenes, sprite animation, marker-driven effects, and a HUD.
- [Build a 3D scene](3d-scene/) — cameras, primitives, scene nodes, and cleanup.
- [Add physics gameplay](physics-gameplay/) — fixed stepping, contacts, and render synchronization.
- [Organize assets and worlds](assets-and-worlds/) — stable paths, prefabs, model caches, and world lighting.
- [Add audio and UI](audio-and-ui/) — music streaming, sound effects, measured text, and input-driven panels.
- [Build a multiplayer game with Colyseus](multiplayer/) — set up the server and connect BornEngine clients to authoritative shared state.

Start with the recipe closest to the game you are building, then return to the [API map](../api/) when you need the complete function surface.
