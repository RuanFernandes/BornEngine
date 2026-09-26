import { getGameContext } from '../core/context';
import type { ContextResource, GameContext } from '../core/context';
import type { Game } from '../core/game';
import type { Renderer, InstancedDrawSource } from '../core/renderer';
import type { Material } from '../models/material';
import type { Mesh, Model } from '../models/model';
import * as modelOperations from '../models/internal';
import type { Vec3 } from '../core/types';

// EN-026 particles + EN-027 decals. Native pool/buffer identifiers stay private.
declare function bloom_particles_create(capacity: number): number;
declare function bloom_particles_configure(sys: number): void;
declare function bloom_particles_emit(sys: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, count: number): void;
declare function bloom_particles_update(sys: number, dt: number): number;
declare function bloom_particles_instance_buffer(sys: number): number;
declare function bloom_particles_clear(sys: number): void;
declare function bloom_particles_live(sys: number): number;
declare function bloom_decals_init(capacity: number): number;
declare function bloom_decals_spawn(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, roll: number): void;
declare function bloom_decals_set_style(frame: number, r: number, g: number, b: number, a: number, life: number, fade: number): void;
declare function bloom_decals_update(dt: number): number;
declare function bloom_decals_instance_buffer(): number;
declare function bloom_decals_clear(): void;
declare function bloom_mesh_scratch_reset(): void;
declare function bloom_mesh_scratch_push_f32(v: number): void;

export interface ParticleConfig {
  life?: number;
  lifeVar?: number;
  speed?: number;
  speedVar?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  size0?: number;
  size1?: number;
  sizeVar?: number;
  color0?: [number, number, number, number];
  color1?: [number, number, number, number];
  spin?: number;
  spinVar?: number;
  posJitter?: number;
  stretch?: number;
  inherit?: number;
  frames?: number;
  floorY?: number;
  restitution?: number;
}

export interface ParticleEmitOptions {
  position: Vec3;
  direction: Vec3;
  count: number;
}

/** Game-owned particle pool. Configure it once, emit bursts, update, then draw through Renderer. */
export class ParticleSystem implements ContextResource, InstancedDrawSource {
  readonly error: string | null;
  private handleValue = 0;
  private bufferValue = 0;
  private disposed = false;
  private liveCountValue = 0;

  private readonly context: GameContext;

  constructor(owner: Game, readonly capacity: number, config: ParticleConfig = {}) {
    const context = getGameContext(owner);
    this.context = context;
    if (!context.isReady || context.isDisposed || capacity <= 0) {
      this.error = 'A ready Game and positive particle capacity are required.';
      return;
    }
    this.handleValue = bloom_particles_create(capacity);
    this.error = this.handleValue === 0 ? 'Unable to allocate the particle pool.' : null;
    if (this.handleValue !== 0) {
      context.register(this);
      this.configure(config);
    }
  }

  get isLoaded(): boolean { return !this.disposed && this.context.isReady && !this.context.isDisposed && this.context.owns(this) && this.handleValue !== 0; }
  get liveCount(): number { return this.isLoaded ? bloom_particles_live(this.handleValue) : 0; }

  configure(config: ParticleConfig): boolean {
    if (!this.isLoaded) return false;
    const color0 = config.color0 ?? [1, 1, 1, 1];
    const color1 = config.color1 ?? [1, 1, 1, 0];
    const values = [
      config.life ?? 1, config.lifeVar ?? 0, config.speed ?? 1, config.speedVar ?? 0,
      config.spread ?? 0.3, config.gravity ?? -9.81, config.drag ?? 0,
      config.size0 ?? 0.2, config.size1 ?? 0.2, config.sizeVar ?? 0,
      color0[0], color0[1], color0[2], color0[3], color1[0], color1[1], color1[2], color1[3],
      config.spin ?? 0, config.spinVar ?? 0, config.posJitter ?? 0, config.stretch ?? 0,
      config.inherit ?? 0, config.frames ?? 1, config.floorY ?? 0, config.restitution ?? 0,
    ];
    bloom_mesh_scratch_reset();
    for (const value of values) bloom_mesh_scratch_push_f32(value);
    bloom_particles_configure(this.handleValue);
    return true;
  }

  emit(options: ParticleEmitOptions): boolean {
    if (!this.isLoaded || options.count <= 0) return false;
    bloom_particles_emit(this.handleValue, options.position.x, options.position.y, options.position.z,
      options.direction.x, options.direction.y, options.direction.z, options.count);
    return true;
  }

  update(deltaTime: number): number {
    if (!this.isLoaded) return 0;
    this.liveCountValue = bloom_particles_update(this.handleValue, deltaTime);
    this.bufferValue = bloom_particles_instance_buffer(this.handleValue);
    return this.liveCountValue;
  }

  clear(): void { if (this.isLoaded) { bloom_particles_clear(this.handleValue); this.liveCountValue = 0; } }

  draw(renderer: Renderer, material: Material, mesh: Model | Mesh, meshIndex = 0): boolean {
    return renderer.drawInstanced(material, mesh, this, meshIndex);
  }

  /** @internal Renderer entry point. */
  drawNative(material: Material, mesh: Model | Mesh, meshIndex: number): boolean {
    if (!this.isLoaded || this.liveCountValue <= 0 || this.bufferValue === 0) return false;
    const nativeModel = toNativeModel(mesh);
    modelOperations.drawMeshWithMaterialInstanced((material as any).handleValue, nativeModel, meshIndex,
      this.bufferValue, this.liveCountValue);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) bloom_particles_clear(this.handleValue);
    // The current native ABI has no particle-pool release function.
    this.handleValue = 0;
    this.bufferValue = 0;
    this.liveCountValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}

export interface DecalStyle {
  frame: number;
  color: [number, number, number, number];
  lifetime: number;
  fadeDuration: number;
}

const DECAL_RUNTIME_SLOT = {};

/** Game-owned decal ring. The native ABI provides one ring per runtime. */
export class DecalSystem implements ContextResource, InstancedDrawSource {
  readonly error: string | null;
  private handleValue = 0;
  private bufferValue = 0;
  private disposed = false;
  private liveCountValue = 0;
  private readonly context: GameContext;
  private readonly ownsRuntimeSlot: boolean;

  constructor(owner: Game, readonly capacity: number) {
    this.context = getGameContext(owner);
    const registered = this.context.getOrCreateService(DECAL_RUNTIME_SLOT, () => this);
    this.ownsRuntimeSlot = registered === this;
    if (!this.ownsRuntimeSlot || !this.context.isReady || this.context.isDisposed || capacity <= 0) {
      this.error = this.ownsRuntimeSlot
        ? 'A ready Game and positive decal capacity are required.'
        : 'A Game can own only one DecalSystem.';
      if (this.ownsRuntimeSlot) this.context.removeService(DECAL_RUNTIME_SLOT, this);
      return;
    }
    this.handleValue = bloom_decals_init(capacity);
    this.error = this.handleValue === 0 ? 'Unable to allocate the decal ring.' : null;
    if (this.handleValue !== 0) this.context.register(this);
    else this.context.removeService(DECAL_RUNTIME_SLOT, this);
  }

  get isLoaded(): boolean { return !this.disposed && this.context.isReady && !this.context.isDisposed && this.context.owns(this) && this.handleValue !== 0; }
  get liveCount(): number { return this.liveCountValue; }

  setStyle(style: DecalStyle): boolean {
    if (!this.isLoaded) return false;
    bloom_decals_set_style(style.frame, style.color[0], style.color[1], style.color[2], style.color[3], style.lifetime, style.fadeDuration);
    return true;
  }

  spawn(position: Vec3, normal: Vec3, size: number, roll = 0): boolean {
    if (!this.isLoaded || size <= 0) return false;
    bloom_decals_spawn(position.x, position.y, position.z, normal.x, normal.y, normal.z, size, roll);
    return true;
  }

  update(deltaTime: number): number {
    if (!this.isLoaded) return 0;
    this.liveCountValue = bloom_decals_update(deltaTime);
    this.bufferValue = bloom_decals_instance_buffer();
    return this.liveCountValue;
  }

  clear(): void { if (this.isLoaded) { bloom_decals_clear(); this.liveCountValue = 0; } }

  draw(renderer: Renderer, material: Material, mesh: Model | Mesh, meshIndex = 0): boolean {
    return renderer.drawInstanced(material, mesh, this, meshIndex);
  }

  /** @internal Renderer entry point. */
  drawNative(material: Material, mesh: Model | Mesh, meshIndex: number): boolean {
    if (!this.isLoaded || this.liveCountValue <= 0 || this.bufferValue === 0) return false;
    modelOperations.drawMeshWithMaterialInstanced((material as any).handleValue, toNativeModel(mesh), meshIndex,
      this.bufferValue, this.liveCountValue);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) bloom_decals_clear();
    // The current native ABI has no decal-ring release function.
    this.handleValue = 0;
    this.bufferValue = 0;
    this.liveCountValue = 0;
    this.disposed = true;
    this.context.unregister(this);
    if (this.ownsRuntimeSlot) this.context.removeService(DECAL_RUNTIME_SLOT, this);
  }
}

function toNativeModel(model: Model | Mesh): any {
  return {
    handle: (model as any).handleValue as number,
    meshCount: (model as any).meshCount as number,
    materialCount: (model as any).materialCount as number,
    transform: (model as any).transform as number[],
  };
}
