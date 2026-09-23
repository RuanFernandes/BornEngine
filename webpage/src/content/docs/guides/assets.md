---
title: Asset pipeline
description: Keep files portable across desktop, mobile, Apple bundles, and the browser build.
section: Guides
order: 63
---

Treat `assets/` as the stable boundary between project source and platform packaging:

```text
assets/
├── models/character.glb
├── textures/player.png
├── audio/jump.wav
├── fonts/ui.ttf
└── worlds/level1.world.json
```

Use relative paths from the project root in TypeScript. The native Apple layer resolves read paths from the application bundle, and the Web/WASM build copies the assets into `dist/web/`. Avoid relying on the process working directory or a developer-specific absolute path.

For models, glTF/GLB is the main path and OBJ is also recognized by the model loader. For audio, keep web compatibility in mind: WAV and OGG are supported, while MP3 is not on the web target. Preprocess images with the texture image helpers when you need a crop, resize, flip, or mipmap before upload.

Load long-lived resources once, retain their handles, and unload them when their scene or loading phase ends.
