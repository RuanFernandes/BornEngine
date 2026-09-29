import type { Camera2D, Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import type { Renderer } from '../core/renderer';
import { GameComponent } from '../game/game-component';
import { GameObject } from '../game/game-object';

export interface ParallaxLayer2DOptions {
  factor?: number | Vector2DLike;
  renderOrder?: number;
  draw?: (renderer: Renderer, offset: Vector2D) => void;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validPoint(value: Vector2DLike | undefined | null): value is Vector2DLike {
  return value !== undefined && value !== null && finite(value.x) && finite(value.y);
}

function factorPoint(value: number | Vector2DLike | undefined): Vector2D {
  if (value === undefined) return Vector2D.one();
  if (typeof value === 'number') return new Vector2D(value, value);
  return validPoint(value) ? Vector2D.from(value) : new Vector2D(NaN, NaN);
}

/** Provides a camera-relative offset for a layer and its child sprites. */
export class ParallaxLayer2D extends GameComponent {
  private readonly factorValue: Vector2DLike;
  readonly error: string | null;
  private anchor: Vector2DLike | null = null;
  private readonly drawCallback: ((renderer: Renderer, offset: Vector2D) => void) | null;

  constructor(options: ParallaxLayer2DOptions = {}) {
    super();
    const settings = options === null || options === undefined ? {} : options;
    const factor = factorPoint(settings.factor);
    let error: string | null = null;
    if (!validPoint(factor)) error = 'ParallaxLayer2D factor must be finite.';
    if (settings.renderOrder !== undefined) {
      if (!finite(settings.renderOrder)) error = 'ParallaxLayer2D renderOrder must be finite.';
      else this.renderOrder = settings.renderOrder;
    }
    this.factorValue = validPoint(factor) ? factor : { x: 1, y: 1 };
    this.error = error;
    this.drawCallback = typeof settings.draw === 'function' ? settings.draw : null;
  }

  get factor(): Vector2D { return Vector2D.from(this.factorValue); }

  render(renderer: Renderer): void {
    if (this.error !== null || !this.isActiveAndEnabled || this.drawCallback === null) return;
    this.drawCallback(renderer, this.offsetForCamera(renderer.activeCamera2D));
  }

  offsetForCamera(camera: Camera2D | null): Vector2D {
    if (camera === null || camera === undefined || !validPoint(camera.target)) return Vector2D.zero();
    if (this.anchor === null) this.anchor = Vector2D.from(camera.target);
    return new Vector2D(
      (camera.target.x - this.anchor.x) * (1 - this.factorValue.x),
      (camera.target.y - this.anchor.y) * (1 - this.factorValue.y),
    );
  }

  resetAnchor(camera: Camera2D | null): void {
    this.anchor = camera === null || !validPoint(camera.target)
      ? null
      : Vector2D.from(camera.target);
  }
}

/** Sums offsets from enabled parallax layers on an object and its ancestors. */
export function getParallaxOffset(owner: GameObject | null, camera: Camera2D | null): Vector2D {
  let x = 0;
  let y = 0;
  let current = owner;
  while (current !== null) {
    const layers = current.getComponents(ParallaxLayer2D);
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      if (!layer.isActiveAndEnabled || layer.error !== null) continue;
      const offset = layer.offsetForCamera(camera);
      x += offset.x;
      y += offset.y;
    }
    current = current.parent;
  }
  return new Vector2D(x, y);
}
