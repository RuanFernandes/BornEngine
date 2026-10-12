import { GameComponent } from '../game/game-component';
import type { Texture } from '../textures/texture';
import { SpriteAnimator } from './sprite-animator';
import type { SpritePlayOptions } from './sprite-animator';
import { SpriteAnimationTemplateRenderer, loadSpriteAnimationTemplate } from './sprite-animation-template-runtime';

/** Options for `SpriteAnimationComponent`, passed through `@GameComponent<SpriteAnimationComponent>(...)`. */
export interface SpriteAnimationComponentOptions {
  /** Path to a `.spriteanim-template.json` file. */
  readonly template: string;
  /** Texture paths keyed by image parameter ID. */
  readonly images: Readonly<Record<string, string>>;
  /** Clip to play as soon as the component wakes. */
  readonly autoplay?: string;
  /** Texture filter applied to every loaded image, for example `FILTER_NEAREST`. */
  readonly filter?: number;
}

/**
 * Draws a layered template animation on its GameObject and plays it.
 * Textures load from the owning scene's assets when the component wakes.
 */
export class SpriteAnimationComponent extends GameComponent {
  declare readonly __options: SpriteAnimationComponentOptions;

  private readonly settings: SpriteAnimationComponentOptions;
  private rendererValue: SpriteAnimationTemplateRenderer | null = null;
  private animatorValue: SpriteAnimator | null = null;

  constructor(options: SpriteAnimationComponentOptions) {
    super();
    this.settings = options;
  }

  /** The renderer that draws the current frame, or `null` before the component wakes. */
  get renderer(): SpriteAnimationTemplateRenderer | null {
    return this.rendererValue;
  }

  /** The animator that plays clips, or `null` before the component wakes. */
  get animator(): SpriteAnimator | null {
    return this.animatorValue;
  }

  /** Loads the template and its textures, then attaches a renderer and an animator to the GameObject. */
  override onAwake(): void {
    super.onAwake();
    const owner = this.gameObject;
    const scene = owner === null ? null : owner.scene;
    if (owner === null || scene === null) throw new Error('SpriteAnimationComponent needs a GameObject in a scene');

    const images: Record<string, Texture> = Object.create(null);
    for (const id of Object.keys(this.settings.images)) {
      const path = this.settings.images[id];
      const texture = scene._loadTexture(path);
      if (texture === null || !texture.isLoaded) throw new Error(`Could not load texture ${path}`);
      if (this.settings.filter !== undefined) texture.setFilter(this.settings.filter);
      images[id] = texture;
    }

    const animation = loadSpriteAnimationTemplate(this.settings.template, images);
    const renderer = owner.addComponent(new SpriteAnimationTemplateRenderer(animation));
    if (renderer === null) throw new Error('Could not attach sprite renderer');
    const animator = owner.addComponent(new SpriteAnimator(renderer, { autoplay: this.settings.autoplay }));
    if (animator === null) throw new Error('Could not attach sprite animator');
    this.rendererValue = renderer;
    this.animatorValue = animator;
  }

  /** Plays a clip by name. Returns `false` if the animator is not ready or the clip is unknown. */
  play(name: string, options?: SpritePlayOptions): boolean {
    return this.animatorValue === null ? false : this.animatorValue.play(name, options);
  }

  /** Sets the facing direction for directional clips: 0 up, 1 left, 2 down, 3 right. */
  setDir(dir: number): boolean {
    return this.animatorValue === null ? false : this.animatorValue.setDir(dir);
  }

  /** Sets a boolean parameter read by state machine transitions. */
  setBool(name: string, value: boolean): boolean {
    return this.animatorValue === null ? false : this.animatorValue.setBool(name, value);
  }

  /** Sets a numeric parameter read by state machine transitions. */
  setNumber(name: string, value: number): boolean {
    return this.animatorValue === null ? false : this.animatorValue.setNumber(name, value);
  }

  /** Fires a trigger parameter for the next state machine evaluation. */
  setTrigger(name: string): boolean {
    return this.animatorValue === null ? false : this.animatorValue.setTrigger(name);
  }
}
