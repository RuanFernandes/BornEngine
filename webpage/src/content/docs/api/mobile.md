---
title: Mobile input
description: Add virtual joysticks and buttons while keeping multitouch claims and gameplay input explicit.
section: API / Mobile
order: 42
---

The mobile module turns touch contacts into the same keyboard/gamepad signals that the rest of the engine reads. Virtual controls are plain state objects: update them during the input phase, read gameplay values, then draw their overlays during the UI phase.

## Joystick

`createVirtualJoystick()` supports a left or right screen zone, a radius, a deadzone, and the injected gamepad axes. The origin appears at the first touch in its zone, so the control works with both fixed and floating joystick layouts. `valueX` and `valueY` are normalized to roughly `-1..1`.

```ts
import { runGame } from '@bornengine/engine/core';
import {
  createVirtualJoystick,
  drawVirtualJoystick,
  getMovementInput,
  resetTouchClaims,
  updateVirtualJoystick,
} from '@bornengine/engine/mobile';

const moveStick = createVirtualJoystick({
  zone: 'left',
  radius: 72,
  deadzone: 0.16,
});

runGame((dt) => {
  resetTouchClaims();
  updateVirtualJoystick(moveStick);

  const movement = getMovementInput();
  updatePlayer(movement.x, movement.y, dt);

  drawVirtualJoystick(moveStick);
});

function updatePlayer(x: number, y: number, dt: number) {
  console.log('move', x, y, 'for', dt);
}
```

`updateVirtualJoystick()` injects the current values into the configured axes. `getMovementInput()` also merges WASD, arrow keys, and gamepad axes, then clamps the vector; that makes it a convenient cross-platform movement read even when the touch joystick is absent.

## Buttons

`createVirtualButton(x, y, opts)` creates a circular action control. Give it a label for the overlay and optionally map it to a core key or gamepad button. Call `updateVirtualButton()` before reading the resulting key/gameplay state and `drawVirtualButton()` after the scene pass.

```ts
import { Key } from '@bornengine/engine/core';
import {
  createVirtualButton,
  drawVirtualButton,
  updateVirtualButton,
} from '@bornengine/engine/mobile';

const jump = createVirtualButton(920, 560, {
  radius: 38,
  label: 'JUMP',
  key: Key.SPACE,
});

function updateTouchActions() {
  updateVirtualButton(jump);
  if (jump.active) startJump();
}

function drawTouchActions() {
  drawVirtualButton(jump);
}

function startJump() {
  console.log('jump pressed');
}
```

Buttons and joysticks claim a touch slot when they consume it. Put larger controls later in the update order only when they should lose to a smaller, more specific control. A button emits key/gamepad down and up injections for its configured mapping; its `active` flag is useful for analog-style actions that remain held.

## Touch claims

Call `resetTouchClaims()` once at the beginning of every frame, then update all controls in deterministic order. Do not reset claims between the joystick and button updates or two controls can consume the same finger. Resetting is a per-frame bookkeeping operation, not a device reset.

```ts
import {
  createVirtualButton,
  createVirtualJoystick,
  drawVirtualButton,
  drawVirtualJoystick,
  resetTouchClaims,
  updateVirtualButton,
  updateVirtualJoystick,
} from '@bornengine/engine/mobile';

const stick = createVirtualJoystick({ zone: 'left' });
const fire = createVirtualButton(980, 500, { radius: 34, label: 'FIRE' });

export function updateMobileInput() {
  resetTouchClaims();
  updateVirtualJoystick(stick);
  updateVirtualButton(fire);
}

export function drawMobileInput() {
  drawVirtualJoystick(stick);
  drawVirtualButton(fire);
}
```

Touch slots are sparse when fingers lift out of order. Treat `getTouchCount()` as a scan bound, not as proof that every index is a live contact; use `getTouchX()`, `getTouchY()`, and `isTouchActive()` from the core input API when implementing custom controls. The built-in controls skip empty `(0, 0)` slots, remember their claimed index, and release their state when that touch disappears.

Keep input updates before gameplay and draw calls after the world. For device layouts, derive button positions from `getScreenWidth()`/`getScreenHeight()` instead of hard-coding one resolution. The [mobile platform guide](../../platforms/mobile/) covers packaging and target-specific input setup.
