---
title: Audio
description: Load sounds and music, spatialize emitters, and shape the mix with buses and effects.
section: API / Audio
order: 36
---

The audio module keeps device setup, short sound effects, streamed music, and spatial voices in one small API. Import it directly from `@bornengine/engine/audio`; `Sound` and `Music` values are lightweight handles that can live in your game state.

## Device lifecycle

Initialize the audio device before loading or playing resources. `initAudio()` and `closeAudio()` are the primary names; `initAudioDevice()` and `closeAudioDevice()` are equivalent aliases for projects that prefer the device terminology.

```ts
import {
  closeAudioDevice,
  initAudioDevice,
  loadSound,
  playSound,
} from '@bornengine/engine/audio';

initAudioDevice();
const menuConfirm = loadSound('assets/audio/menu-confirm.wav');
playSound(menuConfirm);

// Call this from your native shutdown path.
closeAudioDevice();
```

Keep initialization and shutdown at the application boundary. Do not repeatedly open and close the device around individual effects; a running mixer is shared by every sound and music handle.

## Sound

`loadSound()` loads a short effect into the mixer. Use `playSound()` for a normal one-shot, `stopSound()` for an explicit cut, and `setSoundVolume()` for the effect's base gain. `setMasterVolume()` applies a global gain to the entire mix.

```ts
import {
  BUS_SFX,
  BUS_UI,
  loadSound,
  playSound,
  setMasterVolume,
  setSoundBus,
  setSoundLowpass,
  setSoundReverbSend,
  setSoundVolume,
} from '@bornengine/engine/audio';

const footstep = loadSound('assets/audio/footstep.wav');
const pauseClick = loadSound('assets/audio/pause-click.wav');

setMasterVolume(0.85);
setSoundVolume(footstep, 0.7);
setSoundBus(footstep, BUS_SFX);
setSoundReverbSend(footstep, 0.15);
setSoundLowpass(footstep, 0); // 0 bypasses the filter.
setSoundBus(pauseClick, BUS_UI);

playSound(footstep);
playSound(pauseClick);
```

The built-in buses are `BUS_SFX`, `BUS_MUSIC`, and `BUS_UI`. Use `setBusGain()` to set a bus level, `duckBus()` to pull a bus down temporarily, and `setReverb()` to configure the global reverb return. A low-pass on a `Sound` is useful for occlusion: lower the cutoff when a wall blocks the emitter.

For long-running emitters, `playSound3DEx()` returns a voice id that can be moved without restarting playback. A voice id of `0` means the source was not available; the `voice*` helpers safely ignore it.

```ts
import {
  loadSound,
  playSound3DEx,
  setListenerPosition,
  voiceSetLowpass,
  voiceSetPosition,
  voiceSetVolume,
  voiceStop,
} from '@bornengine/engine/audio';

const river = loadSound('assets/audio/river-loop.ogg');
setListenerPosition(0, 1.6, 4, 0, 0, -1);

const voice = playSound3DEx(river, 8, 0, -12, true, 1, 40, 1);
voiceSetPosition(voice, 6, 0, -10);
voiceSetVolume(voice, 0.8);
voiceSetLowpass(voice, 0); // Set a cutoff such as 1400 when occluded.

// Stop it when the emitter leaves the world.
voiceStop(voice);
```

`playSound3D()` is the simpler fire-and-forget spatial call. Use `playSound3DEx()` when the emitter loops, moves, changes pitch, or needs per-source filtering.

## Sound manager

Use `SoundManager` when gameplay should refer to audio by names and release it as a group. Sound and music names use separate registries. Repeating a name with the same path returns its existing handle and keeps the first options; reusing that name for a different path returns `null`.

```ts
import { runGame } from '@bornengine/engine/core';
import { BUS_SFX, BUS_UI, SoundManager } from '@bornengine/engine/audio';
import { Scene, SceneManager } from '@bornengine/engine/game';

const audio = new SoundManager();
audio.loadSound('footstep', 'assets/audio/footstep.wav', {
  bus: BUS_SFX,
  cooldownSeconds: 0.12,
  volumeRange: [0.9, 1.1],
  pitchRange: [0.96, 1.04],
});
audio.loadSound('menu-confirm', 'assets/audio/menu-confirm.wav', { bus: BUS_UI });
audio.loadMusic('level', 'assets/audio/level.ogg', { volume: 0.65 });
audio.loadMusic('boss', 'assets/audio/boss.ogg', { volume: 0.8 });

const level = new Scene({ name: 'Level' });
level.own(audio);
const scenes = new SceneManager();
scenes.changeTo(level);
audio.playMusic('level');

runGame((dt) => {
  scenes.update(dt); // Updates scene-owned audio, including while paused.
  audio.playSound('footstep');
});

audio.playMusic('boss'); // Stops this manager's previous music track.
audio.stopMusic(); // Stops every track registered by this manager.
```

`cooldownSeconds` is shared between `playSound(name)` and `play3D(name, position)`, and elapsed time advances through `update(dt)`. A scene-owned manager receives that update from `SceneManager`; do not call its `update()` a second time. For a manager that should outlive scenes, keep it outside the scene and call `audio.update(dt)` from your own game loop. Scene cleanup calls `dispose()`, which stops the manager's playback and unloads its registered assets. It never closes the global audio device.

Volume and pitch ranges are per-play multipliers. For example, `volumeRange: [0.9, 1.1]` varies each supported voice around the registered base volume. On targets without controllable 2D voices, `playSound()` falls back to ordinary playback and ignores those variation ranges. `play3D()` returns the spatial voice id; retain it if you need per-voice control.

The manager's `setMasterVolume()` and `setBusGain()` change shared mixer state, so they affect audio from every manager. `unloadSound(name)` and `unloadMusic(name)` stop and release only the named asset owned by that manager. If you use direct `loadSound()`/`loadMusic()` handles instead, the low-level `unloadSound(sound)` and `unloadMusic(music)` helpers release individual resources without a named registry.

## Music and spatial audio

Music is a separate streamed handle. Start it with `playMusic()`, call `updateMusicStream()` once per frame while it is active, and use `isMusicPlaying()` to detect the end of a non-looping track. `setMusicVolume()` changes only that track.

```ts
import {
  isMusicPlaying,
  loadMusic,
  playMusic,
  setMusicVolume,
  stopMusic,
  updateMusicStream,
} from '@bornengine/engine/audio';

const combatTheme = loadMusic('assets/audio/combat.ogg');
setMusicVolume(combatTheme, 0.65);
playMusic(combatTheme);

export function updateAudio() {
  updateMusicStream(combatTheme);
  if (!isMusicPlaying(combatTheme)) {
    stopMusic(combatTheme);
  }
}
```

Call `setListenerPosition(x, y, z, forwardX, forwardY, forwardZ)` from the same system that updates the active camera. The listener direction is a forward vector, not a target point. For larger loading screens, `loadSoundAsync()`/`loadMusicAsync()` commit one staged resource, while `stageSounds()` plus `commitSound()` lets you batch staging work before the render thread takes ownership.

All volume, gain, send, and cutoff values are intended as normalized or engine-unit values described by their function. Keep audio paths under `assets/` so the CLI packages them for each target.

The [audio and UI recipe](../../guides/audio-and-ui/) shows these handles in a complete input-driven HUD.
