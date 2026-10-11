---
title: Build a retained GUI
description: Organize reusable GUI controls into a scrollable panel, handle their events, and style them with profiles.
section: Guides
order: 75
---

This guide builds a small inventory screen with the retained GUI. A panel holds a scrolling list of buttons. You create the controls once, react to clicks in event hooks, style the buttons with a profile, and play a sound when the player picks an item. The [GUI API](../../api/gui/) lists every control and method.

A retained GUI keeps its controls as objects. You build the tree once and change it only when something changes. That is different from the immediate-mode [UI](../../api/ui/), where you describe every widget again on each frame.

## Before you start

- Finish [Quickstart](../../getting-started/quickstart/) and use a project that runs with `bornengine run main.ts`.
- For the sound, save a short WAV file as `assets/audio/ui-select.wav` in the project. The example checks `isLoaded`, so it still runs without the file.

## Create a scrollable panel

Replace `main.ts` with this file:

```ts
import { Colors, Game, GUIEvent, GUIProfiles, GuiButton, GuiPanel, GuiScroll, GuiText } from '@bornengine/engine';

class InventoryButton extends GuiButton {
  constructor(label: string, y: number) {
    super({ x: 8, y, width: 220, height: 34 });
    this.setText(label);
    const profile = this.setOwnProfile(GUIProfiles.get('button'));
    profile.normalColor = { r: 0.12, g: 0.2, b: 0.32, a: 1 };
  }
}

class InventoryScroll extends GuiScroll {
  selection = '';

  protected override onAction(event: GUIEvent): void {
    if (!(event.target instanceof InventoryButton)) return;
    this.selection = event.target.getText();
    event.stopPropagation();
  }
}

class InventoryGame extends Game {
  private readonly selectSound = this.audio.loadSound('assets/audio/ui-select.wav');
  private readonly status = new GuiText({ x: 10, y: 8, width: 270, height: 26 });
  private readonly inventory = new InventoryScroll({ x: 10, y: 40, width: 270, height: 200 });

  constructor() {
    super({ window: { title: 'Inventory', width: 800, height: 480 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.status.setText('Choose an item');

    const items = ['Health potion', 'Torch', 'Map fragment', 'Rope', 'Key', 'Bread', 'Lantern', 'Compass'];
    for (let index = 0; index < items.length; index++) {
      this.inventory.addControl(new InventoryButton(items[index], 8 + index * 42));
    }

    const panel = new GuiPanel({ x: 24, y: 24, width: 300, height: 260 });
    panel.addControl(this.status);
    panel.addControl(this.inventory);
    this.gui.addControl(panel);
  }

  protected override loop(_deltaTime: number): void {
    if (this.inventory.selection.length === 0) return;
    this.status.setText('Selected: ' + this.inventory.selection);
    if (this.selectSound.isLoaded) this.selectSound.play();
    this.inventory.selection = '';
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
  }
}

new InventoryGame().run();
```

Run it with `bornengine run main.ts`. Click an item and the status line changes. Eight buttons do not fit in the 200 pixel high scroll area, so a scroll bar appears.

What each part does:

- `InventoryButton` is a `GuiButton` with its own profile. `setOwnProfile(GUIProfiles.get('button'))` copies the built-in `button` profile for this one button. Changing `normalColor` on the copy does not touch any other button.
- `InventoryScroll` is a `GuiScroll` with an `onAction` hook. A click on a button raises an action event on that button. The event bubbles up to its parent, the scroll area, and the hook runs there. `event.target` is the clicked button, and `event.currentTarget` is the scroll area.
- `event.stopPropagation()` ends the bubbling, so the panel and any controls above it do not see the event.
- The manager delivers events on the next frame, before `loop()` runs. `loop()` reads `selection`, updates the status text, and plays the sound.
- `this.gui` keeps the controls attached to it until you remove them or the `Game` shuts down.

## Geometry and composition

A control's `x` and `y` are offsets from its parent's content origin, which is the parent's top-left corner moved in by the parent's padding. A control without a parent is placed in the game window. Use `getX()` and `getY()` to read the offsets and `setX()`, `setY()`, and `setPosition(x, y)` to change them.

`center()`, `centerHorizontal()`, and `centerVertical()` anchor a control to the middle of its parent. The anchor is resolved when the control has a parent or is attached to `game.gui`, and again when the parent or the window changes size. Setting a position on an axis clears the anchor on that axis.

```ts
import { GuiPanel, GuiScroll } from '@bornengine/engine';

function buildSettingsScroll(): GuiScroll {
  const scroll = new GuiScroll({ width: 420, height: 280 });
  scroll.centerHorizontal();
  scroll.setY(40);
  scroll.setVerticalScrollBarMode('dynamic');

  for (let index = 0; index < 4; index++) {
    scroll.addControl(new GuiPanel({ x: 12, y: 12 + index * 112, width: 380, height: 100 }));
  }
  return scroll;
}

function removeFirstSection(scroll: GuiScroll): boolean {
  const sections = scroll.getControls();
  if (sections.length === 0) return false;
  const first = sections[0];
  return first.getParent() === scroll && scroll.removeControl(first);
}
```

- `addControl(control)` attaches a child. A control can have only one parent, and attaching a control that already has one throws. `removeControl(control)` detaches it and returns `false` if it was not a child.
- `getParent()` returns the owner, or `null` for a root. `localToGlobal(point)` and `globalToLocal(point)` convert between a control's own space and window coordinates.
- `setClipChildren(true)` clips the children of a control to its bounds. `GuiScroll` does this on its own and keeps its scroll position for as long as the control exists.
- Build large trees from parts. A small subclass for each part, such as `InventoryButton`, keeps the setup in one place and gives you a class to hang hooks on.

## Events, focus, and values

Override `onAction` for clicks and `onChange` for values that the player edits, such as check boxes, sliders, and text fields. Every event hook receives a `GUIEvent` with the `target`, the `currentTarget`, the pointer position in `localX` and `localY`, and key, button, wheel, and modifier data when they apply.

```ts
import { GUIEvent, GuiButton, GuiCheckBox, GuiPanel } from '@bornengine/engine';

class ConfirmButton extends GuiButton {
  protected override onAction(event: GUIEvent): void {
    this.hide();
    event.stopPropagation();
  }
}

class DialogPanel extends GuiPanel {
  actions = 0;

  protected override onAction(_event: GUIEvent): void {
    this.actions += 1;
  }
}

class MuteBox extends GuiCheckBox {
  protected override onChange(_event: GUIEvent): void {
    console.log('muted:', this.getValue());
  }
}
```

- The `ConfirmButton` hides itself and stops the event. A `DialogPanel` that contains it counts the actions it receives, so it never counts a click on the confirm button. Without `stopPropagation()`, the event would reach the panel too.
- `onChange` runs when the player changes the value. It does not run when your own code calls `setValue()`, `setText()`, or `setSelected()`.
- A hidden, inactive, or removed control receives no events.
- Move keyboard focus with `focus()` or `makeFirstResponder()`, and release it with `blur()`.
- `game.gui.wantsPointerInput()` and `wantsKeyboardInput()` report whether the GUI is using the pointer or the keyboard. The GUI does not take input away from your game, so check them in `loop()` before gameplay reacts to the same input.
- If your code sets a value while an older response from the renderer is still waiting, your value wins.

## Textures, drawing, and sound

Images, bitmap button states, profile backgrounds, and `GuiDrawingPanel` images accept loaded textures that belong to the same `Game`. A texture that is not loaded, or that another `Game` owns, is skipped. Load textures with `game.assets.loadTexture(path)`, and pass them to `GuiBitmap.setTexture(texture)`, `GuiBitmapButton.setTextures({ normal, hover, pressed })`, or `drawImage()`.

A `GuiDrawingPanel` draws shapes in the order you add them and clips them to its bounds. Coordinates start at the panel's top-left corner.

```ts
import { Colors, GuiDrawingPanel } from '@bornengine/engine';

function buildChart(): GuiDrawingPanel {
  const chart = new GuiDrawingPanel({ x: 16, y: 16, width: 240, height: 120 });
  chart.drawRect({ x: 0, y: 0, width: 240, height: 120 }, Colors.DARKGRAY);
  chart.drawLine({ x: 0, y: 100 }, { x: 240, y: 20 }, Colors.SKYBLUE, 2);
  chart.drawText('Score', { x: 8, y: 6 }, 14, Colors.WHITE);
  return chart;
}
```

Profiles have a `buttonSounds` field, but the engine does not play it in this release. Play a sound from the event hook instead. A control has no direct access to the `Game`, so load the `Sound` in the game and pass it in:

```ts
import { Game, GUIEvent, GuiButton } from '@bornengine/engine';
import type { Sound } from '@bornengine/engine';

class ClickButton extends GuiButton {
  private readonly click: Sound;

  constructor(label: string, click: Sound) {
    super({ width: 160, height: 34 });
    this.setText(label);
    this.click = click;
  }

  protected override onAction(_event: GUIEvent): void {
    if (this.click.isLoaded) this.click.play();
  }
}

class MenuGame extends Game {
  protected override onStart(): void {
    const click = this.audio.loadSound('assets/audio/ui-select.wav');
    const play = new ClickButton('Play', click);
    play.center();
    this.gui.addControl(play);
  }
}

new MenuGame().run();
```

The sample plays the sound straight from the hook. Use this when the click needs no other state change. When a parent has to update first, as in the inventory example, play the sound from `loop()` instead. [Audio](../../api/audio/) explains buses, volume, and the sound manager.

## Platform status

> **watchOS:** GUI controls do not work on watchOS in the current release: controls do not render and GUI input/events are unavailable. This limitation is temporary. A future SwiftUI adapter is planned, with no delivery date promised. Check `game.gui.isAvailable()` before you build platform-specific behavior.

Every other target that runs the shared engine supports the retained GUI. See the [GUI API](../../api/gui/) for the full reference.

## Next steps

- [GUI API](../../api/gui/) lists every control, helper, and profile field.
- [UI](../../api/ui/) covers the immediate-mode widgets for quick menus and HUDs.
- [Audio and UI](../audio-and-ui/) combines sound effects with a heads-up display.
- [Apple platforms](../../platforms/apple/) explains the watchOS limitation.
