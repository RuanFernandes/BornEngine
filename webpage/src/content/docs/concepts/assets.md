---
title: Assets
description: Organize textures, audio, fonts, models, and world files so each target can package and resolve them.
section: Concepts
order: 12
---

Use paths relative to the project asset root:

```ts
import { loadTexture, loadSound, loadModel, loadFont } from '@bornengine/engine';

const player = loadTexture('assets/player.png');
const jump = loadSound('assets/jump.wav');
const level = loadModel('assets/scene.glb');
const uiFont = loadFont('assets/ui.ttf', 20);
```

The engine supports PNG, JPEG, BMP, and TGA images; WAV and OGG audio on Web/WASM; glTF/GLB models; and TTF/OTF fonts. MP3 is not supported on the web target.

## Keep paths portable

Native Apple targets resolve read paths against the application bundle rather than the process working directory. Web builds fetch from the served output, so the path must exist below the directory you serve. Put files under `assets/` and let the build copy them rather than reaching into a machine-specific absolute path.

## Loading strategy

Load long-lived resources during a loading phase, reuse their handles, and unload them when the owning scene ends. The async and staging helpers in the texture, model, and audio modules are useful when a project needs to prepare several assets without blocking one large step.

For authored levels, prefer the versioned [world format](../guides/world-format/) so the editor and runtime can share data without inventing a second serialization shape.
