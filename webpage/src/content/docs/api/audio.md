---
title: Audio
description: Load sounds and music through a Game-owned audio service.
section: API / Audio
order: 36
---

`game.audio` owns the shared audio device, mixer controls, and loaded resources. Construct no global audio device; the service activates with its Game and is disposed during shutdown.

## Device lifecycle

```ts
import { Game } from '@bornengine/engine';
const game = new Game();
if (!game.audio.isReady) console.error('Audio is unavailable');
game.audio.setMasterVolume(0.8);
game.audio.setBusGain(1, 0.9);
```

Audio operations return failure values when the Game is not ready. The Game closes the shared device after disposing managers and resources.

## Sound

```ts
const select = game.audio.loadSound('assets/audio/select.wav');
if (select.isLoaded) {
  select.play({ volume: 0.8, pitch: 1 });
  select.setBus(1);
}
```

Sounds expose instance playback and configuration methods. Spatial playback returns a voice object that can be moved, adjusted, stopped, and disposed.

## Sound manager

Use SoundManager for named registrations, cooldowns, random pitch/volume ranges, and scene-scoped cleanup. AudioSystem owns the shared device; managers do not close it.

```ts
const audio = game.audio.createSoundManager();
audio.loadSound('confirm', 'assets/audio/confirm.wav', { cooldownSeconds: 0.12 });
audio.loadMusic('ambient', 'assets/audio/ambient.ogg', { volume: 0.6 });
audio.playSound('confirm');
audio.playMusic('ambient');
audio.setBusGain(BUS_SFX, 0.9);
```

Call `audio.dispose()` when the manager's lifetime ends. `Scene.own(audio)` lets a scene dispose it during unload. Named tracks can be removed with the manager's `unloadSound(name)` and `unloadMusic(name)` methods.

## Music and spatial audio

A Music resource provides `play`, `stop`, `update`, and `setVolume`. `Game.run()` advances every loaded stream each frame. Configure 3D listener position on `game.audio.setListener(position, forward)` and use `sound.play3D(position, options)` for positional voices.

```ts
const theme = game.audio.loadMusic('assets/audio/theme.ogg');
if (theme.isLoaded) theme.play();
const voice = select.play3D({ x: 0, y: 1, z: 0 }, { looping: false });
```
