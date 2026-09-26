---
title: Game loop
description: Use Game callbacks for simulation, rendering, and orderly shutdown across native and web.
section: Concepts
order: 10
---

`Game.run()` owns frame setup and teardown. Your `update(deltaTime)` callback advances simulation, then `render()` submits the frame. The engine opens and closes drawing around both callbacks, so application code does not manage native frame functions.

```ts
import { Colors, Game } from '@bornengine/engine';

const game = new Game({ window: { title: 'Loop sample', width: 960, height: 540 } });
let elapsed = 0;

game.run({
  update(deltaTime) {
    elapsed += deltaTime;
  },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawText('Time: ' + elapsed.toFixed(2) + 's', { x: 24, y: 24 }, 22, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

## Frame order

BornEngine updates platform input, Colyseus callbacks, audio streams, and mobile controls before calling your update callback. It then calls render. Keep gameplay state changes in update, and draw only in render. Use `deltaTime` as elapsed seconds rather than assuming a fixed refresh interval.

If you use gameplay scenes, call `game.scenes.update(deltaTime)` in update. Physics is explicit: create a `PhysicsWorld` and call `physics.step(deltaTime)` once per update.

## Stop and dispose

`game.stop()` requests orderly shutdown. The current frame completes before `onStop` runs. Call `game.dispose()` from `onStop` to release services and resources. Both stop and dispose are idempotent.

## Embedded hosts

For a native app that already owns the platform surface, create `new Game({ window: { mode: 'embedded' } })`, attach the host handle using `game.window.attachNativeSurface(handle, width, height)`, and drive each frame with `game.runFrame(deltaTime, callbacks)`. The host remains responsible for scheduling frames and closing the surface.
