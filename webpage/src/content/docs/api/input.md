---
title: Input
description: Read device state and build context-owned actions and axes.
section: API / Input
order: 33
---

`InputSystem` is available from `game.input`. For gameplay bindings, create an action map from that system. The Game loop polls it once per frame before calling update.

## Actions and bindings

```ts
import { Game, Key, MouseButton } from '@bornengine/engine';
const game = new Game();
const controls = game.input.createActionMap();
controls.bindAction('fire', [
  { kind: 'key', key: Key.SPACE },
  { kind: 'mouse', button: MouseButton.LEFT },
]);
controls.bindAxis('move', {
  negative: [{ kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.D }],
  gamepadAxis: { axis: 0, deadzone: 0.15 },
});
```

Bindings combine with OR. Invalid names, indices, rectangles, scales, or deadzones return `false` and leave the previous mapping unchanged.

## Snapshots and edges

`isDown`, `wasPressed`, `wasReleased`, and axis reads use the map's latest snapshot. Game advances each map once per frame before update, so edge values remain stable throughout that callback.

```ts
if (controls.wasPressed('fire')) fireWeapon();
if (controls.isDown('fire')) chargeWeapon();
const horizontal = controls.readAxis('move');
```

If you drive a custom loop outside `Game.run`, call `game.input.update()` once before reading the map. Do not update the same map twice in one frame.

## Axes and rebinding

Axes combine digital negative/positive bindings with an optional analog gamepad axis. Values are clamped to `[-1, 1]`, deadzoned, then scaled. `readVector2(horizontal, vertical)` combines two named axes.

```ts
controls.bindAxis('move-x', {
  negative: [{ kind: 'key', key: Key.LEFT }],
  positive: [{ kind: 'key', key: Key.RIGHT }],
});
controls.bindAction('confirm', { kind: 'key', key: Key.ENTER });
```

## Frame loop

`Game.run()` polls input before `update(deltaTime)`. Prefer that lifecycle so keyboard, mouse, gamepad, touch, and action-map snapshots share a single frame boundary.

Capture the pointer for mouse-look controls and release it when opening menus:

```ts
game.input.setCursorCaptured(true);
game.input.setCursorCaptured(false);
```

The method returns `false` if the input system is unavailable and `true` when the request is accepted.

## Device behavior

Use direct methods such as `game.input.isKeyDown(key)`, `game.input.getMousePosition()`, `game.input.getTouchPosition(index)`, and `game.input.isGamepadAvailable(id)` for low-level device access. The primary gamepad is selected by the input adapter. Touch regions use the same screen coordinate space as the window; `game.input.isTouchActive(index)` distinguishes a live touch from an empty slot.
