---
title: Mobile
description: Add touch-friendly virtual joysticks and buttons to a Game.
section: API / Mobile
order: 44
---

`game.mobile` owns virtual touch controls and maps their input into the Game's InputSystem. Create controls once and draw them during the render callback after the game world.

## Joystick

```ts
import { Game } from '@bornengine/engine';
const game = new Game();
const stick = game.mobile.createJoystick({ zone: 'left', radius: 64, deadzone: 0.16 });

game.run({
  update() {
    const movement = game.mobile.movementInput();
    movePlayer(movement.x, movement.y);
  },
  render() {
    game.renderer.clear({ r: 12, g: 16, b: 24, a: 255 });
    game.mobile.draw();
  },
  onStop: () => game.dispose(),
});
```

The joystick injects its axis values into the Game-owned input layer. `movementInput()` combines keyboard and primary gamepad movement with touch controls.

## Buttons

```ts
import { Key } from '@bornengine/engine';
const fire = game.mobile.createButton(860, 450, { radius: 36, label: 'Fire', key: Key.SPACE });
```

A VirtualButton may inject a key and/or gamepad button. Keep its position in the same logical screen coordinates used by the window.

## Touch claims

Each active touch is claimed by at most one virtual control for a frame. This prevents an on-screen button and joystick from consuming the same finger. Dispose individual controls when removing them or let Game shutdown dispose the entire control service.
