
# Build a retained GUI

Use `game.gui` for a reusable interface tree. Keep game rules in `Game.loop()`
and create or update control objects there; BornEngine submits the retained
tree after `Game.render()`.

## Create a scrollable panel

This example builds a small inventory panel with a nested scroll area and
buttons. The constructor creates the controls once, and the Game owns them for
the rest of its lifetime.

```ts
import { Colors, Game, GUIEvent, GuiButton, GuiPanel, GuiScroll } from '@bornengine/engine';
import { GUIProfiles } from '@bornengine/engine/gui';

class InventoryButton extends GuiButton {
  constructor(label: string, y: number) {
    super({ x: 8, y, width: 220, height: 34 });
    this.setText(label);
    const profile = this.setOwnProfile(GUIProfiles.get('button'));
    profile.normalColor = { r: 0.12, g: 0.2, b: 0.32, a: 1 };
  }
}

class InventoryScroll extends GuiScroll {
  lastSelection = '';

  protected override onAction(event: GUIEvent): void {
    if (event.target instanceof GuiButton) {
      this.lastSelection = event.target.getText();
    }
  }
}

class InventoryGame extends Game {
  private readonly panel = new GuiPanel({ x: 24, y: 24, width: 300, height: 260 });
  private readonly inventory = new InventoryScroll({ x: 10, y: 38, width: 270, height: 200 });
  private readonly status = new GuiButton({ x: 10, y: 8, width: 270, height: 26 });
  private readonly selectSound = this.audio.loadSound('assets/audio/ui-select.wav');

  constructor() {
    super({ window: { title: 'Inventory', width: 800, height: 480 } });
    this.status.setText('Choose an item');
    this.panel.addControl(this.status);
    this.panel.addControl(this.inventory);
    this.inventory.addControl(new InventoryButton('Health potion', 8));
    this.inventory.addControl(new InventoryButton('Torch', 50));
    this.inventory.addControl(new InventoryButton('Map fragment', 92));
    this.gui.addControl(this.panel);
  }

  protected override loop(_deltaTime: number): void {
    if (this.inventory.lastSelection.length > 0) {
      this.status.setText('Selected: ' + this.inventory.lastSelection);
      if (this.selectSound.isLoaded) this.selectSound.play();
      this.inventory.lastSelection = '';
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
  }
}

new InventoryGame().run();
```

The clicked button is the event target. `onAction` bubbles to
`InventoryScroll.onAction`; `currentTarget` identifies the object currently
handling the event. The manager delivers the event before the next `loop()`.

## Geometry and composition

Control offsets are relative to the parent. Use `center()` after sizing a
control to anchor it to its parent; centered anchors update when the parent or
window size changes. `getParent()` returns the read-only owner reference. Use
`addControl()` and `removeControl()` to change the tree, and
`setClipChildren(true)` when a container should clip children to its bounds.
`GuiScroll` clips automatically and uses its stable control ID to retain scroll
position as siblings reorder.

```ts
const scroll = new GuiScroll({ width: 420, height: 280 });
scroll.center();
scroll.setVerticalScrollBarMode('dynamic');

const section = new GuiPanel({ x: 12, y: 12, width: 380, height: 100 });
scroll.addControl(section);
const globalOrigin = section.localToGlobal({ x: 0, y: 0 });
```

## Events, focus, and values

Override `onAction` for buttons or `onChange` for checkboxes, sliders, text
editors, and selection controls. Events include the original `target`,
`currentTarget`, pointer coordinates, key/button values, wheel deltas, and
modifiers when available. Call `stopPropagation()` when a parent should not
handle an event.

```ts
class ConfirmButton extends GuiButton {
  protected override onAction(_event: GUIEvent): void {
    if (this.getParent() instanceof GuiPanel) this.hide();
  }
}
```

Focus with `focus()` or `makeFirstResponder()`. `game.gui.wantsPointerInput()`
and `wantsKeyboardInput()` report egui's current capture state; use them to
coordinate gameplay input. A newer `setValue()` call in TypeScript wins over a
stale response from an earlier frame.

## Textures, drawing, and sound

Images, bitmap-button states, profile backgrounds, and `GuiDrawingPanel`
image commands accept loaded textures owned by the same Game. Foreign or
unloaded textures are omitted. A drawing panel also supports lines, filled or
outlined rectangles, circles, text, polylines, and polygons in insertion order;
its primitives are clipped to the panel.

The example consumes the bubbled selection in `loop()` and plays a loaded UI
sound there. You can play the same sound directly from a control's event hook
when the interaction does not need to update a parent model first.

## Platform status

> **watchOS:** GUI controls do not work on watchOS in the current release:
> controls do not render and GUI input/events are unavailable. This limitation is temporary.
> A future SwiftUI adapter is planned, with no delivery date
> promised. Check `game.gui.isAvailable()` before building platform-specific
> behavior.

Read the [retained GUI API reference](../../api/gui/) for the complete control
list and the [immediate UI API](../../api/ui/) for stable-ID widgets described
directly in `render()`.
