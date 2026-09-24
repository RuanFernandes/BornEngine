---
title: Audio
description: Load sounds and music, spatialize emitters, and shape the mix with buses and effects.
section: API / Audio
order: 35
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
