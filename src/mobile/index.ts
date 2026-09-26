import type { ContextOwner, ContextResource, GameContext } from '../core/context';
import { resolveContext } from '../core/context';
import type { InputSystem } from '../input/input-system';
import type { Renderer } from '../core/renderer';
import type { Color } from '../core/types';
import { Key } from '../core/keys';

export interface MobileHost extends ContextOwner {
  readonly input: InputSystem;
  readonly renderer: Renderer;
}

export interface VirtualJoystickOptions {
  zone?: 'left' | 'right';
  radius?: number;
  deadzone?: number;
  axisX?: number;
  axisY?: number;
}

export interface VirtualButtonOptions {
  radius?: number;
  label?: string;
  key?: number | null;
  gamepadButton?: number | null;
}

/** Game-owned touch input helpers with per-instance touch claims. */
export class TouchControls implements ContextResource {
  private readonly context: GameContext;
  private readonly joysticks: VirtualJoystick[] = [];
  private readonly buttons: VirtualButton[] = [];
  private readonly claimedTouches = new Set<number>();
  private disposed = false;

  constructor(private readonly host: MobileHost) {
    this.context = resolveContext(host);
    this.context.register(this);
  }

  get isReady(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed; }

  createJoystick(options: VirtualJoystickOptions = {}): VirtualJoystick {
    const joystick = new VirtualJoystick(this, options);
    this.joysticks.push(joystick);
    return joystick;
  }

  createButton(x: number, y: number, options: VirtualButtonOptions = {}): VirtualButton {
    const button = new VirtualButton(this, x, y, options);
    this.buttons.push(button);
    return button;
  }

  update(): void {
    if (!this.isReady) return;
    this.claimedTouches.clear();
    for (const joystick of this.joysticks) joystick.update();
    for (const button of this.buttons) button.update();
  }

  draw(): void {
    if (!this.isReady) return;
    for (const joystick of this.joysticks) joystick.draw();
    for (const button of this.buttons) button.draw();
  }

  movementInput(): { x: number; y: number } {
    if (!this.isReady) return { x: 0, y: 0 };
    const input = this.host.input;
    let x = (input.isKeyDown(Key.D) ? 1 : 0) - (input.isKeyDown(Key.A) ? 1 : 0);
    let y = (input.isKeyDown(Key.S) ? 1 : 0) - (input.isKeyDown(Key.W) ? 1 : 0);
    x += (input.isKeyDown(Key.RIGHT) ? 1 : 0) - (input.isKeyDown(Key.LEFT) ? 1 : 0);
    y += (input.isKeyDown(Key.DOWN) ? 1 : 0) - (input.isKeyDown(Key.UP) ? 1 : 0);
    const gamepadX = input.getGamepadAxis(0);
    const gamepadY = input.getGamepadAxis(1);
    if (Math.abs(gamepadX) > 0.1 || Math.abs(gamepadY) > 0.1) {
      x = gamepadX;
      y = gamepadY;
    }
    const length = Math.sqrt(x * x + y * y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  /** @internal */
  claim(index: number): boolean {
    if (this.claimedTouches.has(index)) return false;
    this.claimedTouches.add(index);
    return true;
  }

  /** @internal */
  isClaimed(index: number): boolean { return this.claimedTouches.has(index); }
  /** @internal */
  get input(): InputSystem { return this.host.input; }
  /** @internal */
  get renderer(): Renderer { return this.host.renderer; }
  /** @internal */
  get screenWidth(): number { return this.host.input.getScreenWidth(); }

  /** @internal */
  releaseJoystick(value: VirtualJoystick): void {
    const index = this.joysticks.indexOf(value);
    if (index >= 0) this.joysticks.splice(index, 1);
  }

  /** @internal */
  releaseButton(value: VirtualButton): void {
    const index = this.buttons.indexOf(value);
    if (index >= 0) this.buttons.splice(index, 1);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const joystick of this.joysticks.slice()) joystick.dispose();
    for (const button of this.buttons.slice()) button.dispose();
    this.joysticks.length = 0;
    this.buttons.length = 0;
    this.claimedTouches.clear();
    this.context.unregister(this);
  }
}

/** On-screen analog control bound to a game's input and renderer. */
export class VirtualJoystick {
  readonly zone: 'left' | 'right';
  readonly radius: number;
  readonly deadzone: number;
  readonly axisX: number;
  readonly axisY: number;
  active = false;
  touchIndex = -1;
  originX = 0;
  originY = 0;
  handleX = 0;
  handleY = 0;
  valueX = 0;
  valueY = 0;
  private disposed = false;

  constructor(private readonly controls: TouchControls, options: VirtualJoystickOptions = {}) {
    this.zone = options.zone ?? 'left';
    this.radius = options.radius ?? 60;
    this.deadzone = options.deadzone ?? 0.15;
    this.axisX = options.axisX ?? 0;
    this.axisY = options.axisY ?? 1;
  }

  update(): void {
    const input = this.controls.input;
    if (!this.controls.isReady || this.disposed) return;
    const touchCount = input.getTouchCount();
    if (this.active && (this.touchIndex >= touchCount || !input.isTouchActive(this.touchIndex))) {
      this.active = false;
      this.touchIndex = -1;
      this.valueX = 0;
      this.valueY = 0;
      input.injectGamepadAxis(this.axisX, 0);
      input.injectGamepadAxis(this.axisY, 0);
      return;
    }
    if (!this.active) {
      for (let index = 0; index < touchCount; index++) {
        if (this.controls.isClaimed(index)) continue;
        const position = input.getTouchPosition(index);
        if (!input.isTouchActive(index)) continue;
        const inZone = this.zone === 'left' ? position.x < this.controls.screenWidth / 2 : position.x >= this.controls.screenWidth / 2;
        if (!inZone || !this.controls.claim(index)) continue;
        this.active = true;
        this.touchIndex = index;
        this.originX = position.x;
        this.originY = position.y;
        break;
      }
    }
    if (!this.active || !this.controls.claim(this.touchIndex)) return;
    const position = input.getTouchPosition(this.touchIndex);
    const dx = position.x - this.originX;
    const dy = position.y - this.originY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < this.deadzone * this.radius) {
      this.handleX = position.x;
      this.handleY = position.y;
      this.valueX = 0;
      this.valueY = 0;
    } else {
      const normalizedDistance = Math.min(distance, this.radius) / distance;
      this.handleX = this.originX + dx * normalizedDistance;
      this.handleY = this.originY + dy * normalizedDistance;
      this.valueX = dx * normalizedDistance / this.radius;
      this.valueY = dy * normalizedDistance / this.radius;
    }
    input.injectGamepadAxis(this.axisX, this.valueX);
    input.injectGamepadAxis(this.axisY, this.valueY);
  }

  draw(): void {
    if (!this.active || this.disposed) return;
    this.controls.renderer.drawCircleOutline({ x: this.originX, y: this.originY }, this.radius, { r: 255, g: 255, b: 255, a: 60 });
    this.controls.renderer.drawCircle({ x: this.handleX, y: this.handleY }, this.radius * 0.4, { r: 255, g: 255, b: 255, a: 140 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) {
      this.controls.input.injectGamepadAxis(this.axisX, 0);
      this.controls.input.injectGamepadAxis(this.axisY, 0);
    }
    this.active = false;
    this.touchIndex = -1;
    this.controls.releaseJoystick(this);
  }
}

/** On-screen button that injects a key and/or gamepad button edge. */
export class VirtualButton {
  readonly radius: number;
  readonly label: string;
  readonly key: number | null;
  readonly gamepadButton: number | null;
  active = false;
  touchIndex = -1;
  private disposed = false;

  constructor(private readonly controls: TouchControls, readonly x: number, readonly y: number,
    options: VirtualButtonOptions = {}) {
    this.radius = options.radius ?? 30;
    this.label = options.label ?? '';
    this.key = options.key ?? null;
    this.gamepadButton = options.gamepadButton ?? null;
  }

  update(): void {
    if (!this.controls.isReady || this.disposed) return;
    const input = this.controls.input;
    let activeIndex = -1;
    for (let index = 0; index < input.getTouchCount(); index++) {
      if (this.controls.isClaimed(index) || !input.isTouchActive(index)) continue;
      const position = input.getTouchPosition(index);
      const dx = position.x - this.x;
      const dy = position.y - this.y;
      if (dx * dx + dy * dy <= this.radius * this.radius) { activeIndex = index; break; }
    }
    const wasActive = this.active;
    this.active = activeIndex >= 0;
    if (this.active) {
      this.controls.claim(activeIndex);
      this.touchIndex = activeIndex;
    } else {
      this.touchIndex = -1;
    }
    if (this.active === wasActive) return;
    if (this.key !== null) this.active ? input.injectKeyDown(this.key) : input.injectKeyUp(this.key);
    if (this.gamepadButton !== null) this.active ? input.injectGamepadButtonDown(this.gamepadButton) : input.injectGamepadButtonUp(this.gamepadButton);
  }

  draw(): void {
    if (this.disposed) return;
    const tint: Color = { r: 255, g: 255, b: 255, a: this.active ? 120 : 60 };
    this.controls.renderer.drawCircle({ x: this.x, y: this.y }, this.radius, tint);
    if (!this.label) return;
    const size = this.radius * 0.8;
    const width = this.controls.renderer.measureText(this.label, size);
    this.controls.renderer.drawText(this.label, { x: this.x - width / 2, y: this.y - size / 2 }, size, { r: 255, g: 255, b: 255, a: 200 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) {
      if (this.key !== null) this.controls.input.injectKeyUp(this.key);
      if (this.gamepadButton !== null) this.controls.input.injectGamepadButtonUp(this.gamepadButton);
    }
    this.active = false;
    this.touchIndex = -1;
    this.controls.releaseButton(this);
  }
}
