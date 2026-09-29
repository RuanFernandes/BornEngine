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

`this.stop()` requests orderly shutdown. The current frame completes before `onStop()` runs. The Game disposes its services and resources after `onStop()`. `run()` returns a Promise that resolves after cleanup, including when a hook fails; lifecycle errors are recorded in `game.error`, and the Promise does not reject for those hook failures. Inspect `game.error` after awaiting it. Stop and dispose are idempotent.

## Another standalone loop

Keep frame behavior in subclass hooks even when the game state lives beside the class:

```ts
class ExampleGame extends Game {
  protected override loop(deltaTime: number): void { /* Advance state. */ }

  protected override render(): void { this.renderer.clear(Colors.BLACK); }
}

const game = new ExampleGame({ window: { title: 'Standalone loop', width: 960, height: 540 } });
game.run();
```

## Embedded hosts

For an embedded native host that already owns the platform surface and scheduler, create `new Game({ window: { mode: 'embedded' } })`, attach the host handle using `game.window.attachNativeSurface(handle, width, height)`, and drive each frame with `game.runFrame(deltaTime, callbacks)`. This is an embedding API; a standalone game should use subclass hooks and `game.run()`. The host remains responsible for scheduling frames and closing the surface.
