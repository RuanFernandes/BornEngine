import type { Camera2D, Vec2 } from '../core/types';
import type { Renderer } from '../core/renderer';
import { GameComponent } from '../game/game-component';
import { GameObject } from '../game/game-object';

export interface ParallaxLayer2DOptions {
  factor?: number | Vec2;
  renderOrder?: number;
  draw?: (renderer: Renderer, offset: Vec2) => void;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validPoint(value: Vec2 | undefined | null): value is Vec2 {
  return value !== undefined && value !== null && finite(value.x) && finite(value.y);
}

function factorPoint(value: number | Vec2 | undefined): Vec2 {
  if (value === undefined) return { x: 1, y: 1 };
  if (typeof value === 'number') return { x: value, y: value };
  return validPoint(value) ? { x: value.x, y: value.y } : { x: NaN, y: NaN };
}

/** Provides a camera-relative offset for a layer and its child sprites. */
export class ParallaxLayer2D extends GameComponent {
  private readonly factorValue: Vec2;
  readonly error: string | null;
  private anchor: Vec2 | null = null;
  private readonly drawCallback: ((renderer: Renderer, offset: Vec2) => void) | null;

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

  get factor(): Vec2 { return { x: this.factorValue.x, y: this.factorValue.y }; }

  render(renderer: Renderer): void {
    if (this.error !== null || !this.isActiveAndEnabled || this.drawCallback === null) return;
    this.drawCallback(renderer, this.offsetForCamera(renderer.activeCamera2D));
  }

  offsetForCamera(camera: Camera2D | null): Vec2 {
    if (camera === null || camera === undefined || !validPoint(camera.target)) return { x: 0, y: 0 };
    if (this.anchor === null) this.anchor = { x: camera.target.x, y: camera.target.y };
    return {
      x: (camera.target.x - this.anchor.x) * (1 - this.factorValue.x),
      y: (camera.target.y - this.anchor.y) * (1 - this.factorValue.y),
    };
  }

  resetAnchor(camera: Camera2D | null): void {
    this.anchor = camera === null || !validPoint(camera.target)
      ? null
      : { x: camera.target.x, y: camera.target.y };
  }
}

/** Sums offsets from enabled parallax layers on an object and its ancestors. */
export function getParallaxOffset(owner: GameObject | null, camera: Camera2D | null): Vec2 {
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
  return { x, y };
}
