---
title: World format
description: Author versioned world and prefab JSON that the editor and runtime can round-trip safely.
section: Guides
order: 62
---

A level is a `*.world.json`; a reusable composite is a `*.prefab.json`. Both use pretty-printed JSON and the current `schemaVersion: 2`.

| Block | Purpose |
| --- | --- |
| `environment` | Sky, sun, ambient, fog, and shadows |
| `terrain` | Heightmap and splat layers; nullable |
| `entities` | Model/prefab references, transform, tint, tags, and user data |
| `lights` | Point-light position, color, intensity, and range |
| `water` / `rivers` | Water volumes and Catmull–Rom river splines |
| `metadata` | String-to-string game-owned data |

Load with `loadWorld()`, then either let `instantiateWorld()` spawn the shared representation or walk the data yourself. Use `entity.userData` and `world.metadata` for game-specific values; unknown fields are warned about and can be dropped by the schema-explicit saver.

`loadWorld()` migrates older versions automatically. Files with a newer version fail validation instead of being silently misread. `applyWorldEnvironment()` must run every frame because lighting is cleared at frame start.
