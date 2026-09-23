---
title: Mobile input
description: Add virtual joysticks and buttons on touch targets while keeping input state explicit.
section: API / Mobile
order: 42
---

Import from `@bornengine/engine/mobile`:

```ts
import { createVirtualJoystick, updateVirtualJoystick, drawVirtualJoystick, getMovementInput } from '@bornengine/engine/mobile';

const stick = createVirtualJoystick({ zone: 'left', radius: 60, deadzone: 0.15 });

runGame(() => {
  updateVirtualJoystick(stick);
  drawVirtualJoystick(stick);
  const movement = getMovementInput();
});
```

The module exposes `VirtualJoystick`, `VirtualButton`, `createVirtualJoystick`, `createVirtualButton`, update/draw functions, `getMovementInput`, and `resetTouchClaims`. Claims keep multiple controls from consuming the same finger.

The iOS input bridge supports multitouch, but touch slots can become sparse when fingers lift out of order. Iterate active slots with the core touch helpers rather than assuming `getTouchCount()` is a dense index range. Android and Apple packaging requirements live in the [mobile platform guide](../platforms/mobile/).
