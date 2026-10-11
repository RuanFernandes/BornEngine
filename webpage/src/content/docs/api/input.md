---
title: Input
description: Read keyboard, mouse, gamepad, and touch state, and build named actions and axes with InputActionMap.
section: API
order: 33
---

`InputSystem` is available as `game.input`. It reads devices directly: keyboard, mouse, gamepad, and touch. For gameplay, create an **action map** from it. An action map gives names such as `jump` or `move-x` to physical controls, so your game code asks "did the player jump?" instead of "was Space pressed?". Players can then rebind controls without changes to your gameplay code.

Import `InputSystem` and `InputActionMap` from `@bornengine/engine`, or from `@bornengine/engine/input`. Key and mouse button numbers come from the `Key` and `MouseButton` constants.

## Actions and bindings

An **action** is a named button that is either down or up, such as `fire`. An **axis** is a named number from -1 to 1, such as `move-x`. A **binding** connects a physical control to an action or an axis. There are four kinds of button binding:

| Binding | Fields | Active when |
| --- | --- | --- |
| Key | `{ kind: 'key', key }` | The key is held. Use `Key.*` constants. |
| Mouse | `{ kind: 'mouse', button }` | The mouse button is held. Use `MouseButton.*` constants. |
| Gamepad | `{ kind: 'gamepad', button }` | The gamepad button is held. |
| Touch region | `{ kind: 'touch-region', rect }` | Any finger is inside the rectangle. |

```ts
import { Key, MouseButton } from '@bornengine/engine';
import type { Game, InputActionMap } from '@bornengine/engine';

export function createControls(game: Game): InputActionMap {
  const controls = game.input.createActionMap();

  const fireBound = controls.bindAction('fire', [
    { kind: 'key', key: Key.SPACE },
    { kind: 'mouse', button: MouseButton.LEFT },
    { kind: 'gamepad', button: 0 },
    { kind: 'touch-region', rect: { x: 480, y: 200, width: 160, height: 160 } },
  ]);
  if (!fireBound) console.error('The fire action has an invalid binding.');

  controls.bindAxis('move-x', {
    negative: [{ kind: 'key', key: Key.A }, { kind: 'key', key: Key.LEFT }],
    positive: [{ kind: 'key', key: Key.D }, { kind: 'key', key: Key.RIGHT }],
    gamepadAxis: { axis: 0, deadzone: 0.15 },
  });

  return controls;
}
```

Rules for bindings:

- Several bindings on one action combine with OR. The action is down when any of its bindings is active.
- Calling `bindAction` again with the same name adds bindings to the existing action. Duplicate bindings are ignored. `unbindAction(name)` removes an action.
- Calling `bindAxis` again with the same name replaces that axis. `unbindAxis(name)` removes it, and `clear()` removes every action and axis.
- Binding methods return a `boolean`. They return `false` and change nothing when the name is blank, a key or button number is not a non-negative whole number, a rectangle is not finite or has a negative size, or a `deadzone` is outside 0 up to (not including) 1.
- Create each map once, for example in your `Game` constructor. The game updates every map it has created on every frame until it shuts down, and there is no call that removes a single map.

## Snapshots and edges

A map reads the devices once per frame and keeps that result as a **snapshot**. `isDown`, `wasPressed`, `wasReleased`, `readAxis`, and `readVector2` all read the snapshot, so they give the same answer anywhere in the same frame. Game advances each map once per frame, before it calls `loop(deltaTime)`.

An **edge** is a change between frames:

- `isDown(name)` is `true` on every frame while the action is held.
- `wasPressed(name)` is `true` only on the frame the action goes from up to down.
- `wasReleased(name)` is `true` only on the frame the action goes from down to up.
- A name that has no binding returns `false`, and `readAxis` returns `0`.

```ts
import { Colors, Game, Key } from '@bornengine/engine';
import type { InputActionMap } from '@bornengine/engine';

class Platformer extends Game {
  private readonly controls: InputActionMap;
  private x = 80;
  private jumps = 0;
  private charging = false;

  constructor() {
    super({ window: { title: 'Edges', width: 640, height: 360 } });
    this.controls = this.input.createActionMap();
    this.controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
    this.controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }],
      positive: [{ kind: 'key', key: Key.RIGHT }],
    });
  }

  protected override loop(deltaTime: number): void {
    this.x += this.controls.readAxis('move-x') * 200 * deltaTime;
    if (this.controls.wasPressed('jump')) this.jumps += 1;
    this.charging = this.controls.isDown('jump');
    if (this.controls.wasReleased('jump')) console.log(`Jump button released after ${this.jumps} jumps.`);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    const color = this.charging ? Colors.GOLD : Colors.WHITE;
    this.renderer.drawRectangle({ x: this.x, y: 280, width: 32, height: 32 }, color);
  }
}

new Platformer().run();
```

A binding that changes while a control is held does not produce a false press. When you add a binding with `bindAction`, or replace everything with `loadData`, the action stays quiet until it returns to up: `isDown` reports the held state, but `wasPressed` and `wasReleased` stay `false`.

## Axes and rebinding

An axis combines digital buttons with an optional analog gamepad axis:

- The digital part is +1 when a `positive` binding is active, -1 when a `negative` binding is active, and 0 when both or neither are.
- A `gamepadAxis` binding adds an analog value. Readings with a magnitude at or below `deadzone` (default `0.15`) count as 0. Larger readings are rescaled so the value still reaches 1 at full tilt, then multiplied by `scale` (default `1`).
- The sum is clamped to the range -1 to 1.

`readVector2(horizontal, vertical)` returns two named axes as a `Vector2D`. It does not normalize the result, so moving diagonally with the keyboard gives a vector with a length of about 1.41. Call `clampedMagnitude(1)` on it when you want equal speed in every direction.

`toData()` exports every action and axis as a plain object. `loadData(data)` replaces all bindings with such an object. It validates the whole object first and returns `false`, leaving the old bindings in place, when anything is invalid. The object is versioned (`version: 1`), so you can store it as JSON.

```ts
import { Key } from '@bornengine/engine';
import type { Game, InputActionMap, InputActionMapData, Vector2D } from '@bornengine/engine';

const BINDINGS_FILE = 'controls.json';

export function readMovement(controls: InputActionMap): Vector2D {
  return controls.readVector2('move-x', 'move-y').clampedMagnitude(1);
}

export function rebindJump(controls: InputActionMap, key: number): boolean {
  controls.unbindAction('jump');
  return controls.bindAction('jump', { kind: 'key', key });
}

export function saveBindings(game: Game, controls: InputActionMap): boolean {
  return game.input.writeFile(BINDINGS_FILE, JSON.stringify(controls.toData()));
}

export function loadBindings(game: Game, controls: InputActionMap): boolean {
  if (!game.input.fileExists(BINDINGS_FILE)) return false;
  try {
    const data = JSON.parse(game.input.readFile(BINDINGS_FILE)) as InputActionMapData;
    return controls.loadData(data);
  } catch (_error) {
    return false;
  }
}

export function useDefaults(controls: InputActionMap): void {
  controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
  controls.bindAxis('move-x', {
    negative: [{ kind: 'key', key: Key.A }],
    positive: [{ kind: 'key', key: Key.D }],
  });
  controls.bindAxis('move-y', {
    negative: [{ kind: 'key', key: Key.W }],
    positive: [{ kind: 'key', key: Key.S }],
  });
}
```

The file helpers on `game.input` read and write text. [Core](../core/) describes where they store it on each platform. To keep settings next to other persistent data, use the typed database described in [Database and migrations](../storage/).

## Frame loop

`Game.run()` updates input first in every frame, before the engine services, audio, on-screen touch controls, and your `loop(deltaTime)` hook. A host that drives the game with `runFrame` gets the same order. Keyboard, mouse, gamepad, touch, and every action-map snapshot therefore share one frame boundary.

- If you build your own loop without `run()` or `runFrame`, call `game.input.update()` once per frame before you read a map. Do not update the same map twice in one frame.
- `InputSystem` clears its maps when the game shuts down. If you need the bindings afterwards, call `toData()` in your `onStop()` hook, which runs before that cleanup.
- Direct edge reads such as `isKeyPressed` are also computed once per frame, so they return the same value every time you call them in that frame. `getMouseWheel()` and `getCharPressed()` are the exceptions: each call consumes what it returns.

For mouse-look controls, capture the cursor with `setCursorCaptured(true)` and release it with `setCursorCaptured(false)`. While the cursor is captured, `getMouseDeltaX()` and `getMouseDeltaY()` report raw movement. The call returns `false` when input is not available. In a browser, the cursor is captured only after the player clicks the game, because browsers require a user gesture.

```ts
import { Game, Key } from '@bornengine/engine';

class FreeLook extends Game {
  private yaw = 0;
  private pitch = 0;

  protected override onStart(): void {
    this.input.setCursorCaptured(true);
  }

  protected override loop(_deltaTime: number): void {
    if (this.input.isKeyPressed(Key.ESCAPE)) this.input.setCursorCaptured(false);
    this.yaw += this.input.getMouseDeltaX() * 0.1;
    this.pitch += this.input.getMouseDeltaY() * 0.1;
  }
}

new FreeLook().run();
```

## Device behavior

Use the device methods on `game.input` when you need raw state instead of named actions.

| Device | Methods |
| --- | --- |
| Keyboard | `isKeyDown(key)`, `isKeyPressed(key)`, `isKeyReleased(key)`, `isKeyRepeated(key)`, `getCharPressed()` |
| Mouse | `isMouseButtonDown(button)`, `isMouseButtonPressed(button)`, `isMouseButtonReleased(button)`, `getMousePosition()`, `getMouseX()`, `getMouseY()`, `getMouseDeltaX()`, `getMouseDeltaY()`, `getMouseWheel()` |
| Gamepad | `isGamepadAvailable(id?)`, `getGamepadAxis(axis)`, `getGamepadAxisValue(id, axis)`, `getGamepadAxisCount()`, `isGamepadButtonDown(button)`, `isGamepadButtonPressed(button)`, `isGamepadButtonReleased(button)`, `rumbleGamepad(low, high, seconds)` |
| Touch | `getMaxTouchPoints()`, `isTouchActive(index)`, `getTouchPosition(index)`, `getTouchX(index)`, `getTouchY(index)`, `getTouchCount()` |
| Platform | `getPlatform()`, `isMobile()`, `isTV()`, `isWatch()`, `isAnyInputPressed()`, `getCrownRotation()`, `getScreenWidth()`, `getScreenHeight()` |

Notes for each device:

- **Keyboard.** `isKeyDown` is `true` while the key is held. `isKeyPressed` and `isKeyReleased` are `true` for the single frame in which the key changed. `isKeyRepeated` is `true` on frames where the operating system sent a key-repeat event. `getCharPressed()` returns the next typed character as a Unicode code point, or `0` when nothing is waiting, so call it in a loop to read everything typed this frame.
- **Mouse.** `getMousePosition()` returns window coordinates. When a scene uses a camera or viewport, convert them with `game.input.screenToWorld()`, described in [2D camera and viewport](../camera2d/). `getMouseWheel()` returns the scroll accumulated since the previous call and then resets it, so read it once per frame.
- **Gamepad.** The engine tracks one gamepad, the primary gamepad that the platform reports. `isGamepadAvailable(id?)` and `getGamepadAxisValue(id, axis)` accept an `id` for compatibility, but the id is ignored. Check `isGamepadAvailable()` before you read it, and expect axis numbers 0 to 7 and button numbers 0 to 15. `rumbleGamepad(low, high, seconds)` vibrates the pad where the platform supports it and is ignored elsewhere.
- **Touch.** `getTouchCount()` is the number of fingers on the screen, but fingers are addressed by slot, and slots become sparse when a finger lifts out of order. Loop from `0` to `getMaxTouchPoints()` and skip every slot where `isTouchActive(index)` is `false`. Looping up to `getTouchCount()` can read a slot that was already released.

```ts
import { Colors, Game, MouseButton } from '@bornengine/engine';

class DevicePreview extends Game {
  private readonly points: { x: number; y: number }[] = [];
  private stickX = 0;
  private stickY = 0;

  constructor() {
    super({ window: { title: 'Devices', width: 640, height: 360 } });
  }

  protected override loop(_deltaTime: number): void {
    const input = this.input;
    this.points.length = 0;

    for (let slot = 0; slot < input.getMaxTouchPoints(); slot++) {
      if (!input.isTouchActive(slot)) continue;
      this.points.push(input.getTouchPosition(slot));
    }

    if (input.isMouseButtonDown(MouseButton.LEFT)) this.points.push(input.getMousePosition());

    if (input.isGamepadAvailable()) {
      this.stickX = input.getGamepadAxis(0);
      this.stickY = input.getGamepadAxis(1);
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    for (const point of this.points) this.renderer.drawCircle(point, 24, Colors.GOLD);
    this.renderer.drawCircle({ x: 320 + this.stickX * 80, y: 180 + this.stickY * 80 }, 16, Colors.WHITE);
  }
}

new DevicePreview().run();
```

- **Platform.** `getPlatform()` returns one of the `Platform` constants, such as `Platform.WEB` or `Platform.LINUX`. `isMobile()`, `isTV()`, and `isWatch()` report the device class. `isAnyInputPressed()` is `true` on a frame in which a key, mouse button, or gamepad button was pressed, and while a finger is touching the screen. `getCrownRotation()` returns the Digital Crown rotation on watchOS since the previous call, so read it once per frame. `getScreenWidth()` and `getScreenHeight()` return the current window size.

Platform differences:

- Gamepad numbering follows each platform's controller mapping. On Windows and macOS, axes 0 and 1 are the left stick, axes 2 and 3 are the right stick, axes 4 and 5 are the triggers, and buttons 0 to 3 are A, B, X, and Y. Other buttons, such as the D-pad, are numbered differently on each platform, so let players rebind them.
- The Web build does not read gamepads, so `isGamepadAvailable()` stays `false` there.
- Virtual joysticks and buttons from `game.mobile` write into the same gamepad state. Bindings of kind `gamepad`, and `gamepadAxis` bindings, also respond to them. See [Mobile](../mobile/).
- Touch input comes from Android, iOS, tvOS, visionOS, and the Web build. The Linux, Windows, and macOS builds do not produce touch input, so every touch slot stays inactive there. `getMaxTouchPoints()` is the number of slots the engine tracks (10), not a property of your hardware.

## Next steps

- [Core](../core/) explains the frame lifecycle that updates input before `loop`.
- [Mobile](../mobile/) adds on-screen joysticks and buttons for touch devices.
- [2D camera and viewport](../camera2d/) converts pointer positions into world positions.
- [2D game](../../guides/2d-game/) builds a level that reads input every frame.
