---
title: Add audio and UI
description: Build a responsive HUD with keyboard input, measured text, sound effects, and streamed music.
section: Guides
order: 74
---

Audio and UI are both frame-facing systems: initialize resources once, read input during the update phase, update streaming music, then draw the HUD after the world. This recipe uses the default font so it works before you build a custom font pipeline.

## Setup

Initialize the window and audio device at the application boundary. Keep short effects and music handles in state rather than loading them from inside the frame callback.

```ts
import { initWindow } from '@bornengine/engine/core';
import { initAudio, loadMusic, loadSound } from '@bornengine/engine/audio';

initWindow(960, 540, 'Audio UI Demo');
initAudio();

const selectSound = loadSound('assets/audio/ui-select.wav');
const music = loadMusic('assets/audio/ambient.ogg');
```

WAV and OGG are the safe web choices documented by the audio surface. Keep both files under `assets/` so the CLI includes them in native and Web/WASM builds.

## Game loop

Use edge-triggered `isKeyPressed()` for UI actions and `isKeyDown()` for held state. `updateMusicStream()` belongs in every frame while music is active. Measure text before drawing centered or right-aligned labels.

```ts
import {
  Key, beginDrawing, clearBackground, endDrawing,
  isKeyDown, isKeyPressed, runGame,
} from '@bornengine/engine/core';
import {
  playSound, updateMusicStream, setMasterVolume,
} from '@bornengine/engine/audio';
import { drawRect } from '@bornengine/engine/shapes';
import { drawText, measureText } from '@bornengine/engine/text';

let score = 0;
let muted = false;

runGame(() => {
  if (isKeyPressed(Key.SPACE)) {
    score += 10;
    playSound(selectSound);
  }
  if (isKeyPressed(Key.M)) {
    muted = !muted;
    setMasterVolume(muted ? 0 : 1);
  }
  updateMusicStream(music);

  beginDrawing();
  clearBackground({ r: 10, g: 14, b: 20, a: 255 });
  drawRect(24, 24, 280, 92, { r: 0, g: 0, b: 0, a: 160 });
  const label = `Score ${score}`;
  drawText(label, 44, 44, 24, { r: 255, g: 255, b: 255, a: 255 });
  const hint = isKeyDown(Key.SPACE) ? 'Firing' : 'Space to fire · M to mute';
  drawText(hint, 44, 78, 16, { r: 184, g: 242, b: 61, a: 255 });
  console.log('HUD width', measureText(label, 24));
  endDrawing();
});
```

Draw the game first and the HUD last so UI remains in screen coordinates. `measureText()` returns the default-font width; `measureTextEx()` and `drawTextEx()` are the corresponding custom-font path.

## Complete example

This single file has input-driven audio, a measured centered title, a small status panel, and explicit teardown. Add gameplay between the update and drawing blocks without changing the ownership boundary.

```ts
import {
  Key, beginDrawing, clearBackground, endDrawing,
  initWindow, isKeyPressed, runGame,
} from '@bornengine/engine/core';
import {
  closeAudio, initAudio, isMusicPlaying, loadMusic,
  loadSound, playMusic, playSound, setMasterVolume, updateMusicStream,
} from '@bornengine/engine/audio';
import { drawRect } from '@bornengine/engine/shapes';
import { drawText, measureText } from '@bornengine/engine/text';

initWindow(960, 540, 'Audio UI Demo');
initAudio();
const confirmSound = loadSound('assets/audio/ui-confirm.wav');
const music = loadMusic('assets/audio/ambient.ogg');
playMusic(music);
let score = 0;
let muted = false;

runGame(() => {
  if (isKeyPressed(Key.SPACE)) {
    score += 10;
    playSound(confirmSound);
  }
  if (isKeyPressed(Key.M)) {
    muted = !muted;
    setMasterVolume(muted ? 0 : 1);
  }
  if (isMusicPlaying(music)) updateMusicStream(music);

  beginDrawing();
  clearBackground({ r: 10, g: 14, b: 20, a: 255 });
  const title = 'BornEngine';
  drawText(title, (960 - measureText(title, 40)) / 2, 90, 40, { r: 184, g: 242, b: 61, a: 255 });
  drawRect(280, 190, 400, 150, { r: 0, g: 0, b: 0, a: 160 });
  drawText(`Score: ${score}`, 320, 230, 28, { r: 255, g: 255, b: 255, a: 255 });
  drawText(muted ? 'Muted' : 'Space: confirm · M: mute', 320, 280, 18, { r: 190, g: 198, b: 208, a: 255 });
  endDrawing();
});

export function shutdown() {
  closeAudio();
}
```

## Next steps

- Add `setSoundBus()` and `duckBus()` so a pause menu lowers music without muting UI clicks.
- Use `drawTexture()` for icons and `measureTextEx()` for a custom-font HUD.
- Add virtual buttons from the [mobile API](../../api/mobile/) while keeping the same key mappings.
- Place spatial emitters with `playSound3DEx()` and update the listener from the active camera.
