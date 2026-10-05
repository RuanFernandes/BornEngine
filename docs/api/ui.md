# UI

BornEngine provides a Game-owned player UI surface and a separate developer overlay. Access them from `game.ui` and `game.debugUi`.

UI commands are described during the `render()` hook. The backend evaluates them at the end of the frame and exposes the completed responses on the next frame. Keep numeric widget IDs stable so the backend can retain state.

For persistent control objects, nested parents, subclass event hooks, profiles, and method-based geometry, use the [retained GUI API](gui.md). Both APIs share the same egui context and display while keeping separate IDs and response data.

```ts
import { Game } from '@bornengine/engine';
class ExampleGame extends Game {
  protected override render(): void {
    this.ui.beginWindow(100, 'Audio', 24, 24, 340, 220);
    volume = this.ui.sliderFloat(101, 'Volume', volume, 0, 1);
    this.ui.endWindow(100);
    if (this.debugUi.isAvailable()) this.debugUi.metricsWindow(900);
  }
}

const game = new ExampleGame({ window: { title: 'Settings' } });
let volume = 0.8;

game.run();
```

The player-facing surface includes layouts, menus, tabs, tables, text fields, buttons, sliders, texture images, and custom drawing. Read `game.ui.response(id)` for hover, focus, click, or changed-value details. Use `wantsPointerInput()` and `wantsKeyboardInput()` to decide when gameplay should yield input.

`game.debugUi` exposes developer panels and metrics when the native target has the optional debug UI feature enabled. Check `isAvailable()` before building the overlay.

Textures passed to UI must belong to the same Game. UI, assets, and input services are disposed with their owner.
