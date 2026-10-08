import type { Game } from '../core/game';
import type { Scene } from '../game/scene';
import { ParticleSystem } from './index';
import type { ParticleConfig } from './index';
import { DecalSystem } from './index';

type SceneEffect = {
  update(deltaTime: number): number;
  dispose(): void;
  readonly isDisposed: boolean;
};

/** Factories and lifetime management for effects that belong to one Scene. */
export class SceneVfx {
  private effects: SceneEffect[] = [];
  private disposed = false;

  constructor(
    private readonly game: Game,
    private readonly scene: Scene,
  ) {}

  /** Creates an owned 3D particle pool, updated automatically with the Scene. */
  createParticleSystem(capacity: number, config: ParticleConfig = {}): ParticleSystem | null {
    if (!this.canCreate() || capacity <= 0) return null;
    const system = ParticleSystem._create(this.game, capacity, config);
    this.effects.push(system);
    return system;
  }

  /** Creates an owned 3D decal pool, updated automatically with the Scene. */
  createDecalSystem(capacity: number): DecalSystem | null {
    if (!this.canCreate() || capacity <= 0) return null;
    const system = DecalSystem._create(this.game, capacity);
    this.effects.push(system);
    return system;
  }

  /** @internal Scene lifecycle hook; effect simulation follows its owner. */
  update(deltaTime: number): void {
    if (this.disposed) return;
    let index = 0;
    while (index < this.effects.length) {
      const effect = this.effects[index];
      if (effect.isDisposed) {
        this.effects.splice(index, 1);
      } else {
        effect.update(deltaTime);
        index++;
      }
    }
  }

  /** @internal Releases all effects when their owning Scene unloads. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = this.effects.length - 1; index >= 0; index--) {
      this.effects[index].dispose();
    }
    this.effects = [];
  }

  private canCreate(): boolean {
    return !this.disposed && this.scene._canCreateScopedResources();
  }
}
