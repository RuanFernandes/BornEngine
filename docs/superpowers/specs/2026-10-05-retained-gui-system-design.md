# Retained GUI System Design

## Status

Approved design. Implementation has not started.

## Context

BornEngine already exposes `game.ui`, an immediate-mode TypeScript facade that
records egui commands through the Perry FFI and reads widget responses on the
following frame. It remains useful for small, code-driven interfaces and must
continue to work.

This change adds a retained, object-oriented GUI layer with broad 2D control
coverage and reusable profiles. The public API is idiomatic BornEngine
TypeScript, while Rust and egui continue to own native widget evaluation, input
handling, and rendering.

## Goals

- Add a concrete, extensible `GUI` base class and a `game.gui` manager that owns
  the root controls for one `Game`.
- Let consumers construct controls without passing a `Game`, attach them to the
  manager or to another control, and subclass them with ordinary TypeScript.
- Cover the planned 2D control families as BornEngine controls with idiomatic
  APIs, including layout, text, input, selection, menus, lists, tabs, drawing,
  and scrolling.
- Provide method-based geometry and state helpers, including parent-relative
  coordinates, read-only parent access, centering, coordinate conversion,
  visibility, focus, and z-order operations.
- Provide reusable `GuiProfile` styling and a `GUIProfiles` registry, including
  built-in profiles and isolated per-control copies.
- Integrate with the existing egui context and rendering order without
  replacing `game.ui` or the Dear ImGui developer inspector.
- Document the API, controls, examples, platform support, and current watchOS
  limitation on the website and in the repository documentation.

## Non-goals

- Replacing or deprecating the immediate-mode `game.ui` API.
- Passing TypeScript closures, control objects, or serialized JSON trees across
  FFI. TypeScript callbacks stay in TypeScript.
- Matching external scripting syntax, object registration rules, or every
  legacy rendering quirk exactly.
- Implementing a watchOS renderer in this change. A dedicated SwiftUI adapter
  is future work with no promised delivery date.
- Expanding the GUI task into the separate Tauri editor, map editor, or 3D
  authoring workflow.

## Public object model

`GUI` is a concrete base class as well as the common container/control type.
Built-in controls extend it directly or through a small shared control-family
base. Users may subclass either `GUI` or a built-in class:

```ts
class InventoryPanel extends GuiScroll {
  protected override onAction(): void {
    // Custom behavior stays in TypeScript.
  }
}

const panel = new InventoryPanel();
panel.setSize(360, 240).center();
game.gui.addControl(panel);
```

Controls are constructed independently of `Game`. `game.gui` is the owner and
root collection for top-level controls. A control may contain children through
`addControl`, `removeControl`, and `clearControls`. Attaching a control already
owned by another parent or another game is rejected without corrupting either
tree. `parent` and the child collection are read-only views; structural changes
go through methods.

The root manager exposes corresponding control operations, availability and
input-capture queries, focus management, and lifecycle/disposal. It does not
inherit from `GUI`; top-level controls have no parent until attached to another
control, and their parent-relative origin is the game viewport.

The package root and `@bornengine/engine/gui` subpath export `GUI`, the built-in
controls, `GuiProfile`, and `GUIProfiles`. Public mutation uses methods such as
`setX`, `setText`, `setValue`, `show`, and `hide`; geometry is not exposed as
writable `x = ...` or `parent = ...` fields.

## Geometry and layout

- `x` and `y` are logical-pixel offsets relative to the parent content origin.
  Root controls use the logical game viewport. Parent padding and clipping
  define the child content region.
- `center()` centers on both axes in the parent; `centerHorizontal()` and
  `centerVertical()` select one axis. Centering remains anchored when the
  parent or viewport changes size.
- `setX()` clears only horizontal centering; `setY()` clears only vertical
  centering. `setPosition()` clears both anchors. This makes explicit
  positioning predictable after a helper has been used.
- `getX`/`setX`, `getY`/`setY`, `getWidth`/`setWidth`, `getHeight`/`setHeight`,
  `getPosition`/`setPosition`, `getSize`/`setSize`, and `resize` form the common
  geometry API. Setters return `this` for chaining.
- `getParent()` and the read-only `parent` getter expose ownership; `getRoot`,
  `localToGlobal`, `globalToLocal`, `bringToFront`, and `pushToBack` provide
  tree and coordinate helpers.
- Controls support `visible`, `active`, child clipping, bounds clipping,
  minimum size, hints, cursor selection, and keyboard focus through methods and
  read-only getters.
- Layout invalidation is resolved before rendering each frame. A centered
  control created before it is attached resolves its anchor when attached.

Parent-relative coordinates are the default. No separate world-space GUI mode
is introduced in this overhaul.

## Built-in control coverage

The API provides a BornEngine control for each family in the approved scope.
Concrete public classes are:

- **Base and layout:** `GUI`, `GuiWindow`, `GuiPanel`, `GuiScroll`,
  `GuiBitmapBorder`, `GuiStretch`, and `GuiFrameSet`.
- **Buttons and choices:** `GuiButton`, `GuiCheckBox`, `GuiRadioButton`, and
  `GuiBitmapButton`.
- **Text and editing:** `GuiText`, `GuiMLText`, `GuiTextEdit`, `GuiMLTextEdit`,
  and `GuiTextEditSlider`.
- **Selection and navigation:** `GuiPopUpMenu`, `GuiPopUpEdit`, `GuiTreeView`,
  `GuiTextList`, `GuiTab`, `GuiMenu`, and `GuiContextMenu`.
- **Display and drawing:** `GuiBitmap`, `GuiShowImg`, `GuiProgress`, and
  `GuiDrawingPanel`.
- **Value input:** `GuiSlider`.

Family bases such as button and list controls may be abstract or public where
they help custom subclasses. Every concrete control is a `GUI` subtype and can
be added to any compatible parent. The implementation maps profile and
control features to egui-supported behavior or custom egui painting, using
BornEngine-specific names and typed values.

The reference docs describe each class's purpose, parent/child behavior,
control-specific getters and setters, profile defaults, input semantics, and
functional limits. Specialized features such as multi-line formatted text,
bitmap states, tab selection, tree paths, editable popups, frame resizing, and
custom drawing receive explicit API descriptions rather than being omitted
from the broad-coverage scope.

## Profiles and visual states

`GuiProfile` is the typed style value used by controls. It covers the applicable
profile concepts in the approved scope: normal/hover/disabled colors,
text and selection colors, fonts, alignment, spacing, borders, opacity,
background images, text shadows, focus and modality behavior, cursor behavior,
and optional button sounds.

`GUIProfiles` owns built-in profile definitions and exposes typed lookup,
registration, and cloning. Built-ins include default, text, button, window,
scroll, checkbox, radio, popup, slider, progress, tree/list, and blue-themed
variants. Controls can share a registered profile. `setOwnProfile()` or an
explicit clone creates an isolated copy before per-control edits so one
control's customization does not mutate every consumer of the shared profile.
Each control applies a profile scope to its own egui widgets and descendants
inherit that scope unless they choose another profile.

Legacy properties without a useful egui equivalent are documented as
unsupported or represented by an explicit BornEngine behavior. The public
surface uses typed values and methods rather than encoded strings or mutable
fields.

## Events, focus, and lifecycle

The GUI tree owns structure and TypeScript behavior; egui owns hit testing,
pointer capture, widget focus, text editing, and native input translation.
Native responses are read on the next update, consistent with `game.ui`.
Before `Game.loop`, `game.gui` consumes the preceding frame's typed responses,
updates control state, and dispatches overridable TypeScript hooks. Events
bubble from the target through its parents; `stopPropagation()` prevents later
ancestors from receiving that event. No TypeScript callback crosses FFI.

Common hooks include attach/remove, show/hide/wake/sleep, move/resize, action
and change, focus/blur, pointer enter/leave/move/down/up/drag, wheel, and key
down/up. Controls may override only the hooks they need. `GuiButton` invokes
`onAction`; value controls invoke `onChange` after their native response has
been applied. Hook arguments use typed BornEngine event objects with target,
current target, local/global coordinates where relevant, and propagation
control.

The common API provides `focus`, `blur`, `isFocused`, `makeFirstResponder`, and
`isFirstResponder` aliases, plus tab navigation where the control is focusable.
`wantsPointerInput()` and `wantsKeyboardInput()` expose egui capture state;
gameplay input is not automatically swallowed. Hidden, detached, disabled, or
disposed controls do not receive input hooks. Removal runs lifecycle hooks once
and clears focus if the removed subtree owned it.

## Runtime, frame order, and FFI

1. At frame start, `Game` updates input and services, then the GUI manager reads
   the completed egui responses from the previous frame and dispatches hooks.
2. `Game.loop` runs and may update the model or mutate the GUI tree.
3. `Game.render` draws the game and may also issue existing `game.ui`
   immediate-mode calls.
4. The retained manager resolves layout and emits the current control tree as
   typed egui commands. Rust evaluates `game.ui` and `game.gui` in the shared
   egui context with deterministic ordering; the developer inspector stays on
   top when enabled.
5. Rust presents the frame and stores control responses for the next update.

The manager assigns stable IDs to controls and reserves a namespace distinct
from `game.ui` IDs. IDs survive reordering and frame rebuilds while a control
remains alive; disposal releases them. The native bridge carries typed numeric
arguments and whole strings through bounded FFI calls. It does not serialize a
tree or per-frame style/event payload as JSON. Commands include the resolved
bounds, clipping, style/profile scope, control kind, and stable ID needed by
the renderer. Variable-sized lists or draw primitives use a documented typed
scratch protocol rather than packed text.

The UI is rendered to the same window surface as game drawing and shares the
existing logical-pixel/high-DPI scale. It is not baked into a render texture.
The initial target set matches `game.ui`'s egui targets. Availability is
reported through `game.gui.isAvailable()` so a game can gate GUI behavior.

## Platform support and watchOS

The retained GUI works on the same targets as the existing egui `game.ui`
backend. It does **not work on watchOS in the current release**: controls do
not render there and GUI input/events are unavailable. The TypeScript API and
native symbols retain link-compatible watchOS stubs, and
`game.gui.isAvailable()` returns `false`.

This watchOS limitation is temporary. A dedicated SwiftUI adapter is planned
for future work, with no delivery date promised. Documentation must state the
limitation and future direction on the GUI API and guide pages, as well as the
Apple platform page and repository watchOS notes. Do not imply that the
existing SwiftUI Canvas draw-list adapter already renders these GUI controls.

## Documentation scope

The website receives a complete GUI API reference and a practical controls
guide, with the new pages added to navigation. Update the existing immediate
UI page to explain when to use `game.ui` versus `game.gui`, and link the new
reference from the API index, debug UI page, and audio/UI guide. Update the
Apple platform page with the watchOS status.

Repository docs receive a mirrored API/control reference and a guide, while
the existing `docs/api/ui.md` remains the immediate-mode reference and links
to the retained API. Update `docs/watchos-target.md` to mark the retained GUI
limitation as temporary and point to the future SwiftUI adapter. Code examples
must use BornEngine TypeScript and correctly show the next-frame response model.

## Verification and acceptance criteria

- Consumers can instantiate controls without a `Game`, attach them to
  `game.gui`, subclass `GUI` or a built-in control, and use method-based
  geometry and read-only parent access.
- Every control family listed above has a functional implementation, public
  TypeScript export, profile behavior, and focused interaction semantics.
- Parent-relative bounds, centering/reflow, clipping, coordinate conversion,
  visibility, focus, z-order, event bubbling, and disposal are deterministic.
- Existing `game.ui` behavior and IDs remain compatible; both APIs render in
  one egui context and the optional inspector remains above player UI.
- Native and Web typed FFI implementations and manifest declarations stay in
  parity. Unsupported watchOS symbols link, `isAvailable()` is false, and no
  GUI draw or input behavior is claimed there.
- TypeScript tests cover tree ownership, geometry, profile cloning, event
  dispatch/bubbling, focus/lifecycle, and frame-response timing.
- Rust tests cover control command interpretation, bounds/clipping, style
  scopes, and response generation. FFI validation covers manifest/native/Web/
  watchOS symbol and signature parity.
- Website checks validate internal links and build the new API/guide pages;
  local API and watchOS documentation stay consistent with the website.

## References

- Existing BornEngine immediate UI design:
  `docs/superpowers/specs/2026-09-25-bornengine-egui-imgui-design.md`
- Existing immediate API: `src/ui/`, `native/shared/src/ui/`, and
  `webpage/src/content/docs/api/ui.md`
