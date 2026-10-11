---
title: Game loop
description: How BornEngine calls your loop and render code each frame, how errors and shutdown work, and how embedded hosts drive frames.
section: Concepts
order: 10
---

A game runs as a loop. Each pass through the loop is one **frame**. BornEngine reads input, calls your `loop` method to update the game state, calls your `render` method to draw, and then presents the picture. The engine repeats this until the game stops.

You do not write the loop yourself. You write methods, and BornEngine calls them in order.

## Frame order

Each frame runs these steps in this order:

1. The renderer starts the frame.
2. Input is read, then frame services, audio, and touch controls update.
3. Your `loop(deltaTime)` runs. Update positions, timers, and game rules here.
4. Your `render()` runs. Clear the screen and draw here.
5. The retained GUI draws, if you use it.
6. The debug inspector draws, if it is enabled.

Input is read before `loop` runs, so `loop` sees the keys that were pressed in this frame.

```ts
import { Colors, Game } from '@bornengine/engine';

class LoopOrder extends Game {
  private frames = 0;

  constructor() {
    super({ window: { title: 'Loop order', width: 800, height: 450 } });
  }

  protected override loop(deltaTime: number): void {
    this.frames += 1;
    if (this.frames === 1) console.log(`first frame, deltaTime ${deltaTime}`);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
  }
}

new LoopOrder().run();
```

## Delta time

`deltaTime` is the number of seconds since the previous frame. Multiply every speed by it so the motion stays the same whether the game runs at 30 or 120 frames per second. For example, `this.x += 200 * deltaTime` moves a value 200 units per second.

Do not treat `deltaTime` as a number of frames, and do not assume it is constant. Read it on every frame.

## Clearing and drawing

The renderer does not clear the screen for you. Call `this.renderer.clear(color)` at the start of `render()`. If you override `render()` and do not call `super.render()`, the scene is not drawn. Call `super.render()` when you want the scene's components to draw, as in the [first player tutorial](../../getting-started/first-player/).

## Frame rate

Set `targetFps` in the `Game` options to choose the frame rate the loop aims for. For example, `{ window: { width: 800, height: 450 }, targetFps: 60 }`. The value must be a positive, finite number. Otherwise the game does not start and `game.error` describes the problem. Leave it out to keep the engine's default.

## Errors

An exception thrown from `onStart`, `loop`, or `render` stops the game. The engine records the message, closes the window, and resolves the `Promise` returned by `run()`. Check `game.error` after the run:

```ts
import { Game } from '@bornengine/engine';

const game = new Game({ window: { width: 800, height: 450 } });

game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Handle recoverable problems in your own code, such as a missing optional file, and report only the unrecoverable ones by throwing.

## Stop and dispose

`this.stop()` asks the game to end. The current frame finishes first, then the engine runs these steps in order:

1. `onStop()` runs. Save state and release your own resources here.
2. The game disposes the resources it owns, such as textures, scenes, and audio.
3. The `Promise` returned by `run()` resolves.

Closing the window has the same effect as calling `stop()`. You can call `stop()` from `loop` or from input handling.

Only one `Game` can be active at a time in a process. A second instance reports an error instead of starting.

## Embedded hosts

Some hosts already own a frame loop, such as an editor view that calls back into your code. These hosts create the game with `window: { mode: 'embedded' }` and call `runFrame` once per frame from their own scheduler:

```ts
import { Colors, Game } from '@bornengine/engine';

const game = new Game({ window: { mode: 'embedded', width: 800, height: 450 } });

export function frame(deltaTime: number): boolean {
  return game.runFrame(deltaTime, {
    update: () => undefined,
    render: () => game.renderer.clear(Colors.BLACK),
    onStop: () => undefined,
  });
}
```

`runFrame` returns `false` when the game has finished. With an embedded window, `run()` does not start a loop, so do not call both. Standalone games should use `run()`.

## Next steps

- [Scenes, objects, and components](../scenes-and-objects/) explains the hooks that `loop` and `render` drive.
- [Core API](../../api/core/) lists the frame, input, and runtime members.
- [Troubleshooting](../../troubleshooting/) lists common startup and runtime failures.
