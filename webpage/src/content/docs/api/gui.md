---
title: Retained GUI controls
description: Build reusable, parented 2D GUI controls with profiles, events, and helpers.
section: API / UI
order: 46
---

# Retained GUI controls

`game.gui` is BornEngine's retained, object-oriented 2D GUI. Create controls as
objects, attach them to a parent, and keep their state between frames. The
engine lays out and submits the tree after `Game.render()`; native responses
are applied before the next `Game.loop()`.

## Choose `game.gui` or `game.ui`

Use [`game.ui`](../ui/) when a small immediate-mode HUD is easiest to describe
again during each `render()` call. Use `game.gui` when you want reusable
controls, parent-child organization, subclass hooks, profiles, or persistent
widget state. Both APIs render through the same egui context and surface. Their
IDs and response stores stay separate, and the developer inspector remains on
top when enabled.

## Platform status

> **watchOS:** GUI controls do not work on watchOS in the current release:
> controls do not render and GUI input/events are unavailable. This limitation is temporary.
> A future SwiftUI adapter is planned, with no delivery date
> promised. Check `game.gui.isAvailable()` before building platform-specific
> behavior.

## Import and attach controls

Import from the package root or from the `gui` subpath:

```ts
import { GUI, GuiButton, GuiPanel, GuiScroll, GuiText } from '@bornengine/engine';
// Or: import { GUI, GuiButton, GuiPanel, GuiScroll, GuiText } from '@bornengine/engine/gui';
```

Construct controls independently, then attach one or more roots to the
Game-owned manager. A child can only belong to one parent at a time.

```ts
const panel = new GuiPanel({ x: 24, y: 24, width: 320, height: 180 });
const title = new GuiText({ x: 12, y: 10, width: 280, height: 28 });
title.setText('Inventory');
panel.addControl(title);
game.gui.addControl(panel);
```

## Geometry and parent helpers

`x` and `y` are logical-pixel offsets from the parent content origin, after the
parent profile's padding. A `GuiWindow` also reserves its title bar above the
child content. A root control uses the game viewport as its parent bounds.
`center()` centers on both axes of the current parent content area;
`centerHorizontal()` and `centerVertical()` anchor one axis. Anchors update
after parent or viewport resize. Geometry setters return the control for
chaining.

```ts
const scroll = new GuiScroll({ width: 420, height: 300 });
scroll.center();
scroll.setX(24).centerVertical();
scroll.setSize(460, 320);

const child = new GUI({ x: 12, y: 16, width: 120, height: 32 });
scroll.addControl(child);
const parent = child.getParent();
const screenPoint = child.localToGlobal({ x: 0, y: 0 });
```

Common geometry and tree methods:

| Methods | Purpose |
| --- | --- |
| `getX()` / `setX(x)`, `getY()` / `setY(y)` | Read or set a parent-relative offset; setting one axis clears only that axis's center anchor. |
| `getPosition()` / `setPosition(x, y)`, `getSize()` / `setSize(width, height)`, `resize(x, y, width, height)` | Read or update geometry. Dimensions must be finite and non-negative. |
| `center()`, `centerHorizontal()`, `centerVertical()` | Anchor the control to its parent's center. |
| `getParent()`, `getRoot()`, `getControls()`, `addControl(control)`, `removeControl(control)`, `clearControls()` | Inspect and manage the retained tree. `parent` is a read-only getter. |
| `localToGlobal(point)`, `globalToLocal(point)` | Convert coordinates through the current ancestor chain. |
| `show()`, `hide()`, `setVisible(value)`, `setActive(value)` | Control visibility and whether a subtree participates in GUI input/rendering. |
| `setClipChildren(value)`, `setClipToBounds(value)` | Clip descendants or the control's own drawing to bounds. `GuiScroll` clips children to its viewport. |
| `getProfile()` / `setProfile(profile)`, `setOwnProfile(profile?)` | Read, share, or clone a visual profile. |
| `bringToFront()`, `pushToBack()` | Change sibling/root draw order. |
| `destroy()` | Detach the control and its descendants permanently. |

`GUIManager` also exposes `getControls()`, `isAvailable()`,
`wantsPointerInput()`, and `wantsKeyboardInput()`. Check input-capture methods
when deciding whether gameplay should react to the same pointer or keyboard
input; the GUI does not automatically consume game input.

## Profiles

`GuiProfile` holds normal, hover, disabled, text, and selection colors; font and
alignment; spacing, border, opacity, background texture, shadow, focus and
modality settings, cursor, and optional button sounds. Profiles are shared by
reference until cloned. `setOwnProfile()` gives one control an independent
copy.

```ts
import { GUIProfiles } from '@bornengine/engine/gui';

const button = new GuiButton({ width: 160, height: 36 });
const profile = button.setOwnProfile(GUIProfiles.get('button'));
profile.normalColor = { r: 0.08, g: 0.24, b: 0.5, a: 1 };
button.setText('Continue');
```

Built-in names include `default`, `text`, `button`, `window`, `scroll`,
`checkbox`, `radio`, `popup`, `slider`, `progress`, `tree`, `list`, and `blue`.
Use `GUIProfiles.register(name, profile)` for an application-wide profile;
duplicate names and unknown lookups throw. Use `GUIProfiles.clone(name)` or
`control.setOwnProfile()` before changing a profile for one control.

## Built-in controls

Every concrete control extends `GUI`; add it to a parent with `addControl()`
or to the root with `game.gui.addControl()`. Controls accept optional
`GUIControlOptions` for geometry, visibility, clipping, and activity.

### Base and layout

| Class | Methods and purpose |
| --- | --- |
| `GUI` | Extensible base/container. Geometry, tree, visibility, focus, cursor, hints, minimum size, z-order, and lifecycle helpers are available on every control. |
| `GuiPanel` | Basic rectangular container. Add children and choose whether they clip to its bounds. |
| `GuiWindow` | Titled, movable, resizable panel. `getTitle()` / `setTitle(title)` manage its title; `setMovable(enabled)` and `setResizable(enabled)` enable native dragging and resizing. `setClosable(enabled)` adds a close button that hides the window; call `show()` to reopen it. |
| `GuiScroll` | Scrollable container with child clipping. Set horizontal/vertical scrollbar modes to `'alwaysOn'`, `'alwaysOff'`, or `'dynamic'`; configure `setScrollBarThickness(pixels)`. |
| `GuiBitmapBorder` | Draws the profile background bitmap on its four edges and keeps the interior on `normalColor`. `profile.border.width` sets edge thickness; `setTiled(true)` repeats the bitmap along each edge at its native length, while the edge thickness is fitted to the control. With tiling off, each edge stretches the bitmap. |
| `GuiStretch` | Stretches its children from the virtual area set by `setClientSize(width, height)` to the control's physical size. Child geometry and pointer-local coordinates use the same scale. |
| `GuiFrameSet` | Lays out direct children in row-major cells. `setColumnCount(n)`, `setRowCount(n)`, and `setSplitterWidth(pixels)` configure the grid; drag a splitter to resize adjacent cells. |

### Buttons and values

| Class | Methods and purpose |
| --- | --- |
| `GuiButtonBase` | Abstract button base with `getText()` / `setText(text)`. |
| `GuiButton` | Clickable text button. Override `onAction(event)` for an action. |
| `GuiCheckBox` | Boolean choice. Use `getValue()` / `setValue(value)`; changes call `onChange(event)`. |
| `GuiRadioButton` | Boolean choice with optional sibling exclusivity through `setGroup(groupId)`. |
| `GuiBitmapButton` | Button with `setTextures({ normal, hover, pressed, disabled })` and `getTextures()`. Textures must be loaded by the same Game. |
| `GuiSlider` | Numeric value input. Set its range with `setRange(minimum, maximum)` and access `getValue()` / `setValue(value)`. |

### Text and editing

| Class | Methods and purpose |
| --- | --- |
| `GuiText` | Single or wrapped text with `getText()` / `setText(text)`. |
| `GuiMLText` | Multi-line text control. |
| `GuiTextEdit` | Editable single-line text. `selectAll()`, `clear()`, `setMaxLength(n)`, `setPassword(enabled)`, `setNumbersOnly(enabled)`, and `getSelection()` configure the editor. |
| `GuiMLTextEdit` | Multi-line editable text with the same length, password, numeric-only, and selection methods. |
| `GuiTextEditSlider` | Text edit paired with a numeric value. Use `setRange(minimum, maximum)` and `getValue()` / `setValue(value)` alongside text-edit options. |

### Selection and navigation

| Class | Methods and purpose |
| --- | --- |
| `GuiArray` | Abstract base for controls backed by a typed item list. `getItems()` and `getItemCount()` inspect the list. |
| `GuiPopUpMenu` | `add(label, id)`, `clear()`, `setSelected(id)`, `getSelected()`, and `getSelectedText()` manage choices. |
| `GuiPopUpEdit` | Editable text field with an item popup; adds `getText()` / `setText(text)`. Native text edits return to TypeScript before the next `Game.loop`. |
| `GuiTreeView` | `addNode(label, value?)`, `addNodeByPath(path, value?)`, `clearNodes()`, `getSelected()`, and `getSelectedPath()` build and inspect a bounded tree. |
| `GuiTextList` | `addRow(id, text)`, `removeRow(id)`, `clearRows()`, and `getSelected()` manage rows. |
| `GuiTab` | Horizontal tab bar with pages below it. `addTab(label, id)`, `setSelected(id)`, and `getSelected()` choose a page. |
| `GuiMenu` | Horizontal menu bar that invokes the selected item's callback and bubbles an action event. |
| `GuiContextMenu` | Context menu that opens at the pointer on a secondary click inside its parent, invokes the selected item's callback, bubbles an action event, and closes after activation. `openAt(x, y, button)` is also available for explicit positioning. |

### Images, progress, and custom drawing

| Class | Methods and purpose |
| --- | --- |
| `GuiBitmap` | Displays a Game-owned texture. `setTexture(texture)`, `setTint(color)`, `setOpacity(value)`, `setRotation(degrees)`, and `setZoom(value)` configure it. |
| `GuiShowImg` | Image-display control with the same texture, tint, opacity, rotation, and zoom methods. |
| `GuiProgress` | Unit-interval progress value; `setValue(value)` clamps to `[0, 1]`. |
| `GuiDrawingPanel` | Ordered, panel-clipped `drawLine`, `drawRect`, `drawCircle`, `drawText`, `drawImage`, `drawPolyline`, `drawPolygon`, and `clearDrawing` commands. |

Textures are accepted only when they are loaded and owned by the current Game.
Foreign or unloaded images are omitted. Background and control textures are
registered through the same egui texture path as `game.ui.image()`.

## Events, focus, and response timing

Override only the hooks a control needs: `onAction`, `onChange`, `onFocus`,
`onBlur`, `onPointerEnter`, `onPointerLeave`, `onPointerMove`,
`onPointerDown`, `onPointerUp`, `onPointerDrag`, `onWheel`, `onKeyDown`, and
`onKeyUp`. Lifecycle hooks include `onAdd`, `onRemove`, `onShow`, `onHide`,
`onWake`, `onSleep`, `onMove`, and `onResize`.

```ts
class ApplyButton extends GuiButton {
  protected override onAction(event: GUIEvent): void {
    console.log(event.target === this, event.currentTarget === this);
  }
}
```

GUI events carry `target`, `currentTarget`, local/global pointer coordinates,
key/button/wheel data, and modifiers when present. They bubble from the target
to its parents; call `event.stopPropagation()` to stop bubbling. Use
`focus()`, `blur()`, `isFocused()`, `makeFirstResponder()`, and `isFirstResponder()`
for keyboard focus. Hidden, inactive, detached, or destroyed controls do not
receive stale input responses.

The native backend evaluates both UI APIs after game rendering. `game.gui`
applies the completed response snapshot during the next frame's service update,
before `Game.loop()`. Value setters made in TypeScript take precedence over an
older pending native value. Use `game.gui.isAvailable()` before relying on GUI
rendering or input; unavailable targets return `false` and dispatch no GUI
events.

## Related pages

- [Immediate `game.ui` API](../ui/)
- [GUI controls guide](../../guides/gui-controls/)
- [Debug UI](../debug-ui/)
- [Apple platform notes](../../platforms/apple/)
