---
title: Mobile
description: Add on-screen joysticks and buttons that turn touch input into the game's gamepad and keyboard input.
section: API
order: 44
---

`game.mobile` creates **virtual controls**: an on-screen joystick and on-screen buttons. A control reads touches and writes into the game's input system, so the rest of your code reads normal input. A joystick writes gamepad axes. A button writes a key, a gamepad button, or both.

This is how it fits into a frame:

- `mobile.update()` runs every frame before your `loop`, after the engine reads input. Your `loop` sees the current state.
- Controls do not draw themselves. Call `this.mobile.draw()` at the end of `render()`, after the world, so the controls appear on top.
- When the game shuts down, `game.mobile` disposes all controls.

Touch input comes from touch screens on iOS, Android, and the web target. Desktop builds do not report touches, so the controls stay idle there. Read movement with `mobile.movementInput()`, which also reads the keyboard and gamepad, so one code path works on every platform. For packaging and permissions, see [Mobile platforms](../../platforms/mobile/).

## Joystick

`game.mobile.createJoystick(options)` returns a `VirtualJoystick`. All options are optional:

| Option | Default | Meaning |
| --- | --- | --- |
| `zone` | `'left'` | `'left'` or `'right'`. The joystick listens to that half of the screen. |
| `radius` | 60 | How far the handle can move from where the finger landed, in touch units. |
| `deadzone` | 0.15 | A fraction of `radius`. Movement inside it reads as zero. |
| `axisX` | 0 | The gamepad axis that receives the horizontal value. |
| `axisY` | 1 | The gamepad axis that receives the vertical value. |

The joystick floats. It waits for a free touch in its half of the screen. The first free touch becomes its origin, and the handle follows the finger within `radius`. The value on each axis is the handle's offset divided by `radius`, so it ranges from -1 to 1, and down is positive. The joystick writes the values to gamepad axes `axisX` and `axisY` every frame, and writes 0 when the finger lifts. Read them with `game.input.getGamepadAxis(0)` and `getGamepadAxis(1)`, or through `movementInput()`.

A joystick exposes `active`, `valueX`, and `valueY`. It draws a faint ring and a handle only while a finger is on it.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class TouchGame extends Game {
  private x = 400;
  private y = 225;

  constructor() {
    super({ window: { title: 'Touch controls', width: 800, height: 450 } });
  }

  protected override onStart(): void {
    this.mobile.createJoystick({ zone: 'left', radius: 64, deadzone: 0.16 });
    const right = this.input.getScreenWidth() - 90;
    const bottom = this.input.getScreenHeight() - 90;
    this.mobile.createButton(right, bottom, { radius: 40, label: 'Jump', key: Key.SPACE });
  }

  protected override loop(deltaTime: number): void {
    const movement = this.mobile.movementInput();
    this.x += movement.x * 200 * deltaTime;
    this.y += movement.y * 200 * deltaTime;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawCircle({ x: this.x, y: this.y }, 16, Colors.ORANGE);
    this.mobile.draw();
  }
}

new TouchGame().run();
```

`movementInput()` returns `{ x, y }` and works like this:

- It adds the WASD keys and the arrow keys. Right and down are positive.
- If gamepad axis 0 or axis 1 is beyond 0.1 in either direction, the gamepad values replace the keyboard values. A virtual joystick on the default axes counts as a gamepad here.
- If the vector is longer than 1, it is scaled down to length 1.

Call it from `loop`. It returns `{ x: 0, y: 0 }` when the controls are not ready.

## Buttons

`game.mobile.createButton(x, y, options)` returns a `VirtualButton`. `x` and `y` are the center of the button in the same units as touch positions (`game.input.getTouchPosition()`). The example above reads the screen size so the button sits near the corner on any device.

| Option | Default | Meaning |
| --- | --- | --- |
| `radius` | 30 | The size of the circle. |
| `label` | `''` | Text drawn in the button. |
| `key` | `null` | A `Key.*` value to press while the button is held. |
| `gamepadButton` | `null` | A gamepad button number to press while the button is held. |

A button is pressed while a free touch is inside its circle. It writes the key and the gamepad button when the press starts and releases them when it ends. It always draws as a translucent circle, brighter while pressed. If you remove or dispose a pressed button, it releases its key and gamepad button first, so nothing stays stuck.

Timing matters when you read the result:

- Read a `key` with `isKeyDown`, `isKeyPressed`, and `isKeyReleased`. The engine applies injected keys at the start of the next frame, so a key reads as pressed or released one frame after the touch changes.
- Read a `gamepadButton` with `isGamepadButtonDown`. It is visible in the same frame. `isGamepadButtonPressed` and `isGamepadButtonReleased` do not report presses written by virtual buttons in this version. Use `key` when you need press and release edges.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class ActionGame extends Game {
  private shots = 0;
  private sprinting = false;

  protected override onStart(): void {
    const width = this.input.getScreenWidth();
    const height = this.input.getScreenHeight();
    this.mobile.createJoystick({ zone: 'left', radius: 70, deadzone: 0.2 });
    this.mobile.createButton(width - 90, height - 90, { radius: 44, label: 'Fire', key: Key.SPACE });
    this.mobile.createButton(width - 200, height - 60, { radius: 32, label: 'Run', gamepadButton: 0 });
  }

  protected override loop(_deltaTime: number): void {
    if (this.input.isKeyPressed(Key.SPACE)) this.shots += 1;
    this.sprinting = this.input.isGamepadButtonDown(0);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    const status = this.sprinting ? 'running' : 'walking';
    this.renderer.drawText(`${status}, shots ${this.shots}`, { x: 16, y: 16 }, 24, Colors.WHITE);
    this.mobile.draw();
  }
}

new ActionGame({ window: { title: 'Actions', width: 800, height: 450 } }).run();
```

Call `dispose()` on a joystick or a button to remove it. A removed control stops reading touches and stops drawing. `game.mobile.dispose()` removes them all, and the game calls it at shutdown.

## Touch claims

A **claim** says that one control has taken one touch. Each touch belongs to at most one control per frame, so one finger can never drive a joystick and a button at the same time.

Every frame, `mobile.update()` clears all claims. Then it updates the joysticks in the order you created them, and then the buttons in the order you created them. A control skips touches that are already claimed.

Three consequences follow:

- A joystick takes the first free touch inside its half of the screen, and it runs before any button. A button placed inside the joystick's half is taken by the joystick unless a finger already holds that joystick. Put buttons in the other half, or choose a joystick zone that does not cover them.
- A second finger in the joystick's half, while the joystick is held, is free for a button.
- Two joysticks in the same zone compete, and the one created first wins. Use one `'left'` and one `'right'` for twin-stick controls.

Claims exist only inside the controls. Your own code that reads touches with `game.input.getTouchPosition(index)` still sees every touch, including claimed ones.

**Limit.** The controls look at touch slots 0 up to one less than `game.input.getTouchCount()`. Slots can have gaps when fingers lift out of order: lifting slot 0 while slot 1 is still down leaves a count of 1. A finger above that range is invisible to the controls, and a joystick held by it releases. Test two-finger play, such as a joystick plus a button, on a real device. In your own code, loop over `getMaxTouchPoints()` and skip slots where `isTouchActive()` is false, as shown in [Mobile platforms](../../platforms/mobile/).

## Next steps

- [Input](../input/) covers keyboard, gamepad, touch, and action maps.
- [Mobile platforms](../../platforms/mobile/) covers building and running on Android and iOS.
- [Game objects](../game/) shows where controls fit in the frame.
