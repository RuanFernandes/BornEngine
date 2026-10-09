// Particle emitter FFI. Handles stay inside engine-owned Texture and component
// instances; configuration and transform data use a dedicated native scratch.
declare function bloom_particle2d_create(capacity: number, texture: number): number;
declare function bloom_particle2d_scratch_reset(): void;
declare function bloom_particle2d_scratch_push_f32(value: number): void;
declare function bloom_particle2d_configure(handle: number): number;
declare function bloom_particle2d_emit(handle: number, count: number): void;
declare function bloom_particle2d_play(handle: number): void;
declare function bloom_particle2d_stop(handle: number): void;
declare function bloom_particle2d_update(handle: number, deltaTime: number): number;
declare function bloom_particle2d_draw(handle: number): void;
declare function bloom_particle2d_clear(handle: number): void;
declare function bloom_particle2d_destroy(handle: number): void;
declare function bloom_particle2d_live(handle: number): number;

export interface ParticleTransformData {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
}

function pushScratch(values: number[]): void {
  bloom_particle2d_scratch_reset();
  for (let index = 0; index < values.length; index++) {
    bloom_particle2d_scratch_push_f32(values[index]);
  }
}

function transformValues(transform: ParticleTransformData): number[] {
  return [transform.position.x, transform.position.y, transform.rotation, transform.scale.x, transform.scale.y];
}

export function createParticleEmitter2D(capacity: number, texture: number): number {
  return bloom_particle2d_create(capacity, texture);
}

export function configureParticleEmitter2D(handle: number, values: number[]): boolean {
  pushScratch(values);
  return bloom_particle2d_configure(handle) !== 0;
}

export function emitParticleBurst2D(
  handle: number,
  count: number,
  position: { x: number; y: number },
  direction: { x: number; y: number },
  transform: ParticleTransformData,
): void {
  pushScratch([
    position.x,
    position.y,
    direction.x,
    direction.y,
    transform.position.x,
    transform.position.y,
    transform.rotation,
    transform.scale.x,
    transform.scale.y,
  ]);
  bloom_particle2d_emit(handle, count);
}

export function playParticleEmitter2D(handle: number): void {
  bloom_particle2d_play(handle);
}
export function stopParticleEmitter2D(handle: number): void {
  bloom_particle2d_stop(handle);
}

export function updateParticleEmitter2D(handle: number, deltaTime: number, transform: ParticleTransformData): number {
  pushScratch(transformValues(transform));
  return bloom_particle2d_update(handle, deltaTime);
}

export function drawParticleEmitter2D(handle: number, transform: ParticleTransformData): void {
  pushScratch(transformValues(transform));
  bloom_particle2d_draw(handle);
}

export function clearParticleEmitter2D(handle: number): void {
  bloom_particle2d_clear(handle);
}
export function destroyParticleEmitter2D(handle: number): void {
  bloom_particle2d_destroy(handle);
}
export function particleEmitter2DLiveCount(handle: number): number {
  return bloom_particle2d_live(handle);
}
