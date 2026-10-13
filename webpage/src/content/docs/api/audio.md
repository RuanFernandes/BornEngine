---
title: Audio
description: Load and play sounds and music through the audio system that every Game owns.
section: API
order: 36
---

`game.audio` is the `AudioSystem` of a `Game`. It opens the output device, owns the mixer, and loads `Sound` and `Music` resources. You do not create or close a device yourself. The audio system starts with the `Game` and shuts down with it.

The audio classes and bus constants come from `@bornengine/engine`. They are also available from `@bornengine/engine/audio`.

Supported files are WAV (8-bit or 16-bit PCM) and OGG Vorbis. MP3 also works on native targets built with the `mp3` native feature, which every BornEngine CLI game profile includes. MP3 does not decode on Web/WASM.

## Device lifecycle

The audio device opens when the `Game` is ready and closes when the `Game` is disposed. Every mixer method returns `false` when audio is not ready, so check `isReady` once at start-up.

```ts
import { BUS_MUSIC, Game } from '@bornengine/engine';

class AudioDemo extends Game {
  protected override onStart(): void {
    if (!this.audio.isReady) {
      console.error('Audio is unavailable on this device.');
      return;
    }
    this.audio.setMasterVolume(0.8);
    this.audio.setBusGain(BUS_MUSIC, 0.6);
    this.audio.setReverb(0.5, 0.4, 0.2);
  }

  onPlayerHit(): void {
    this.audio.duckBus(BUS_MUSIC, 0.7, 0.05, 0.4, 0.3);
  }
}

new AudioDemo().run();
```

The mixer has three buses: `BUS_SFX` (0), `BUS_MUSIC` (1), and `BUS_UI` (2). A bus is a mixer channel that several sounds share, so you can change their level together. Sounds start on `BUS_SFX`, and music always plays on `BUS_MUSIC`.

- `setMasterVolume(volume)` sets the level of everything.
- `setBusGain(bus, gain)` sets the level of one bus.
- `duckBus(bus, amount, attack, release, hold)` lowers a bus for a moment. `amount` is how far to pull it down, from 0 to 1. The level falls over `attack` seconds, stays down for `hold` seconds, and recovers over `release` seconds. Call it again to restart the hold.
- `setReverb(size, damp, wet)` configures the one reverb that all sounds share. Each value runs from 0 to 1, and a `wet` value of 0 turns the reverb off. A sound feeds the reverb only when its `reverbSend` is above 0.
- `setListener(position, forward)` places the 3D listener.

Every one of these returns `true` when it was applied.

The `Game` calls `game.audio.update(deltaTime)` once per frame. That call advances cooldown timers and feeds every loaded `Music` stream, so you never call it yourself.

When the `Game` is disposed, it first disposes sound managers and then music and sounds, and last it closes the device.

## Sound

`loadSound(path)` loads a file and returns a `Sound` at once. It never returns `null`. Check `isLoaded`, and read `error` when loading failed.

```ts
import { BUS_UI, Game } from '@bornengine/engine';

class MenuGame extends Game {
  protected override onStart(): void {
    const select = this.audio.loadSound('assets/audio/select.wav');
    if (!select.isLoaded) {
      console.error(select.error);
      return;
    }
    select.setBus(BUS_UI);
    select.play({ volume: 0.8, pitch: 1.1 });

    const voice = select.play3D({ x: 2, y: 0, z: -4 }, { refDist: 2, maxDist: 40 });
    if (voice !== null) voice.setLowpass(1200);
  }
}

new MenuGame().run();
```

- `play(options)` starts a new playback and returns `true` when it was requested. `volume` and `pitch` apply to that playback only. Pitch is a speed multiplier from 0.25 to 4.
- `play3D(position, options)` plays the sound at a point in 3D space and returns a `SoundVoice`. `looping`, `refDist`, `maxDist`, and `rolloff` shape the sound. `refDist` is the distance that plays at full volume, `maxDist` is the distance past which the mixer stops mixing the voice (0 means never), and `rolloff` is how fast the level falls beyond `refDist`. The method returns `null` when the sound is not loaded or when the platform plays it without a controllable voice.
- A `SoundVoice` is one playing instance of a sound. You can move it with `setPosition`, adjust it with `setVolume`, `setPitch`, and `setLowpass`, and end it with `stop()`. `isActive` tells you whether it still exists.
- `stop()` stops the sound and all its voices. `setVolume`, `setBus`, `setReverbSend` (0 to 1), and `setLowpass(cutoffHz)` set how the sound is mixed. A low-pass filter muffles the sound above the cutoff frequency, and `setLowpass(0)` turns it off.
- `dispose()` stops the sound and unloads it. A `Sound` that you do not dispose lives until the `Game` is disposed.

`loadSoundAsync(path)` returns a promise, and `stageSounds(paths)` decodes several files in parallel and returns staged objects whose `commit()` creates each `Sound`. `game.audio` has the matching `loadMusicAsync(path)` and `stageMusic(paths)` for music. Use the synchronous loaders on Web/WASM and watchOS, where staged loading is not available yet and produces a sound that is not loaded. Like every promise, an async load only finishes where the host runs promise continuations. On native Linux, `Game.run()` does not yet, so await the load before you call `run()`.

To release sounds together with a scene, load them through `scene.assets.loadSound(path)` instead. [Assets](../assets/) explains scene-scoped and Game-scoped loading.

## Sound manager

A `SoundManager` registers sounds and music under names, so game code can say `playSound('confirm')` instead of holding file paths. It also adds a cooldown between plays, random volume and pitch for each play, and one place to release everything when a scene ends.

```ts
import { Game, BUS_SFX, Scene, SoundManager } from '@bornengine/engine';

class MenuScene extends Scene {
  private readonly sounds: SoundManager;

  constructor() {
    super({ name: 'menu' });
    const audio = Game.current.audio.createSoundManager();
    this.sounds = audio;
    this.own(audio);

    audio.loadSound('confirm', 'assets/audio/confirm.wav', {
      cooldownSeconds: 0.12,
      volumeRange: [0.9, 1],
      pitchRange: [0.95, 1.05],
    });
    audio.loadMusic('ambient', 'assets/audio/ambient.ogg', { volume: 0.6 });
    audio.setBusGain(BUS_SFX, 0.9);
  }

  override onEnter(): void {
    this.sounds.playMusic('ambient');
  }

  confirm(): void {
    this.sounds.playSound('confirm');
  }

  dropTrack(name: string): void {
    this.sounds.unloadMusic(name);
  }
}
```

Registering:

- `loadSound(name, path, options)` returns the `Sound`, or `null` when an option is invalid, the file does not load, or the name already refers to a different path. Loading a name again with the same path returns the existing sound and keeps its first options.
- The options are `bus` (one of the three bus constants), `volume`, `reverbSend` (0 to 1), `lowpassHz`, `cooldownSeconds`, `volumeRange`, and `pitchRange`. Each play multiplies the volume by a random value in `volumeRange` and the pitch by a random value in `pitchRange`. Ranges are `[min, max]` pairs. Volume multipliers cannot be negative, and pitch multipliers must stay between 0.25 and 4.
- `loadMusic(name, path, options)` returns the `Music`, or `null`. Its only option is `volume`.

Playing:

- `playSound(name)` returns `false` when the name is unknown or the sound is still cooling down. `play3D(name, position, options)` shares the same cooldown and returns a `SoundVoice` or `null`.
- `playMusic(name)` stops the track the manager played before and starts the new one. `stopMusic(name)` stops one track, and `stopMusic()` stops them all.
- `stopSound`, `setSoundVolume`, and `setMusicVolume` change one registered item by name. `unloadSound(name)` and `unloadMusic(name)` stop it and release its resource.
- `setMasterVolume(volume)` and `setBusGain(bus, gain)` act on the shared mixer, not on this manager alone. They change the level of all audio in the `Game`.

Ownership:

- A manager releases only the sounds and music it registered. Other audio in the `Game` is not touched. Call `dispose()` when its lifetime ends. It is safe to call more than once, and playback requests fail afterward.
- `scene.own(audio)` hands the manager to a scene, which disposes it when the scene unloads. A manager that no scene owns is disposed with the `Game`.
- The `Game` advances every manager's cooldown timers each frame.
- Known issue: a manager that a scene owns gets a second cooldown update each frame, from the scene. Its cooldowns run at double speed, so `cooldownSeconds: 0.12` lasts about 0.06 seconds of frame time. Do not rely on exact cooldown timing for a scene-owned manager until the engine is fixed.

## Music and spatial audio

`loadMusic(path)` returns a `Music` at once. Check `isLoaded`. A `Music` has `play()`, `stop()`, `setVolume(volume)`, and `isPlaying`. It repeats until you stop it. The `Game` streams every loaded `Music` each frame, so you do not call `music.update()`.

For positional sound in a 3D scene, call `game.audio.setListener(position, forward)` each frame, and play sounds with `play3D`. For a 2D game, use the shared `game.audio.listener2D` and an `AudioEmitter2D` component:

```ts
import { Game, AudioEmitter2D, GameObject, Scene, Vec3 } from '@bornengine/engine';
import type { Music } from '@bornengine/engine';

class Level extends Scene {
  private readonly theme: Music;
  private readonly emitter: AudioEmitter2D;

  constructor() {
    super({ name: 'level' });
    this.theme = Game.current.audio.loadMusic('assets/audio/theme.ogg');

    const wind = Game.current.audio.loadSound('assets/audio/wind.wav');
    this.emitter = new AudioEmitter2D(wind, Game.current.audio.listener2D, {
      looping: true,
      refDist: 24,
      maxDist: 400,
    });
    const source = new GameObject({ name: 'Wind', position: new Vec3(300, 200, 0) });
    source.addComponent(this.emitter);
    this.addNode(source);
  }

  override onEnter(): void {
    if (this.theme.isLoaded) this.theme.play();
    if (this.emitter.sound.isLoaded) this.emitter.play();
  }

  override onExit(): void {
    this.theme.stop();
    this.emitter.stop();
  }
}
```

Music and sounds that you load through `game.audio` belong to the `Game`, not to the scene. That is why `onExit()` stops them.

To make the listener follow a game object, such as the player, add the component to that object:

```ts
import { AudioListener2D, GameObject, Scene } from '@bornengine/engine';

export function addListener(scene: Scene, player: GameObject): AudioListener2D {
  const listener = new AudioListener2D();
  player.addComponent(listener);
  scene.addNode(player);
  return listener;
}
```

- `listener2D` follows the active scene camera by default. Call `setPosition({ x, y })` to pin it to a world position, and `followCamera()` to follow the camera again.
- `AudioListener2D` is also a `GameComponent`. Add `new AudioListener2D()` to a game object and the scene updates the listener once per frame from that object: its world X and Y position, and its rotation about Z. Without an owner object, and without the shared `listener2D` binding, it does nothing.
- `AudioEmitter2D` starts one controllable voice at its object's position and moves the voice as the object moves. The world's X and Y axes map to the mixer's X and Z axes. `play()` returns `true` when the voice started, `stop()` ends only that voice, and `isPlaying` reports its state. Disabling or destroying the object stops the voice. The shared audio system still owns the `Sound` and the listener.

Platform notes:

- On Web/WASM, browsers block audio until the player interacts with the page. The first pointer or key press starts it.
- watchOS plays sounds and music through the system audio player. It supports loading, `play`, `stop`, and volume. Buses, ducking, reverb, low-pass filters, voices, spatial audio, per-play `volume` and `pitch`, and staged loading do nothing there. `play3D` plays the sound flat.

## Next steps

- [Audio and UI](../../guides/audio-and-ui/) adds sound effects and a heads-up display to a game.
- [Assets](../assets/) explains how scenes and the `Game` own loaded resources.
- [Scene](../scene/) covers the scene lifecycle that `scene.own()` follows.
