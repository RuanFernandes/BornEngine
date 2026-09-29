import type { Game } from '../core/game';
import type { GameContext } from '../core/context';
import { getGameContext } from '../core/context';
import type { Vec3 } from '../core/types';
import type { AudioSystem } from './audio-system';

type Position2D = { x: number; y: number };

function copyPosition(position: Position2D): Position2D {
  return { x: position.x, y: position.y };
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

/** Shared 2D-plane listener that follows the active Scene camera by default. */
export class AudioListener2D {
  private explicitPosition: Position2D | null = null;
  private disposed = false;
  private readonly context: GameContext;

  constructor(private readonly game: Game, private readonly audio: AudioSystem) {
    this.context = getGameContext(game);
  }

  get isDisposed(): boolean { return this.disposed; }

  /** Set an explicit listener location in the game's XY world plane. */
  setPosition(position: Position2D): boolean {
    if (this.disposed || !this.context.isReady || this.context.isDisposed ||
        !finite(position.x) || !finite(position.y)) return false;
    this.explicitPosition = copyPosition(position);
    return true;
  }

  /** Resume following the active scene's Camera2D target and rotation. */
  followCamera(): void {
    if (this.disposed) return;
    this.explicitPosition = null;
  }

  /** @internal Synchronize the shared native listener once per audio frame. */
  update(): void {
    if (this.disposed || !this.context.isReady || this.context.isDisposed) return;
    const scene = this.game.scenes.currentScene;
    const camera = scene === null ? null : scene.camera2D;
    const position = this.explicitPosition ?? (camera === null ? { x: 0, y: 0 } : camera.target);
    const rotation = camera === null ? 0 : camera.rotation;
    const nativePosition: Vec3 = { x: position.x, y: 0, z: position.y };
    const forward: Vec3 = { x: Math.sin(rotation), y: 0, z: -Math.cos(rotation) };
    this.audio.setListener(nativePosition, forward);
  }

  /** @internal */
  _belongsToContext(context: GameContext): boolean { return this.context === context && !this.disposed; }

  dispose(): void {
    this.disposed = true;
    this.explicitPosition = null;
  }
}
