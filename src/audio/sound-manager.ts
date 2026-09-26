import type { Music, Sound, Vec3 } from '../core/types';
import { randomFloat } from '../math';
import {
  BUS_MUSIC,
  BUS_SFX,
  BUS_UI,
  loadMusicRaw,
  loadSound as loadSoundAsset,
  playMusicRaw,
  playSound as playSoundAsset,
  playSound3D as playSound3DAsset,
  playSound3DEx,
  playSoundEx,
  setBusGain as setMixerBusGain,
  setMasterVolume as setMixerMasterVolume,
  setMusicVolumeRaw,
  setSoundBus as setSoundBusForAsset,
  setSoundLowpass as setSoundLowpassForAsset,
  setSoundReverbSend as setSoundReverbSendForAsset,
  setSoundVolume as setSoundVolumeForAsset,
  stopMusicRaw,
  stopSound as stopSoundAsset,
  unloadMusicRaw,
  unloadSound as unloadSoundAsset,
  updateMusicStreamRaw,
  voiceSetPitch,
  voiceSetVolume,
  voiceStop,
} from './index';

export interface ManagedSoundOptions {
  bus?: number;
  volume?: number;
  reverbSend?: number;
  lowpassHz?: number;
  cooldownSeconds?: number;
  volumeRange?: [number, number];
  pitchRange?: [number, number];
}

export interface ManagedMusicOptions {
  volume?: number;
}

export interface SpatialSoundOptions {
  looping?: boolean;
  refDist?: number;
  maxDist?: number;
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
  spatialVoices: number[];
}

interface ManagedMusicEntry {
  name: string;
  path: string;
  music: Music;
  handle: number;
}

function finiteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validVolumeRange(range: [number, number] | undefined): boolean {
  if (range === undefined) return true;
  return finiteNumber(range[0]) && finiteNumber(range[1]) &&
    range[0] >= 0 && range[0] <= range[1];
}

function validPitchRange(range: [number, number] | undefined): boolean {
  if (range === undefined) return true;
  return finiteNumber(range[0]) && finiteNumber(range[1]) &&
    range[0] >= 0.25 && range[0] <= range[1] && range[1] <= 4;
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
    if (!finiteNumber(volume) || volume < 0 || !finiteNumber(cooldownSeconds) ||
        cooldownSeconds < 0 || !validVolumeRange(options.volumeRange) ||
        !validPitchRange(options.pitchRange) || !validBus(bus) ||
        !finiteNumber(reverbSend) || reverbSend < 0 || reverbSend > 1 ||
        !finiteNumber(lowpassHz) || lowpassHz < 0) return null;

    const sound = loadSoundAsset(path);
    if (sound.handle === 0) return null;

    const volumeRange: [number, number] = options.volumeRange === undefined
      ? [1, 1]
      : [options.volumeRange[0], options.volumeRange[1]];
    const pitchRange: [number, number] = options.pitchRange === undefined
      ? [1, 1]
      : [options.pitchRange[0], options.pitchRange[1]];
    setSoundVolumeForAsset(sound, volume);
    setSoundBusForAsset(sound, bus);
    setSoundReverbSendForAsset(sound, reverbSend);
    setSoundLowpassForAsset(sound, lowpassHz);
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

  loadMusic(name: string, path: string, options: ManagedMusicOptions = {}): Music | null {
    if (this.disposed || name.length === 0 || path.length === 0) return null;

    const existing = this.findMusic(name);
    if (existing !== null) {
      return existing.path === path ? existing.music : null;
    }

    const volume = options.volume === undefined ? 1 : options.volume;
    if (!finiteNumber(volume) || volume < 0) return null;

    const handle = loadMusicRaw(path);
    if (handle === 0) return null;

    const music: Music = { handle };
    setMusicVolumeRaw(handle, volume);
    this.musics.push({ name, path, music, handle });
    return music;
  }

  playSound(name: string): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null || entry.cooldownRemaining > 0) return false;

    const voice = playSoundEx(entry.sound);
    if (voice === 0) {
      playSoundAsset(entry.sound);
    } else {
      this.applyVariation(entry, voice);
    }
    this.startCooldown(entry);
    return true;
  }

  stopSound(name: string): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null) return false;
    stopSoundAsset(entry.sound);
    this.stopSpatialVoices(entry);
    return true;
  }

  setSoundVolume(name: string, volume: number): boolean {
    const entry = this.findSound(name);
    if (this.disposed || entry === null) return false;
    setSoundVolumeForAsset(entry.sound, volume);
    return true;
  }

  unloadSound(name: string): boolean {
    const index = this.findSoundIndex(name);
    if (this.disposed || index < 0) return false;
    const entry = this.sounds[index];
    stopSoundAsset(entry.sound);
    this.stopSpatialVoices(entry);
    unloadSoundAsset(entry.sound);
    removeAt(this.sounds, index);
    return true;
  }

  playMusic(name: string): boolean {
    const entry = this.findMusic(name);
    if (this.disposed || entry === null) return false;

    if (this.currentMusicName !== null) {
      const previous = this.findMusic(this.currentMusicName);
      if (previous !== null) stopMusicRaw(previous.handle);
    }
    playMusicRaw(entry.handle);
    this.currentMusicName = name;
    return true;
  }

  stopMusic(name?: string): boolean {
    if (this.disposed) return false;
    if (name === undefined) {
      for (let index = 0; index < this.musics.length; index++) {
        stopMusicRaw(this.musics[index].handle);
      }
      this.currentMusicName = null;
      return true;
    }

    const entry = this.findMusic(name);
    if (entry === null) return false;
    stopMusicRaw(entry.handle);
    if (this.currentMusicName === name) this.currentMusicName = null;
    return true;
  }

  setMusicVolume(name: string, volume: number): boolean {
    const entry = this.findMusic(name);
    if (this.disposed || entry === null) return false;
    setMusicVolumeRaw(entry.handle, volume);
    return true;
  }

  unloadMusic(name: string): boolean {
    const index = this.findMusicIndex(name);
    if (this.disposed || index < 0) return false;
    const entry = this.musics[index];
    stopMusicRaw(entry.handle);
    unloadMusicRaw(entry.handle);
    if (this.currentMusicName === name) this.currentMusicName = null;
    removeAt(this.musics, index);
    return true;
  }

  play3D(name: string, position: Vec3, options: SpatialSoundOptions = {}): number {
    const entry = this.findSound(name);
    if (this.disposed || entry === null || entry.cooldownRemaining > 0) return 0;

    const voice = playSound3DEx(
      entry.sound,
      position.x,
      position.y,
      position.z,
      options.looping === undefined ? false : options.looping,
      options.refDist === undefined ? 1 : options.refDist,
      options.maxDist === undefined ? 0 : options.maxDist,
      options.rolloff === undefined ? 1 : options.rolloff,
    );
    if (voice === 0) {
      playSound3DAsset(entry.sound, position.x, position.y, position.z);
    } else {
      this.applyVariation(entry, voice);
      entry.spatialVoices.push(voice);
    }
    this.startCooldown(entry);
    return voice;
  }

  setMasterVolume(volume: number): void {
    if (this.disposed) return;
    setMixerMasterVolume(volume);
  }

  setBusGain(bus: number, gain: number): void {
    if (this.disposed) return;
    setMixerBusGain(bus, gain);
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (finiteNumber(dt) && dt > 0) {
      for (let index = 0; index < this.sounds.length; index++) {
        const entry = this.sounds[index];
        entry.cooldownRemaining -= dt;
        if (entry.cooldownRemaining < 0) entry.cooldownRemaining = 0;
      }
    }
    for (let index = 0; index < this.musics.length; index++) {
      updateMusicStreamRaw(this.musics[index].handle);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (let index = 0; index < this.sounds.length; index++) {
      const entry = this.sounds[index];
      stopSoundAsset(entry.sound);
      this.stopSpatialVoices(entry);
      unloadSoundAsset(entry.sound);
    }
    for (let index = 0; index < this.musics.length; index++) {
      const handle = this.musics[index].handle;
      stopMusicRaw(handle);
      unloadMusicRaw(handle);
    }
    this.sounds = [];
    this.musics = [];
    this.currentMusicName = null;
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

  private applyVariation(entry: ManagedSoundEntry, voice: number): void {
    const volume = randomFloat(entry.volumeRange[0], entry.volumeRange[1]);
    const pitch = randomFloat(entry.pitchRange[0], entry.pitchRange[1]);
    voiceSetVolume(voice, volume);
    voiceSetPitch(voice, pitch);
  }

  private stopSpatialVoices(entry: ManagedSoundEntry): void {
    for (let index = 0; index < entry.spatialVoices.length; index++) {
      voiceStop(entry.spatialVoices[index]);
    }
    entry.spatialVoices = [];
  }
}
