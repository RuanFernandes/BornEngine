---
title: Game loop
description: Use Game lifecycle hooks for simulation, rendering, and orderly shutdown across native and web.
section: Concepts
order: 10
---

`Game.run()` owns frame setup and teardown. Extend `Game` and override `loop(deltaTime)` for simulation and `render()` for drawing; the engine opens and closes each frame around those hooks. `onStart()` runs once before the first frame, and `onStop()` runs when the loop ends.

```ts
import { Colors, Game } from '@bornengine/engine';

class LoopSample extends Game {
  private elapsed = 0;

  constructor() {
    super({ window: { title: 'Loop sample', width: 960, height: 540 } });
  }

  protected override loop(deltaTime: number): void {
    this.elapsed += deltaTime;
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText('Time: ' + this.elapsed.toFixed(2) + 's', { x: 24, y: 24 }, 22, Colors.WHITE);
  }
}

new LoopSample().run();
```

## Frame order

BornEngine updates platform input, Colyseus callbacks, audio streams, and mobile controls before calling `loop(deltaTime)`. It then calls `render()`. Keep gameplay state changes in `loop`, and draw only in `render`. Use `deltaTime` as elapsed seconds rather than assuming a fixed refresh interval.

If you use gameplay scenes, call `this.scenes.update(deltaTime)` in `loop`. Physics is explicit: create a `PhysicsWorld` and call `physics.step(deltaTime)` once per loop.

## Stop and dispose

`this.stop()` requests orderly shutdown. The current frame completes before `onStop()` runs. In the subclass lifecycle, the Game disposes its services and resources after `onStop()`. When using callback-based `run({ update, render, onStop })`, call `game.dispose()` from the callback's `onStop` to release them. Stop and dispose are idempotent.

## Callback-based loop

Pass callbacks to `run()` if you prefer to keep the loop outside a `Game` subclass. The same frame order and owner rules apply:

```ts
const game = new Game({ window: { title: 'Callback loop', width: 960, height: 540 } });
game.run({
  update(deltaTime) { /* Advance state. */ },
  render() { game.renderer.clear(Colors.BLACK); },
  onStop: () => game.dispose(),
});
```

## Embedded hosts

For a native app that already owns the platform surface, create `new Game({ window: { mode: 'embedded' } })`, attach the host handle using `game.window.attachNativeSurface(handle, width, height)`, and drive each frame with `game.runFrame(deltaTime, callbacks)`. The host remains responsible for scheduling frames and closing the surface.
