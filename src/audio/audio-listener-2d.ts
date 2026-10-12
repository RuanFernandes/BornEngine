import type { Game } from '../core/game';
import type { GameContext } from '../core/context';
import { getGameContext } from '../core/context';
import type { Vec3 } from '../core/types';
import { GameComponent } from '../game/game-component';
import { setListenerPosition } from './internal';
import type { AudioSystem } from './audio-system';

type Position2D = { x: number; y: number };

/** Construction options for an AudioListener2D. */
export interface AudioListener2DOptions {
  /** @internal Binds the Game-wide listener to its audio system. */
  system?: { game: Game; audio: AudioSystem };
}

function copyPosition(position: Position2D): Position2D {
  return { x: position.x, y: position.y };
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

/** 2D-plane listener that follows its owner object, or the active Scene camera for the Game-wide listener. */
export class AudioListener2D extends GameComponent {
  private explicitPosition: Position2D | null = null;
  private disposed = false;
  private readonly game: Game | null;
  private readonly audio: AudioSystem | null;
  private readonly systemContext: GameContext | null;

  /** Creates a listener. Attach it to a GameObject to follow that object. */
  constructor(options: AudioListener2DOptions = {}) {
    super();
    const system = options.system;
    this.game = system === undefined ? null : system.game;
    this.audio = system === undefined ? null : system.audio;
    this.systemContext = system === undefined ? null : getGameContext(system.game);
  }

  /** True once the listener has been disposed or its component destroyed. */
  get isDisposed(): boolean {
    return this.disposed || this.destroyed;
  }

  /** Set an explicit listener location in the game's XY world plane. */
  setPosition(position: Position2D): boolean {
    const context = this.activeContext();
    if (context === null || !finite(position.x) || !finite(position.y)) return false;
    this.explicitPosition = copyPosition(position);
    return true;
  }

  /** Clear the explicit position and follow the owner object, or the active Scene camera for the Game-wide listener. */
  followCamera(): void {
    if (this.isDisposed) return;
    this.explicitPosition = null;
  }

  /** Synchronize the native listener from the owner object, or from the camera for the Game-wide listener. */
  update(_deltaTime = 0): void {
    const context = this.activeContext();
    if (context === null) return;
    const owner = this.gameObject;
    if (owner !== null) {
      const worldPosition = owner.transform.worldPosition;
      const worldRotation = owner.transform.worldRotation;
      const position = this.explicitPosition ?? worldPosition;
      this.applyListener(position, 2 * Math.atan2(worldRotation.z, worldRotation.w));
      return;
    }
    if (this.game === null || this.audio === null) return;
    const scene = this.game.scenes.currentScene;
    const camera = scene === null ? null : scene.camera2D;
    const position = this.explicitPosition ?? (camera === null ? { x: 0, y: 0 } : camera.target);
    this.applyListener(position, camera === null ? 0 : camera.rotation);
  }

  /** @internal */
  _belongsToContext(context: GameContext): boolean {
    return this.activeContext() === context;
  }

  /** Disposes the listener when the component is destroyed. */
  onDestroy(): void {
    this.dispose();
  }

  /** Releases the listener and clears any explicit position. Safe to call repeatedly. */
  dispose(): void {
    this.disposed = true;
    this.explicitPosition = null;
  }

  private activeContext(): GameContext | null {
    if (this.isDisposed) return null;
    const owner = this.gameObject;
    const context = owner !== null ? (owner.scene?.context ?? null) : this.systemContext;
    if (context === null || !context.isReady || context.isDisposed) return null;
    return context;
  }

  private applyListener(position: Position2D, rotation: number): void {
    const nativePosition: Vec3 = { x: position.x, y: 0, z: position.y };
    const forward: Vec3 = { x: Math.sin(rotation), y: 0, z: -Math.cos(rotation) };
    if (this.audio !== null && this.gameObject === null) {
      this.audio.setListener(nativePosition, forward);
      return;
    }
    setListenerPosition(nativePosition.x, nativePosition.y, nativePosition.z, forward.x, forward.y, forward.z);
  }
}
