import { GameContext } from '../core/context';
import type { Vec3 } from '../core/types';
import * as operations from './internal';
import { Sound, StagedSound } from './sound';
import { Music, StagedMusic } from './music';
import { SoundManager } from './sound-manager';

/** Game-owned audio device, mixer controls, and resource factory. */
export class AudioSystem {
  private sounds: Sound[] = [];
  private musics: Music[] = [];
  private stagedSounds: StagedSound[] = [];
  private stagedMusics: StagedMusic[] = [];
  private managers: SoundManager[] = [];
  private deviceOpen = false;
  private disposed = false;

  constructor(private readonly context: GameContext) {
    if (!context.isDisposed) {
      operations.initAudioDevice();
      this.deviceOpen = true;
    }
  }

  get isReady(): boolean { return this.deviceOpen && this.context.isReady && !this.context.isDisposed && !this.disposed; }

  loadSound(path: string): Sound {
    const sound = new Sound(this.context, path);
    this.sounds.push(sound);
    return sound;
  }

  async loadSoundAsync(path: string): Promise<Sound> {
    const staged = await StagedSound.stage(this.context, path);
    this.stagedSounds.push(staged);
    return this.trackSound(staged.commit());
  }

  stageSounds(paths: string[]): StagedSound[] {
    const staged = StagedSound.stageMany(this.context, paths);
    this.stagedSounds = this.stagedSounds.concat(staged);
    return staged;
  }

  loadMusic(path: string): Music {
    const music = new Music(this.context, path);
    this.musics.push(music);
    return music;
  }

  async loadMusicAsync(path: string): Promise<Music> {
    const staged = await StagedMusic.stage(this.context, path);
    this.stagedMusics.push(staged);
    return this.trackMusic(staged.commit());
  }

  stageMusic(paths: string[]): StagedMusic[] {
    const staged = StagedMusic.stageMany(this.context, paths);
    this.stagedMusics = this.stagedMusics.concat(staged);
    return staged;
  }

  createSoundManager(): SoundManager { return new SoundManager(this); }

  setMasterVolume(volume: number): boolean {
    if (!this.isReady) return false;
    operations.setMasterVolume(volume);
    return true;
  }

  setBusGain(bus: number, gain: number): boolean {
    if (!this.isReady) return false;
    operations.setBusGain(bus, gain);
    return true;
  }

  duckBus(bus: number, amount: number, attack: number, release: number, hold: number): boolean {
    if (!this.isReady) return false;
    operations.duckBus(bus, amount, attack, release, hold);
    return true;
  }

  setReverb(size: number, damp: number, wet: number): boolean {
    if (!this.isReady) return false;
    operations.setReverb(size, damp, wet);
    return true;
  }

  setListener(position: Vec3, forward: Vec3): boolean {
    if (!this.isReady) return false;
    operations.setListenerPosition(position.x, position.y, position.z, forward.x, forward.y, forward.z);
    return true;
  }

  /** Advance cooldown timers and stream every live Music resource once. */
  update(deltaTime: number): void {
    if (!this.isReady) return;
    for (let index = 0; index < this.managers.length; index++) this.managers[index].update(deltaTime);
    for (let index = 0; index < this.musics.length; index++) this.musics[index].update();
  }

  /** @internal */
  registerManager(manager: SoundManager): boolean {
    if (this.disposed) return false;
    if (this.managers.indexOf(manager) < 0) this.managers.push(manager);
    return true;
  }

  /** @internal */
  unregisterManager(manager: SoundManager): void {
    const index = this.managers.lastIndexOf(manager);
    if (index >= 0) this.managers.splice(index, 1);
  }

  /** @internal */
  trackSound(sound: Sound): Sound { if (this.sounds.indexOf(sound) < 0) this.sounds.push(sound); return sound; }

  /** @internal */
  trackMusic(music: Music): Music { if (this.musics.indexOf(music) < 0) this.musics.push(music); return music; }

  dispose(): void {
    if (this.disposed) return;
    const managers = this.managers.slice();
    for (let index = managers.length - 1; index >= 0; index--) managers[index].dispose();
    this.managers.length = 0;

    for (let index = this.stagedMusics.length - 1; index >= 0; index--) this.stagedMusics[index].dispose();
    this.stagedMusics.length = 0;
    for (let index = this.stagedSounds.length - 1; index >= 0; index--) this.stagedSounds[index].dispose();
    this.stagedSounds.length = 0;

    for (let index = this.musics.length - 1; index >= 0; index--) this.musics[index].dispose();
    this.musics.length = 0;
    for (let index = this.sounds.length - 1; index >= 0; index--) this.sounds[index].dispose();
    this.sounds.length = 0;

    if (this.deviceOpen) operations.closeAudioDevice();
    this.deviceOpen = false;
    this.disposed = true;
  }
}
