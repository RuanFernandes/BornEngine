---
title: Add audio and UI
description: Use the Game-owned audio and UI services for responsive menus and HUDs.
section: Guides
order: 74
---

Load sounds and music once, then keep the resource instances for the duration of the game or scene. The same Game owns the UI surface and audio device.

## Setup

```ts
import { Game } from '@bornengine/engine';
const game = new Game({ window: { title: 'Audio UI Demo', width: 960, height: 540 } });
const selectSound = game.audio.loadSound('assets/audio/ui-select.wav');
const music = game.audio.loadMusic('assets/audio/ambient.ogg');
let score = 0;
let muted = false;
```

WAV and OGG are the documented cross-platform choices. Keep files below `assets/` so the CLI can package them for each target.

## Game loop

Game updates loaded music streams automatically. Build the UI during render with stable widget IDs; the backend response is read on a subsequent frame.

```ts
game.run({
  update() {},
  render() {
    game.renderer.clear({ r: 10, g: 14, b: 20, a: 255 });
    game.ui.beginWindow(100, 'Status', 24, 24, 280, 150);
    game.ui.label(101, 'Score: ' + score);
    if (game.ui.button(102, 'Play')) {
      score += 10;
      if (selectSound.isLoaded) selectSound.play();
    }
    muted = game.ui.checkbox(103, 'Mute', muted);
    game.audio.setMasterVolume(muted ? 0 : 1);
    game.ui.endWindow(100);
  },
  onStop: () => game.dispose(),
});
```

## Complete example

```ts
import { Colors, Game, Key } from '@bornengine/engine';

const game = new Game({ window: { title: 'Audio UI Demo', width: 960, height: 540 } });
const controls = game.input.createActionMap();
controls.bindAction('score', { kind: 'key', key: Key.SPACE });
const selectSound = game.audio.loadSound('assets/audio/ui-select.wav');
const music = game.audio.loadMusic('assets/audio/ambient.ogg');
let score = 0;

if (music.isLoaded) music.play();
game.run({
  update() { if (controls.wasPressed('score')) score += 10; },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawText('Score: ' + score, { x: 24, y: 24 }, 24, Colors.WHITE);
    game.renderer.drawText('Press Space to score', { x: 24, y: 58 }, 16, Colors.LIME);
  },
  onStop: () => game.dispose(),
});
```

## Next steps

Use SoundManager for named effects, cooldowns, music switching, and scene-owned cleanup. See the [Audio API](../../api/audio/) and [UI API](../../api/ui/).
