`game.gui` is the retained 2D interface of a `Game`. You create each control as an object, attach it to a parent, and keep it between frames. A control remembers its position, size, value, and children, and it reports user input through methods you override. The engine submits the control tree after your `render()` method returns and delivers the results on the next frame.

`game.gui` is a `GUIManager`. Every control extends the `GUI` class. Import the classes from `@bornengine/engine` or from `@bornengine/engine/gui`.

## Choose game.gui or game.ui

Use [`game.ui`](../ui/) when a small immediate-mode panel is easiest to describe again on every frame in `render()`. Use `game.gui` when you want reusable controls, parent and child organization, event hooks you can override, shared styles, or state that lives in the control. Both APIs draw through the same egui context and surface. Their IDs and responses stay separate, and the Dear ImGui developer overlay is drawn above both.

## Platform status

> **watchOS:** GUI controls do not work on watchOS in the current release: controls do not render and GUI input/events are unavailable. This limitation is temporary. A future SwiftUI adapter is planned, with no delivery date promised. `game.gui.isAvailable()` returns `false` on watchOS, so check it before you build platform-specific behavior.

On every other target that runs the shared engine, which covers desktop, mobile, tvOS, visionOS, and Web/WASM, `game.gui.isAvailable()` is `true`.

## Import and attach controls

Create controls on their own, then attach one or more root controls to `game.gui`. A control can belong to one parent at a time.

```ts
import { Colors, Game, GuiPanel, GuiText } from '@bornengine/engine';

class InventoryGame extends Game {
  constructor() {
    super({ window: { title: 'Inventory', width: 800, height: 480 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const panel = new GuiPanel({ x: 24, y: 24, width: 320, height: 180 });
    const title = new GuiText({ x: 12, y: 10, width: 280, height: 28 });
    title.setText('Inventory');
    panel.addControl(title);
    this.gui.addControl(panel);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
  }
}

new InventoryGame().run();
```

The renderer does not clear the screen, so `render()` clears it first. The retained controls are drawn on top of whatever `render()` drew.

### Constructor options

Every control accepts an optional `GUIControlOptions` object:

| Option | Default | Meaning |
| --- | --- | --- |
| `x`, `y` | 0 | Offset from the parent's content origin, in logical pixels. Logical pixels are the units of the window size you set in the `Game` options. |
| `width`, `height` | 0 | Size in logical pixels. Both must be finite and not negative. |
| `visible` | `true` | Whether the control and its children are drawn. |
| `active` | `true` | Whether the control and its children take part in input and drawing. |
| `clipChildren` | `false` | Clip children to this control's bounds. |
| `clipToBounds` | `false` | Clip this control's own drawing to its bounds. |

An invalid number throws a `RangeError`. Each control also has a read-only numeric `id`. It is assigned when the control is created, is unique in the process, and is never reused.

## Geometry and parent helpers

`x` and `y` are offsets from the parent's content origin. The content origin is the parent's top-left corner moved inward by the parent's padding (`profile.spacing.padding`). A `GuiWindow` also reserves its title bar above its content. `GuiTab` and `GuiStretch` add no padding. A root control uses the game window as its parent.

`center()` centers a control on both axes of its parent's content area. `centerHorizontal()` and `centerVertical()` center one axis. A centered axis follows the parent when the parent or the window changes size. Setters return the control, so calls can be chained.

```ts
import { GUI, GuiPanel, GuiScroll } from '@bornengine/engine';

function buildScroll(): GuiScroll {
  const scroll = new GuiScroll({ width: 420, height: 300 });
  scroll.center();
  scroll.setSize(460, 320);
  scroll.setX(24);
  scroll.addControl(new GuiPanel({ x: 12, y: 16, width: 380, height: 100 }));
  return scroll;
}

function windowOrigin(control: GUI): { x: number; y: number } {
  return control.localToGlobal({ x: 0, y: 0 });
}

function isInside(control: GUI, windowX: number, windowY: number): boolean {
  const local = control.globalToLocal({ x: windowX, y: windowY });
  const size = control.getSize();
  return local.x >= 0 && local.y >= 0 && local.x < size.width && local.y < size.height;
}

function moveToScroll(control: GUI, scroll: GuiScroll): boolean {
  const owner = control.getParent();
  if (owner === null) return false;
  owner.removeControl(control);
  scroll.addControl(control);
  return true;
}
```

In `buildScroll`, `center()` anchors both axes. `setX(24)` then clears only the horizontal anchor, so the scroll area stays centered vertically. `windowOrigin` returns where a control's top-left corner is on screen, and `isInside` tests a window position against a control. `moveToScroll` shows reparenting: remove a control from its owner before you add it to a new one.

| Methods | Purpose |
| --- | --- |
| `getX()`, `setX(x)`, `getY()`, `setY(y)` | Read or set one offset. Setting an axis clears that axis's center anchor and keeps the other. |
| `getPosition()`, `setPosition(x, y)` | `getPosition()` returns a copy `{ x, y }`. `setPosition(x, y)` sets both offsets and clears both anchors. |
| `getWidth()`, `setWidth(width)`, `getHeight()`, `setHeight(height)`, `getSize()`, `setSize(width, height)` | Read or change the size. A centered axis stays centered. |
| `resize(x, y, width, height)` | Set offsets and size together and clear both anchors. |
| `center()`, `centerHorizontal()`, `centerVertical()` | Anchor the control to the center of its parent's content area. |
| `getMinimumSize()`, `setMinimumSize(width, height)` | The smallest size the control accepts. Setting it grows a smaller control. |
| `getParent()`, `parent`, `getRoot()` | The owning control (`null` for a root), a read-only getter with the same value, and the root of the tree. |
| `getControls()`, `addControl(control)`, `removeControl(control)`, `clearControls()` | Inspect and change the children. `getControls()` returns a copy. `addControl` returns the control it attached and throws if the control already has a parent or an owner, was destroyed, or would create a cycle. `removeControl` returns `false` when the control is not a child. |
| `localToGlobal(point)`, `globalToLocal(point)` | Convert `{ x, y }` points between this control's own space and window coordinates through the whole ancestor chain. |
| `isVisible()`, `setVisible(value)`, `show()`, `hide()`, `isActive()`, `setActive(value)` | Draw or skip a subtree, and let it take input or not. A hidden or inactive control is not drawn and receives no events. |
| `setClipChildren(value)`, `getClipChildren()`, `setClipToBounds(value)`, `getClipToBounds()` | Clip the children to this control's bounds, or clip this control's own drawing. `clipToBounds` does not clip children unless `clipChildren` is also on. |
| `getProfile()`, `setProfile(profile)`, `setOwnProfile(profile)` | Read, share, or copy the visual style. See Profiles below. |
| `focus()`, `blur()`, `isFocused()`, `makeFirstResponder(enabled)`, `isFirstResponder()`, `tabFirst()` | Keyboard focus. `tabFirst()` focuses the first descendant that can take input. |
| `bringToFront()`, `pushToBack()` | Change the draw order among siblings, or among the roots of `game.gui`. The last control is drawn on top. |
| `getHint()`, `setHint(text)`, `getCursor()`, `setCursor(cursor)` | Store a hint string and a cursor name on the control. The current renderer does not show hints or change the pointer shape. |
| `destroy()` | Detach the control and remove all its children. A destroyed control cannot be attached again. |

`setOwnProfile` returns the profile it created, `removeControl` returns a boolean, and `clearControls` and `destroy` return nothing. `addControl` returns the control it attached. The other setters return the control they were called on.

## Profiles

A `GuiProfile` describes how a control looks. Controls share a profile by reference until you copy it, so changing a shared profile changes every control that uses it.

```ts
import { GUIProfiles, GuiButton, GuiProfile } from '@bornengine/engine';

function createButtons(): GuiButton[] {
  GUIProfiles.register(
    'danger',
    new GuiProfile({
      normalColor: { r: 0.55, g: 0.1, b: 0.1, a: 1 },
      textColor: { r: 1, g: 1, b: 1, a: 1 },
      font: { size: 16, bold: true },
      border: { width: 2, radius: 6 },
    }),
  );

  const remove = new GuiButton({ width: 160, height: 36 });
  remove.setText('Delete save').setProfile(GUIProfiles.get('danger'));

  const quiet = new GuiButton({ width: 160, height: 36 });
  quiet.setText('Close');
  quiet.setOwnProfile(GUIProfiles.get('button')).opacity = 0.8;

  return [remove, quiet];
}
```

- `GUIProfiles.get(name)` returns the shared profile. `GUIProfiles.clone(name)` returns an independent copy. `GUIProfiles.register(name, profile)` adds a profile, and it throws for an empty or duplicate name. An unknown name in `get` throws.
- `control.setProfile(profile)` assigns a shared profile. `control.setProfile(null)` removes the control's own profile. `control.setOwnProfile(profile)` copies `profile` and assigns the copy, so you can change one control without touching the others. Without an argument it copies the control's own profile, or `default` when it has none.
- A control without its own profile is drawn with the profile of its parent, and a root control without one uses `default`. `getProfile()` returns the control's own profile, or `default` if it has none.
- The built-in names are `default`, `text`, `button`, `window`, `scroll`, `checkbox`, `radio`, `popup`, `slider`, `progress`, `tree`, `list`, `blue`, `blue-button`, and `blue-window`.

Each control class assigns a profile when you create it:

| Control | Default profile |
| --- | --- |
| `GuiButton`, `GuiBitmapButton` | `button` |
| `GuiText`, `GuiMLText`, `GuiTextEdit`, `GuiMLTextEdit`, `GuiTextEditSlider` | `text` |
| `GuiWindow` | `window` |
| `GuiScroll` | `scroll` |
| `GuiCheckBox`, `GuiRadioButton` | `checkbox` |
| `GuiSlider` | `slider` |
| `GuiPopUpMenu`, `GuiPopUpEdit`, `GuiMenu`, `GuiContextMenu` | `popup` |
| `GuiTreeView` | `tree` |
| `GuiTextList` | `list` |
| `GuiProgress` | `progress` |
| `GuiTab` | `default` |
| `GUI`, `GuiPanel`, `GuiBitmapBorder`, `GuiStretch`, `GuiFrameSet`, `GuiBitmap`, `GuiShowImg`, `GuiDrawingPanel` | None. They use their parent's profile. |

The profile fields are:

| Field | Default | Used by the renderer in this release |
| --- | --- | --- |
| `normalColor` | dark gray | The control's fill. |
| `hoverColor` | lighter gray | The title bar of a `GuiWindow`, and hovered tab and menu items. |
| `selectionColor` | blue | The selected tab or menu item. |
| `textColor` | near white | Text. |
| `font` | `{ family: null, size: 14, bold: false, italic: false }` | `size`, `bold`, and `italic`. The size is limited to 1 through 128. `family` is not used. |
| `spacing` | `{ item: 4, padding: 6, inner: 2 }` | `padding` places children inside the parent. `item` and `inner` are not used. |
| `border` | `{ color, width: 1, radius: 3 }` | Border color, width, and corner radius. |
| `opacity` | 1 | Multiplies the alpha of the fill, text, and border. |
| `background` | `null` | A loaded `Texture` that fills the control. `GuiBitmapBorder` draws it along its edges. |
| `disabledColor`, `alignment`, `shadow`, `focusable`, `modal`, `cursor`, `buttonSounds` | | Stored and copied with the profile, but not used yet. In particular, the engine does not play `buttonSounds`. Play sounds from your event hooks instead. |

Profile colors are `{ r, g, b, a }`. Channels from 0 to 1 are the normal form. Values from 0 to 255, like `Colors.*`, are also accepted, but a color whose four channels are all 1 or less is read as 0 to 1.

## Built-in controls

Every control extends `GUI`. To add behavior, extend the closest control and override its hooks. A plain `GUI` draws only its fill and border.

### Containers and layout

| Class | What it is and its methods |
| --- | --- |
| `GUI` | The base class of every control. It holds the geometry, tree, visibility, focus, profile, and lifecycle methods described above. |
| `GuiPanel` | A rectangular container. |
| `GuiWindow` | A titled container the player can drag and resize. `getTitle()` and `setTitle(title)` manage the title. `setMovable(enabled)`, `setResizable(enabled)`, and `setClosable(enabled)` switch the abilities, and `isMovable()`, `isResizable()`, and `isClosable()` read them. All three are on by default. Dragging or resizing updates the control's `x`, `y`, `width`, and `height` on the next frame and calls `onMove` and `onResize`. The close button hides the window; call `show()` to open it again. |
| `GuiScroll` | A container that clips its children and scrolls them. `setHorizontalScrollBarMode(mode)` and `setVerticalScrollBarMode(mode)` take `'alwaysOn'`, `'alwaysOff'`, or `'dynamic'` (the default), and the matching getters return them. `setScrollBarThickness(pixels)` and `getScrollBarThickness()` manage the bar width (12 by default). The scroll position is kept per control. |
| `GuiBitmapBorder` | Draws the profile's `background` texture along its four edges and fills the inside with `normalColor`. `profile.border.width` sets the edge thickness. `setTiled(true)` repeats the texture along each edge at its native length, and `isTiled()` reads the setting. With tiling off, each edge stretches the texture. |
| `GuiStretch` | Scales its children from a virtual area to its real size. `setClientSize(width, height)` sets the virtual area and `getClientSize()` reads it. Child sizes, positions, and pointer coordinates use the same scale. With no client size, children are not scaled. |
| `GuiFrameSet` | Places its direct children into a grid of cells in row-major order. `setColumnCount(count)`, `setRowCount(count)`, and `setSplitterWidth(pixels)` configure the grid, and `getGridSize()` and `getSplitterWidth()` read it. The player can drag a splitter to resize the cells next to it. |

### Buttons and values

| Class | What it is and its methods |
| --- | --- |
| `GuiButtonBase` | The abstract base of buttons. `getText()` and `setText(text)` manage the label. You cannot create it directly. |
| `GuiButton` | A clickable text button. Override `onAction` to react to a click. |
| `GuiCheckBox` | A boolean choice. `getValue()` and `setValue(value)` read and set it. The check box draws no label of its own; put a `GuiText` beside it. |
| `GuiRadioButton` | A check box that can share a group. `setGroup(groupId)` and `getGroup()` manage the group, and selecting one button clears the other buttons with the same group that share its parent. |
| `GuiBitmapButton` | A button drawn from textures. `setTextures({ normal, hover, pressed, disabled })` and `getTextures()` manage them. Textures must be loaded by the same `Game`. The `disabled` texture is stored but not selected yet. If the texture for the current state (normal, hover, or pressed) is missing, the control draws as a plain button. |
| `GuiSlider` | A numeric slider. `setRange(minimum, maximum)` and `getRange()` manage the range, which starts at 0 to 1, and `getValue()` and `setValue(value)` read and set the value. `setValue` clamps to the range. |

### Text and editing

| Class | What it is and its methods |
| --- | --- |
| `GuiText` | Wrapped text. `getText()` and `setText(text)` manage it. |
| `GuiMLText` | Multi-line text with the same methods. |
| `GuiTextEdit` | An editable single line. `selectAll()`, `clear()`, `setMaxLength(length)`, `setPassword(enabled)`, and `setNumbersOnly(enabled)` configure it, and `getMaxLength()`, `isPassword()`, `isNumbersOnly()`, and `getSelection()` read it. Numbers-only keeps the characters `0` through `9`, `.`, `+`, and `-`. `selectAll()` records a range that `getSelection()` returns; the renderer does not apply that range and does not report the player's own selection. |
| `GuiMLTextEdit` | An editable block of lines with the same methods. Password masking applies to single-line editors only. |
| `GuiTextEditSlider` | A text field paired with a number. `setRange(minimum, maximum)`, `getRange()`, `getValue()`, and `setValue(value)` manage the number, and the text edit methods apply. Typed text is parsed as a number and clamped to the range. |

### Selection and navigation

| Class | What it is and its methods |
| --- | --- |
| `GuiArray` | The abstract base of controls that hold a list of items. `getItems()` returns a copy of the `{ id, label }` entries and `getItemCount()` returns their number. Item IDs are non-empty strings or safe integers, and they must be unique. |
| `GuiPopUpMenu` | A drop-down list. `add(label, id)` adds a choice, `clear()` removes all, `setSelected(id)` selects one or `null` for none, and `getSelected()` and `getSelectedText()` read the choice. `setSelected` throws for an unknown ID. |
| `GuiPopUpEdit` | An editable text field with a drop-down list. It adds `getText()` and `setText(text)`. |
| `GuiTreeView` | A tree of text nodes, drawn as rows indented by depth. `addNode(label, value)` adds a root node, `addNodeByPath(path, value)` adds a node at a path such as `'Inventory/Weapons/Sword'`, and both select the new node. `clearNodes()`, `setSelectedPath(path)`, `getSelected()`, `getSelectedPath()`, and `getRootNodes()` manage and read the tree. Paths have at most `GUI_TREE_MAX_PATH_LENGTH` characters (4096) and `GUI_TREE_MAX_PATH_SEGMENTS` parts (128), and labels cannot be empty. |
| `GuiTextList` | A list of rows. `addRow(id, text)`, `removeRow(id)`, and `clearRows()` change the rows, `setSelected(id)` selects one, and `getSelected()`, `getSelectedText()`, and `getRowCount()` read the list. |
| `GuiTab` | A tab bar with one page for each tab. `addTab(label, id)` creates a tab and returns its `GuiPanel` page, `setSelected(id)` and `getSelected()` manage the current tab, and `getTab(id)` returns a page. The bar is 28 pixels high and only the selected page is visible. |
| `GuiMenu` | A horizontal menu bar. `add(label, id, callback)` adds an item with an optional callback, and `activateItem(id)` selects an item, runs its callback, and raises an action event. |
| `GuiContextMenu` | A menu that opens at the pointer when the player right-clicks inside its parent. It starts hidden. It closes after an item is activated. `openAt(x, y, button)` opens it by hand (the button must be `MouseButton.RIGHT`), and `isOpen()` reports its state. Its width is 160 unless you set one. |

### Images, progress, and custom drawing

| Class | What it is and its methods |
| --- | --- |
| `GuiBitmap` | Shows a texture. `setTexture(texture)`, `setTint(color)`, `setOpacity(value)` (0 to 1), `setRotation(degrees)`, and `setZoom(value)` (greater than 0) configure it, and the matching getters read the values. |
| `GuiShowImg` | An image control with the same methods as `GuiBitmap`. |
| `GuiProgress` | A progress bar. `setValue(value)` clamps to 0 through 1, and `getValue()` reads it. |
| `GuiDrawingPanel` | A panel that draws ordered shapes, clipped to its bounds, with coordinates measured from its top-left corner. `drawLine(start, end, color, thickness)`, `drawRect(rect, color, filled)`, `drawCircle(center, radius, color, thickness)`, `drawText(text, position, size, color)`, `drawImage(texture, destination, tint, rotation)`, `drawPolyline(points, color, thickness)`, and `drawPolygon(points, color)` add shapes, `clearDrawing()` removes them, and `getDrawingCommands()` returns copies. Circles, polylines, and polygons are drawn as outlines. |

Textures reach the renderer only when they are loaded and owned by the same `Game` as the GUI. A foreign or unloaded texture is skipped. Textures are registered through the same path as `game.ui.image()`.

The next example builds a small options window from several of these controls:

```ts
import {
  Colors,
  Game,
  GuiCheckBox,
  GuiPopUpMenu,
  GuiSlider,
  GuiTab,
  GuiText,
  GuiTextEdit,
  GuiWindow,
} from '@bornengine/engine';

class OptionsGame extends Game {
  protected override onStart(): void {
    const dialog = new GuiWindow({ x: 40, y: 40, width: 420, height: 340 });
    dialog.setTitle('Options').setClosable(true);

    const tabs = new GuiTab({ x: 0, y: 0, width: 400, height: 280 });
    const audioPage = tabs.addTab('Audio', 'audio');
    const playerPage = tabs.addTab('Player', 'player');

    const volume = new GuiSlider({ x: 8, y: 8, width: 200, height: 24 });
    volume.setRange(0, 100).setValue(70);
    const mute = new GuiCheckBox({ x: 8, y: 40, width: 24, height: 24 });
    const muteLabel = new GuiText({ x: 40, y: 40, width: 120, height: 24 });
    muteLabel.setText('Mute');
    audioPage.addControl(volume);
    audioPage.addControl(mute);
    audioPage.addControl(muteLabel);

    const nameField = new GuiTextEdit({ x: 8, y: 8, width: 200, height: 28 });
    nameField.setText('Player 1').setMaxLength(16);
    const quality = new GuiPopUpMenu({ x: 8, y: 48, width: 200, height: 28 });
    quality.add('Low', 'low').add('High', 'high').setSelected('high');
    playerPage.addControl(nameField);
    playerPage.addControl(quality);

    dialog.addControl(tabs);
    this.gui.addControl(dialog);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
  }
}

new OptionsGame().run();
```

## Events, focus, and response timing

Override only the hooks a control needs. All of them are `protected` methods on `GUI` that do nothing by default.

| Hooks | When they run |
| --- | --- |
| `onAction(event)` | The player clicks a button, check box, or radio button, or picks an item in a menu, list, tree, tab bar, or pop-up. |
| `onChange(event)` | The player changes a value: check box, radio button, slider, text editor, or a pop-up, list, or tree selection. |
| `onFocus(event)`, `onBlur(event)` | The control gains or loses keyboard focus. |
| `onPointerEnter(event)`, `onPointerLeave(event)`, `onPointerMove(event)` | The pointer enters, leaves, or moves over the control. |
| `onPointerDown(event)`, `onPointerUp(event)`, `onPointerDrag(event)` | A pointer button goes down or up over the control, or the control is dragged. |
| `onWheel(event)` | The wheel moves while the pointer is over the control. |
| `onKeyDown(event)`, `onKeyUp(event)` | A key goes down or up while the control has focus. |
| `onAdd()`, `onRemove()` | The control is attached to or removed from a parent or from `game.gui`. |
| `onShow()`, `onHide()` | The control becomes visible or hidden. |
| `onWake()`, `onSleep()` | The control becomes both visible and active (wake), or stops being so (sleep). |
| `onMove()`, `onResize()` | The control's position or size changes. |

Changing a value from your own code, with `setValue()`, `setText()`, or `setSelected()`, does not call `onChange`. Only the player's edits do.

```ts
import { GUIEvent, GuiButton, GuiPanel } from '@bornengine/engine';

class ShopButton extends GuiButton {
  protected override onPointerEnter(event: GUIEvent): void {
    console.log('hover at', event.localX, event.localY);
  }
}

class ShopPanel extends GuiPanel {
  lastPurchase = '';

  protected override onAction(event: GUIEvent): void {
    if (!(event.target instanceof ShopButton)) return;
    this.lastPurchase = event.target.getText();
    event.stopPropagation();
  }
}
```

Every hook that takes an event receives a `GUIEvent`:

- `type` is one of the `GUIEventType` values: `Action`, `Change`, `Focus`, `Blur`, `PointerEnter`, `PointerLeave`, `PointerMove`, `PointerDown`, `PointerUp`, `PointerDrag`, `Wheel`, `KeyDown`, and `KeyUp`.
- `target` is the control the event is about. `currentTarget` is the control whose hook is running now.
- `localX` and `localY` are the pointer position relative to the target. `globalX` and `globalY` are window coordinates. Both are in logical pixels. They are `undefined` when the event did not come from pointer input, such as a focus change made by `focus()`.
- `key` is a key code to compare with `Key.*`, and `button` is a button number to compare with `MouseButton.*`. `wheelX` and `wheelY` are the wheel amounts.
- `modifiers` is a bit mask: Shift is 1, Ctrl is 2, Alt is 4, and Super is 8.
- An event starts at its target and bubbles to each parent in turn, calling the same hook on each. `event.stopPropagation()` ends the trip after the current hook, and `isPropagationStopped()` tells you if it was called. A hidden, inactive, detached, or destroyed control does not receive events, and bubbling stops at one.

The engine evaluates `game.gui` and `game.ui` together after your `render()` method. The results reach you on the next frame, before `loop()` runs: controls update their values, then the queued events run in the order they happened. So a click on frame 10 calls `onAction` at the start of frame 11. Value setters you call in code take precedence over a native value from an earlier frame. When `game.gui.isAvailable()` is `false`, the GUI skips all of this work and dispatches no events.

Use `focus()` and `blur()` to move keyboard focus yourself, and `getFocusedControl()` on the manager to see which control has it. `game.gui.wantsPointerInput()` and `wantsKeyboardInput()` report whether the GUI is using the pointer or the keyboard. The GUI does not consume the input of your game, so check these methods to decide what gameplay should ignore.

## The GUIManager

`game.gui` is the `GUIManager`. It owns the root controls and the focus.

| Member | Purpose |
| --- | --- |
| `addControl(control)` | Attach a root control. It throws if the control already has a parent or an owner, or was destroyed. |
| `removeControl(control)` | Detach a root control. It returns `false` if the control is not a root of this manager. |
| `clearControls()` | Detach every root control. |
| `getControls()` | A copy of the root controls, in draw order. |
| `getFocusedControl()` | The control that has focus, or `null`. |
| `dispatchEvent(target, type, options)` | Build a `GUIEvent` and bubble it from `target`. It returns the event, or `null` when the target cannot receive input. The engine uses it for native input. You can call it to simulate input in a test. |
| `isAvailable()`, `wantsPointerInput()`, `wantsKeyboardInput()` | Whether the GUI works on this target, and whether it is using the pointer or the keyboard. |
| `game` | The owning `Game`. |

The `Game` calls the manager's frame methods. Do not call `updateFrame()` or `renderFrame()` yourself.

The GUI sends at most 16,384 commands to the renderer each frame. A control uses two commands, each list item uses one, and each `GuiDrawingPanel` shape uses two. Commands past the limit are dropped, so very large trees, lists, and drawings can lose their last controls.

## Next steps

- [Build a retained GUI](../../guides/gui-controls/) walks through a scrolling panel with events, a profile, and a sound.
- [UI](../ui/) documents the immediate-mode widgets that share the display.
- [Debug tools](../debug-ui/) shows the developer overlay that is drawn above the GUI.
- [Apple platform notes](../../platforms/apple/) explain the watchOS limitation.
