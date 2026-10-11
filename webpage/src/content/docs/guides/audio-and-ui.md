---
title: Add audio and UI
description: Play sound effects and streamed music, and build a settings window and a score display with the immediate-mode UI.
section: Guides
order: 74
---

This guide adds sound and a small interface to a game. You load a sound effect and a music track, play them from game code, and build a settings window with a text field, a button, a slider, and checkboxes. The window changes the volume, switches the music, and adds points to a score.

Each section adds one piece. The last section has the complete `main.ts`.

## What you will build

- A score that grows when you press `Space` or `Enter`, or click a button.
- A click sound with a little random variation, and a looping music track.
- A settings window with a name field, a volume slider, and mute and music checkboxes.
- The score text centered with a measured width.

## Setup

Create a 2D project and a folder for audio:

```sh
bornengine new ScoreScreen
cd ScoreScreen
mkdir -p assets/audio
```

Put two short files in `assets/audio`:

- `click.wav`: a sound effect that lasts a fraction of a second.
- `theme.ogg`: a music track of any length.

WAV and OGG work on every target. MP3 also works in the native projects that `bornengine new` creates, but not in the browser build. A WAV file must use 8-bit or 16-bit PCM samples.

The two kinds of audio are different resources:

- A **sound** (`Sound`) is for effects. It is decoded into memory when it loads, and you can play it many times at once.
- **Music** (`Music`) is for long tracks. On native targets, OGG and MP3 files are decoded while they play, so only the compressed file stays in memory. WAV music, and all music on the web, is decoded in full. Prefer OGG for music. A music track loops until you stop it.

## Game loop

The engine updates audio before it calls `loop`, so you never call an audio update yourself. It streams every playing track and counts the cooldown timers of sound managers. The interface works in the opposite way. You describe it every frame from `render()`.

This is a complete `main.ts` with one sound and one button:

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Sound } from '@bornengine/engine';

class ClickGame extends Game {
  private click: Sound | null = null;
  private score = 0;

  constructor() {
    super({ window: { title: 'Click', width: 480, height: 270 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const click = this.assets.loadSound('assets/audio/click.wav');
    if (click === null || !click.isLoaded) console.warn('Sound is off: could not load assets/audio/click.wav');
    else this.click = click;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
    this.renderer.drawText('Score: ' + this.score, { x: 24, y: 24 }, 32, Colors.WHITE);

    this.ui.beginWindow(100, 'Controls', 24, 80, 220, 90);
    if (this.ui.button(101, 'Add point')) {
      this.score += 1;
      if (this.click !== null) this.click.play({ pitch: 1.1 });
    }
    this.ui.endWindow(100);
  }
}

new ClickGame().run();
```

Run it with `bornengine run main.ts`. Clicking the button adds a point and plays the sound.

How it works:

- `this.assets.loadSound()` loads the file once and returns the same `Sound` for the same path. Loading never throws. A missing file gives a sound whose `isLoaded` is `false`, and `error` says why. Audio is rarely essential, so this game warns and goes on without sound.
- `sound.play()` starts a new copy of the sound, so quick clicks overlap. `volume` and `pitch` in the options apply to that copy only.
- `this.ui` is an **immediate-mode** interface. Nothing is stored between frames. Each frame you call `beginWindow`, the widgets, and `endWindow`, and the engine draws them over the game.
- The numbers `100` and `101` are widget IDs. They identify a widget from one frame to the next, so choose numbers that are unique and that you keep the same.
- A widget reports the result of the last finished UI frame. A click reaches your code one frame after it happens.

## Sound effects and music

A `SoundManager` gives names to sounds and music and adds a cooldown and random variation. Create one with `audio.createSoundManager()` and load everything by name:

```ts
import { Game, SoundManager } from '@bornengine/engine';

function createSounds(game: Game): SoundManager {
  const sounds = game.audio.createSoundManager();

  const click = sounds.loadSound('click', 'assets/audio/click.wav', {
    volumeRange: [0.7, 0.9],
    pitchRange: [0.95, 1.1],
    cooldownSeconds: 0.05,
  });
  if (click === null) console.warn('Sound effects are off: could not load assets/audio/click.wav');

  const theme = sounds.loadMusic('theme', 'assets/audio/theme.ogg', { volume: 0.5 });
  if (theme === null) console.warn('Music is off: could not load assets/audio/theme.ogg');

  return sounds;
}
```

- `loadSound` and `loadMusic` return `null` when the file cannot be loaded or an option is out of range. Loading the same name again with the same path returns the loaded resource.
- `playSound('click')` picks a random volume from `volumeRange` and a random pitch from `pitchRange` for each play. Use equal values, such as `[0.8, 0.8]`, for a fixed level. Pitch must stay between 0.25 and 4. `cooldownSeconds` is the shortest time between two plays of the same name, so a held key cannot stack hundreds of clicks. A play inside the cooldown returns `false`.
- `playMusic('theme')` stops the previous managed track and starts the new one. `stopMusic('theme')` stops it. Switching between a menu track and a level track is one call.
- A manager lives until the game stops, then it releases its sounds and music. Call `sounds.unloadSound(name)` to release one earlier.
- Effects go on the `BUS_SFX` bus unless you pass `bus` in the options. `audio.setBusGain(bus, gain)` changes the level of a whole bus, and `audio.setMasterVolume(volume)` changes everything.
- In a browser, sound starts after the player's first click or key press, because browsers block audio until then.

For one-off effects that you do not need a name for, use `sound.play(options)` as in the first program. `this.assets.loadMusic(path)` returns a `Music` with `play()`, `stop()`, `setVolume(volume)`, and `isPlaying`. For positioned sound, see `Sound.play3D` and `AudioEmitter2D` in the [Audio API](../../api/audio/).

## The interface

Every widget call returns what the player did. Buttons return `true` when clicked. Checkboxes, sliders, and text fields return the new value, so you store the result in your own variable:

```ts
import { Game } from '@bornengine/engine';

class SettingsDemo extends Game {
  private name = 'Player';
  private volume = 0.8;
  private difficulty = 2;
  private muted = false;

  protected override render(): void {
    this.renderer.clear({ r: 18, g: 24, b: 34, a: 255 });

    this.ui.beginWindow(200, 'Settings', 24, 24, 260, 260);
    this.name = this.ui.textEditSingleline(201, 'Name', this.name);
    this.volume = this.ui.sliderFloat(202, 'Volume', this.volume, 0, 1);
    this.difficulty = this.ui.sliderInt(203, 'Difficulty', this.difficulty, 1, 3);
    this.muted = this.ui.checkbox(204, 'Mute', this.muted);
    this.ui.separator();
    this.ui.progressBar(205, this.volume, 'Volume');
    if (this.ui.button(206, 'Reset')) {
      this.volume = 0.8;
      this.muted = false;
    }
    this.ui.endWindow(200);
  }
}
```

- Open every window with `beginWindow(id, title, x, y, width, height)` and close it with `endWindow(id)`. Pass the same `id` to both.
- Do not reuse an ID for two widgets in the same frame. A label is not an identity. Two widgets with the same text still need different IDs.
- Positions and sizes are in window pixels. The UI does not follow a 2D camera or viewport.
- The UI knows when it is using the input. `this.ui.wantsPointerInput()` is true while the pointer is over the UI, and `this.ui.wantsKeyboardInput()` is true while a text field has focus. Both report the last finished UI frame. Skip your own input handling while they are true, so typing a space into a name field does not also score a point.
- `this.ui.isAvailable()` tells you whether the interface exists on the current target. It is not available on watchOS.
- `ui.response(id)` returns the full response of one widget: `clicked`, `changed`, `hovered`, `focused`, `dragged`, `value`, and `text`.

The immediate-mode UI suits menus, settings, and debug panels. For interfaces whose controls persist between frames, raise events, and use skins, use the retained GUI. The [GUI controls](../../api/gui/) reference lists the controls, and [Build a retained GUI](../gui-controls/) shows how to organize them.

## Complete example

Replace `main.ts` with this file. It combines the score, the sound manager, the music track, and the settings window:

```ts
import { Colors, Game, Key } from '@bornengine/engine';
import type { InputActionMap, SoundManager } from '@bornengine/engine';

const WINDOW_ID = 100;
const NAME_ID = 101;
const ADD_ID = 102;
const VOLUME_ID = 103;
const MUTE_ID = 104;
const MUSIC_ID = 105;

class ScoreGame extends Game {
  private controls: InputActionMap | null = null;
  private sounds: SoundManager | null = null;
  private score = 0;
  private playerName = 'Player';
  private volume = 0.8;
  private muted = false;
  private musicOn = true;

  constructor() {
    super({ window: { title: 'Score', width: 640, height: 360 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const sounds = this.audio.createSoundManager();
    const click = sounds.loadSound('click', 'assets/audio/click.wav', {
      volumeRange: [0.7, 0.9],
      pitchRange: [0.95, 1.1],
      cooldownSeconds: 0.05,
    });
    if (click === null) console.warn('Sound effects are off: could not load assets/audio/click.wav');
    const theme = sounds.loadMusic('theme', 'assets/audio/theme.ogg', { volume: 0.5 });
    if (theme === null) console.warn('Music is off: could not load assets/audio/theme.ogg');
    sounds.playMusic('theme');
    this.sounds = sounds;

    const controls = this.input.createActionMap();
    controls.bindAction('score', [{ kind: 'key', key: Key.SPACE }, { kind: 'key', key: Key.ENTER }]);
    this.controls = controls;
  }

  protected override loop(): void {
    const controls = this.controls;
    if (controls !== null && controls.wasPressed('score') && !this.ui.wantsKeyboardInput()) this.addPoint();
  }

  protected override render(): void {
    this.renderer.clear({ r: 18, g: 24, b: 34, a: 255 });

    const label = this.playerName + ': ' + this.score;
    const width = this.renderer.measureText(label, 48);
    this.renderer.drawText(label, { x: (640 - width) / 2, y: 48 }, 48, Colors.WHITE);
    this.renderer.drawText('Press Space or use the window', { x: 24, y: 330 }, 18, Colors.LIGHTGRAY);

    this.ui.beginWindow(WINDOW_ID, 'Settings', 380, 120, 240, 220);
    this.playerName = this.ui.textEditSingleline(NAME_ID, 'Name', this.playerName);
    if (this.ui.button(ADD_ID, 'Add point')) this.addPoint();
    this.volume = this.ui.sliderFloat(VOLUME_ID, 'Volume', this.volume, 0, 1);
    this.muted = this.ui.checkbox(MUTE_ID, 'Mute', this.muted);
    const musicOn = this.ui.checkbox(MUSIC_ID, 'Music', this.musicOn);
    this.ui.endWindow(WINDOW_ID);

    this.audio.setMasterVolume(this.muted ? 0 : this.volume);
    if (musicOn !== this.musicOn) {
      this.musicOn = musicOn;
      if (this.sounds !== null) {
        if (musicOn) this.sounds.playMusic('theme');
        else this.sounds.stopMusic('theme');
      }
    }
  }

  private addPoint(): void {
    this.score += 1;
    if (this.sounds !== null) this.sounds.playSound('click');
  }
}

new ScoreGame().run();
```

Run it with `bornengine run main.ts`. The music starts at once. Press `Space` or click **Add point** to score.

What each part does:

- `onStart()` creates the sound manager, loads the effect and the music, starts the music, and binds the keys. A missing file only logs a warning, because `playSound` and `playMusic` do nothing for a name that did not load.
- `loop()` reads the `score` action. The action map was updated before `loop`, so `wasPressed` is true on the frame the key goes down. The check on `wantsKeyboardInput()` ignores the key while the name field has focus.
- `render()` first draws the score with the renderer. `measureText` returns the width of a string at a given size, which the code uses to center the text. Then it builds the window. The slider, the checkboxes, and the text field return their new values and the code stores them.
- After the window, the code applies the settings. It sets the master volume to zero when muted. When the **Music** checkbox changes, it starts or stops the track.
- `addPoint()` is shared by the key and the button, so both ways of scoring play the click.

## Next steps

- [Audio API](../../api/audio/) covers buses, ducking, reverb, spatial sound, and 2D emitters.
- [Immediate UI API](../../api/ui/) lists every widget, layout call, and the paint commands.
- [GUI controls](../../api/gui/) describes the retained controls, events, and profiles. [Build a retained GUI](../gui-controls/) walks through them.
- [Build a 2D game](../2d-game/) adds a scene, animation, and a camera.
- [Assets](../../concepts/assets/) explains scopes and caching for sounds and music.
