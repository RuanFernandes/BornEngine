---
title: Guides
description: Focused paths for physics, assets, skeletal animation, and world files.
section: Guides
order: 0
---

Use these guides when the API reference is not enough context for a complete system.

- [Physics](physics/) — step the simulation and structure gameplay bodies.
- [Skeletal animation](skeletal-animation/) — export GLB assets and drive animation layers.
- [World format](world-format/) — keep authored levels portable and explicit.
- [Assets](assets/) — package runtime files across native and Web/WASM targets.

## Composition recipes

These end-to-end paths show how the modules fit together in a real game loop:

- [Build a 2D game](2d-game/) — input, sprites, collision helpers, and a HUD.
- [Build a 3D scene](3d-scene/) — cameras, primitives, scene nodes, and cleanup.
- [Add physics gameplay](physics-gameplay/) — fixed stepping, contacts, and render synchronization.
- [Organize assets and worlds](assets-and-worlds/) — stable paths, prefabs, model caches, and world lighting.
- [Add audio and UI](audio-and-ui/) — music streaming, sound effects, measured text, and input-driven panels.
- [Build a multiplayer game with Colyseus](multiplayer/) — set up the server and connect BornEngine clients to authoritative shared state.

Start with the recipe closest to the game you are building, then return to the [API map](../api/) when you need the complete function surface.
