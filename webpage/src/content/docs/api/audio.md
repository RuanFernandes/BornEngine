---
title: Audio
description: Load sounds and music, control volumes and buses, and place a listener in 3D space.
section: API / Audio
order: 35
---

Import from `@bornengine/engine/audio`:

```ts
import { initAudio, loadSound, playSound, setMasterVolume } from '@bornengine/engine/audio';

initAudio();
const click = loadSound('assets/click.wav');
setMasterVolume(0.8);
playSound(click);
```

The module separates short sounds from streamed music: `loadSound`/`playSound` and `loadMusic`/`playMusic`. Use `updateMusicStream` for streamed music, and `setSoundVolume`, `setMusicVolume`, and `isMusicPlaying` for runtime control.

The 3D surface includes `playSound3D` and `setListenerPosition`. The mixer also exposes buses (`BUS_SFX`, `BUS_MUSIC`, `BUS_UI`), `setBusGain`, ducking, low-pass filtering, and reverb send controls.

Web/WASM uses the Web Audio API through the same TypeScript shape. WAV and OGG are supported on the web path; MP3 is not.
