import type { Vec3 } from '../core/types';
import type { Music } from './music';
import type { Sound, SoundVoice } from './sound';
import type { AudioSystem } from './audio-system';
import { randomFloat } from '../math/internal';
import { BUS_MUSIC, BUS_SFX, BUS_UI } from './internal';

/** Options for SoundManager.loadSound. */
export interface ManagedSoundOptions {
  /** Mix bus to route the sound to: `BUS_SFX` (default), `BUS_MUSIC` or `BUS_UI`. */
  bus?: number;
  /** Base volume, 0 or greater. Defaults to 1. */
  volume?: number;
  /** Share of the sound sent to the reverb, 0..1. Defaults to 0. */
  reverbSend?: number;
  /** Low-pass cutoff in Hz; 0 disables the filter. Defaults to 0. */
  lowpassHz?: number;
  /** Minimum time between plays of this sound. Defaults to 0. */
  cooldownSeconds?: number;
  /** Min and max volume; each play picks a random value in range. Defaults to [1, 1]. */
  volumeRange?: [number, number];
  /** Min and max pitch (within 0.25..4); each play picks a random value in range. Defaults to [1, 1]. */
  pitchRange?: [number, number];
}

/** Options for SoundManager.loadMusic. */
export interface ManagedMusicOptions {
  /** Base volume, 0 or greater. Defaults to 1. */
  volume?: number;
}

/** Options for SoundManager.play3D. */
export interface SpatialSoundOptions {
  /** Whether playback repeats until stopped. Defaults to false. */
  looping?: boolean;
  /** Distance range that plays at full volume. Defaults to 1. */
  refDist?: number;
  /** Distance past which the voice is culled; 0 means never. Defaults to 0. */
  maxDist?: number;
  /** How quickly volume falls past `refDist`; 1 is the physical inverse law. Defaults to 1. */
  rolloff?: number;
}

interface ManagedSoundEntry {
  name: string;
  path: string;
  sound: Sound;
  volumeRange: [number, number];
  pitchRange: [number, number];
  cooldownSeconds: number;
  cooldownRemaining: number;
  spatialVoices: SoundVoice[];
}

interface ManagedMusicEntry {
  name: string;
  path: string;
  music: Music;
}

function finiteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validVolumeRange(range: [number, number] | undefined): boolean {
  if (range === undefined) return true;
  return finiteNumber(range[0]) && finiteNumber(range[1]) && range[0] >= 0 && range[0] <= range[1];
}

function validPitchRange(range: [number, number] | undefined): boolean {
  if (range === undefined) return true;
  return finiteNumber(range[0]) && finiteNumber(range[1]) && range[0] >= 0.25 && range[0] <= range[1] && range[1] <= 4;
}

function validBus(bus: number): boolean {
  return bus === BUS_SFX || bus === BUS_MUSIC || bus === BUS_UI;
}

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) {
    values[current] = values[current + 1];
  }
  values.pop();
}

/** Named, scene-ownable sound and music registrations. */
export class SoundManager {
  private sounds: ManagedSoundEntry[] = [];
  private musics: ManagedMusicEntry[] = [];
  private currentMusicName: string | null = null;
  private disposed = false;

  /** Creates a manager bound to `audio`. Prefer `AudioSystem.createSoundManager()`. */
  constructor(private readonly audio: AudioSystem) {
    this.audio.registerManager(this);
  }

  /**
   * Loads and registers a sound under `name`.
   * @returns The Sound, the existing one if `name` is already registered with the same path, or null on invalid options, a path conflict, or a load failure.
   */
  loadSound(name: string, path: string, options: ManagedSoundOptions = {}): Sound | null {
    if (this.disposed || name.length === 0 || path.length === 0) return null;

    const existing = this.findSound(name);
    if (existing !== null) {
      return existing.path === path ? existing.sound : null;
    }

    const volume = options.volume === undefined ? 1 : options.volume;
    const bus = options.bus === undefined ? BUS_SFX : options.bus;
    const reverbSend = options.reverbSend === undefined ? 0 : options.reverbSend;
    const lowpassHz = options.lowpassHz === undefined ? 0 : options.lowpassHz;
    const cooldownSeconds = options.cooldownSeconds === undefined ? 0 : options.cooldownSeconds;
    if (
      !finiteNumber(volume) ||
      volume < 0 ||
      !finiteNumber(cooldownSeconds) ||
      cooldownSeconds < 0 ||
      !validVolumeRange(options.volumeRange) ||
      !validPitchRange(options.pitchRange) ||
      !validBus(bus) ||
      !finiteNumber(reverbSend) ||
      reverbSend < 0 ||
      reverbSend > 1 ||
      !finiteNumber(lowpassHz) ||
      lowpassHz < 0
    )
      return null;

    const sound = this.audio.loadSound(path);
    if (!sound.isLoaded) {
      sound.dispose();
      return null;
    }

    const volumeRange: [number, number] =
      options.volumeRange === undefined ? [1, 1] : [options.volumeRange[0], options.volumeRange[1]];
    const pitchRange: [number, number] =
      options.pitchRange === undefined ? [1, 1] : [options.pitchRange[0], options.pitchRange[1]];
    sound.setVolume(volume);
    sound.setBus(bus);
    sound.setReverbSend(reverbSend);
    sound.setLowpass(lowpassHz);
    this.sounds.push({
      name,
      path,
      sound,
      volumeRange,
      pitchRange,
      cooldownSeconds,
      cooldownRemaining: 0,
      spatialVoices: [],
    });
    return sound;
  }

  /**
   * Loads and registers a music track under `name`.
   * @returns The Music, the existing one if `name` is already registered with the same path, or null on invalid options, a path conflict, or a load failure.
   */
  loadMusic(name: string, path: string, options: ManagedMusicOptions = {}): Music | null {
    if (this.disposed || name.length === 0 || path.length === 0) return null;

    const existing = this.findMusic(name);
    if (existing !== null) {
      return existing.path === path ? existing.music : null;
    }

    const volume = options.volume === undefined ? 1 : options.volume;
    if (!finiteNumber(volume) || volume < 0) return null;

    const music = this.audio.loadMusic(path);
    if (!music.isLoaded) {
      music.dispose();
      return null;
    }
    music.setVolume(volume);
    this.musics.push({ name, path, music });
    return music;
  }

  /**
   * Plays the named sound with a random volume and pitch from its ranges. Returns false if unknown, on cooldown, or not playable.
   */
  playSound(name: string): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null || entry.cooldownRemaining > 0) return false;

    const volume = randomFloat(entry.volumeRange[0], entry.volumeRange[1]);
    const pitch = randomFloat(entry.pitchRange[0], entry.pitchRange[1]);
    if (!entry.sound.play({ volume, pitch })) return false;
    this.startCooldown(entry);
    return true;
  }

  /** Stops all playback of the named sound, including its 3D voices. Returns false if the name is unknown. */
  stopSound(name: string): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null) return false;
    entry.sound.stop();
    this.stopSpatialVoices(entry);
    return true;
  }

  /** Sets the base volume of the named sound. Returns false if the name is unknown or the sound is not loaded. */
  setSoundVolume(name: string, volume: number): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null) return false;
    return entry.sound.setVolume(volume);
  }

  /** Stops, disposes and unregisters the named sound. Returns false if the name is unknown. */
  unloadSound(name: string): boolean {
    const index = this.findSoundIndex(name);
    if (this.disposed || index < 0) return false;
    const entry = this.sounds[index];
    entry.sound.stop();
    this.stopSpatialVoices(entry);
    entry.sound.dispose();
    removeAt(this.sounds, index);
    return true;
  }

  /** Plays the named music track, stopping the previously played one. Returns false if the name is unknown. */
  playMusic(name: string): boolean {
    const entry = this.findMusic(name);
    if (this.disposed || entry === null) return false;

    if (this.currentMusicName !== null) {
      const previous = this.findMusic(this.currentMusicName);
      if (previous !== null) previous.music.stop();
    }
    entry.music.play();
    this.currentMusicName = name;
    return true;
  }

  /**
   * Stops the named music track, or every registered track when `name` is omitted. Returns false if the name is unknown.
   */
  stopMusic(name?: string): boolean {
    if (this.disposed) return false;
    if (name === undefined) {
      for (let index = 0; index < this.musics.length; index++) {
        this.musics[index].music.stop();
      }
      this.currentMusicName = null;
      return true;
    }

    const entry = this.findMusic(name);
    if (entry === null) return false;
    entry.music.stop();
    if (this.currentMusicName === name) this.currentMusicName = null;
    return true;
  }

  /** Sets the volume of the named music track. Returns false if the name is unknown or the music is not loaded. */
  setMusicVolume(name: string, volume: number): boolean {
    const entry = this.findMusic(name);
    if (this.disposed || entry === null) return false;
    return entry.music.setVolume(volume);
  }

  /** Disposes and unregisters the named music track. Returns false if the name is unknown. */
  unloadMusic(name: string): boolean {
    const index = this.findMusicIndex(name);
    if (this.disposed || index < 0) return false;
    const entry = this.musics[index];
    entry.music.dispose();
    if (this.currentMusicName === name) this.currentMusicName = null;
    removeAt(this.musics, index);
    return true;
  }

  /** Plays the named sound at a 3D position and returns its voice, or null if unknown, on cooldown, or not playable. */
  play3D(name: string, position: Vec3, options: SpatialSoundOptions = {}): SoundVoice | null {
    const entry = this.findSound(name);
    if (this.disposed || entry === null || !entry.sound.isLoaded || entry.cooldownRemaining > 0) return null;

    const voice = entry.sound.play3D(position, options);
    if (voice !== null) {
      this.applyVariation(entry, voice);
      entry.spatialVoices.push(voice);
    }
    this.startCooldown(entry);
    return voice;
  }

  /** Sets the global output volume. */
  setMasterVolume(volume: number): void {
    if (this.disposed) return;
    this.audio.setMasterVolume(volume);
  }

  /** Sets the gain of a mix bus (`BUS_SFX`, `BUS_MUSIC` or `BUS_UI`). */
  setBusGain(bus: number, gain: number): void {
    if (this.disposed) return;
    this.audio.setBusGain(bus, gain);
  }

  /** Advances sound cooldown timers by `dt` seconds. AudioSystem calls this every frame. */
  update(dt: number): void {
    if (this.disposed) return;
    if (finiteNumber(dt) && dt > 0) {
      for (let index = 0; index < this.sounds.length; index++) {
        const entry = this.sounds[index];
        entry.cooldownRemaining -= dt;
        if (entry.cooldownRemaining < 0) entry.cooldownRemaining = 0;
      }
    }
  }

  /** Stops and disposes every registered sound and music track. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (let index = 0; index < this.sounds.length; index++) {
      const entry = this.sounds[index];
      entry.sound.stop();
      this.stopSpatialVoices(entry);
      entry.sound.dispose();
    }
    for (let index = 0; index < this.musics.length; index++) {
      this.musics[index].music.dispose();
    }
    this.sounds = [];
    this.musics = [];
    this.currentMusicName = null;
    this.audio.unregisterManager(this);
  }

  private findSound(name: string): ManagedSoundEntry | null {
    const index = this.findSoundIndex(name);
    return index < 0 ? null : this.sounds[index];
  }

  private findSoundIndex(name: string): number {
    for (let index = 0; index < this.sounds.length; index++) {
      if (this.sounds[index].name === name) return index;
    }
    return -1;
  }

  private findMusic(name: string): ManagedMusicEntry | null {
    const index = this.findMusicIndex(name);
    return index < 0 ? null : this.musics[index];
  }

  private findMusicIndex(name: string): number {
    for (let index = 0; index < this.musics.length; index++) {
      if (this.musics[index].name === name) return index;
    }
    return -1;
  }

  private startCooldown(entry: ManagedSoundEntry): void {
    entry.cooldownRemaining = entry.cooldownSeconds;
  }

  private applyVariation(entry: ManagedSoundEntry, voice: SoundVoice): void {
    const volume = randomFloat(entry.volumeRange[0], entry.volumeRange[1]);
    const pitch = randomFloat(entry.pitchRange[0], entry.pitchRange[1]);
    voice.setVolume(volume);
    voice.setPitch(pitch);
  }

  private stopSpatialVoices(entry: ManagedSoundEntry): void {
    for (let index = 0; index < entry.spatialVoices.length; index++) {
      entry.spatialVoices[index].stop();
    }
    entry.spatialVoices = [];
  }
}
