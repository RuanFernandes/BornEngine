---
title: Input
description: Map keyboard, mouse, gamepad, and touch controls to named actions and axes.
section: API / Input
order: 33
---

`InputActionMap` combines the low-level Core input functions into named actions and axes. Import it from `@bornengine/engine/input` or from the package root. It does not own the game loop or install global callbacks; your game decides when to capture input.

## Actions and bindings

Bind an action to one or more devices. The bindings are combined with OR, so `jump` stays down while any configured key, button, or touch region is active.

```ts
import { Key, MouseButton } from '@bornengine/engine/core';
import { InputActionMap } from '@bornengine/engine/input';

const controls = new InputActionMap();

controls.bindAction('jump', [
  { kind: 'key', key: Key.SPACE },
  { kind: 'mouse', button: MouseButton.LEFT },
  { kind: 'gamepad', button: 0 },
  { kind: 'touch-region', rect: { x: 1100, y: 560, width: 140, height: 140 } },
]);

controls.bindAxis('move', {
  negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
  gamepadAxis: { axis: 0, deadzone: 0.15 },
});
```

`bindAction()` appends bindings that are not already present. Repeating the same binding does not create another entry. `bindAxis()` registers or replaces a named axis. Action names and axis names use separate namespaces. Invalid names, device indices, rectangles, scales, or deadzones return `false` and leave the previous registration in place.

## Snapshots and edges

Call `update()` once per frame, before reading input. It polls the registered inputs and builds one snapshot; `isDown()`, `wasPressed()`, `wasReleased()`, and axis reads all use that snapshot without polling again.

`isDown(name)` reports the current held state. `wasPressed(name)` and `wasReleased(name)` report transitions between the previous and current snapshots. Those edge values stay stable until the next call to `update()`. If several bindings for one action overlap, the action produces one press edge when the first binding goes down and one release edge when the last binding goes up.

When you add a binding to an existing action while its new key or button is already held, the next `update()` adopts the new state as a baseline. `isDown()` reflects the held input without a synthetic `wasPressed()` event.

## Axes and rebinding

An axis can combine negative and positive digital bindings with one analog gamepad axis. Opposite digital directions cancel. Values are clamped to `[-1, 1]`; analog input uses a `0.15` deadzone by default, then rescales the remaining range before applying `scale` (which defaults to `1`).

```ts
import { Key } from '@bornengine/engine/core';
import { InputActionMap } from '@bornengine/engine/input';

const controls = new InputActionMap();
controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
controls.bindAxis('move-x', {
  negative: [{ kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.D }],
});

function useArrowKeys() {
  // Replaces the axis mapping; the new value is available after update().
  controls.bindAxis('move-x', {
    negative: [{ kind: 'key', key: Key.LEFT }],
    positive: [{ kind: 'key', key: Key.RIGHT }],
  });
}

function addAlternateJumpKey(key: number) {
  // Adds a binding to the existing action and adopts its current state safely.
  controls.bindAction('jump', { kind: 'key', key });
}

function removeJumpAction() {
  controls.unbindAction('jump');
}
```

`readVector2(horizontal, vertical)` returns the two named axes as `{ x, y }` without normalizing diagonal input. `unbindAction()` and `unbindAxis()` remove a whole named entry; `clear()` removes every action and axis. Unknown action queries return `false`, and unknown axis reads return `0`.

## Frame loop

Capture the input map once at the start of the update phase, then pass the same values through gameplay systems. Do not call `update()` separately from each object or component: that would advance the edge snapshot more than once in a frame.

```ts
import { initWindow, Key, runGame } from '@bornengine/engine/core';
import { InputActionMap } from '@bornengine/engine/input';

initWindow(1280, 720, 'Input map');
const controls = new InputActionMap();
controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
controls.bindAxis('move', {
  negative: [{ kind: 'key', key: Key.LEFT }],
  positive: [{ kind: 'key', key: Key.RIGHT }],
});

let playerX = 100;
runGame((dt) => {
  controls.update();
  if (controls.wasPressed('jump')) console.log('jump');
  playerX += controls.readAxis('move') * 240 * dt;
});
```

## Device behavior

Gamepad bindings use BornEngine's current primary gamepad. The low-level API does not route action reads by a gamepad ID. A touch-region binding is active while any live touch is inside its rectangle, using the same screen-space coordinates returned by Core.

Touch slots can be sparse after one finger lifts while another remains. `InputActionMap` checks active slots up to `getMaxTouchPoints()`. When reading Core directly, also scan the maximum slots and skip inactive ones:

```ts
import {
  getMaxTouchPoints, getTouchPosition, isTouchActive,
} from '@bornengine/engine/core';

for (let slot = 0; slot < getMaxTouchPoints(); slot++) {
  if (!isTouchActive(slot)) continue;
  const position = getTouchPosition(slot);
  console.log('active touch', slot, position.x, position.y);
}
```

The procedural Core functions remain available for one-off reads and custom input systems: `isKeyDown()`, `isMouseButtonDown()`, `isGamepadButtonDown()`, `getGamepadAxis()`, and the touch functions. Use the [Core API](../core/) for their frame and device details, and the [Mobile API](../mobile/) for virtual joysticks and buttons.
