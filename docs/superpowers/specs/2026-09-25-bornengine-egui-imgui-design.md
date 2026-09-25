# BornEngine egui and Dear ImGui Integration Design

## Context

BornEngine's game code is TypeScript compiled by Perry, while the renderer,
input state, and platform backends are Rust. Native platforms instantiate the
shared `define_core_ffi!` surface; Web has a separate wasm-bindgen layer and JS
glue between the game and renderer WASM modules. The renderer supports a direct
2D frame path and a 3D scene path whose final stages include a 2D overlay.

There is no general widget system yet. Existing primitives include drawing,
text, keyboard/mouse/touch/gamepad input, clipboard calls, and mobile virtual
controls. watchOS is a separate SwiftUI Canvas/SceneKit target and does not use
wgpu.

## Decision

Use egui as the game-facing GUI on BornEngine's wgpu targets. Expose Dear ImGui
as an optional developer UI on desktop native targets. TypeScript records typed
widget commands through the Perry FFI; Rust evaluates them inside each library's
normal immediate-mode frame and owns both contexts and renderers. Rust never
calls back into TypeScript to build a widget tree.

Widget responses are read by TypeScript during the next game update. This adds
one frame between an input event being processed by a UI widget and game logic
observing that widget's response. Stable numeric IDs identify widgets and their
responses across frames.

The proposed dependency pairing is egui/egui-wgpu 0.35 with wgpu 29, plus
imgui 0.12 and imgui-wgpu 0.28 with wgpu 29. The egui 0.35 workspace manifest
uses wgpu 29; egui 0.36 upgrades to wgpu 30. The imgui-wgpu compatibility table
lists 0.28.0 with wgpu 29 and imgui 0.12.

## Goals

- Give TypeScript games a production GUI API backed by egui.
- Give TypeScript developers a separate debug UI API backed by Dear ImGui.
- Expose the layout, widget, style, drawing, image, font, input, and response
  controls needed to build game menus and HUDs without Rust code.
- Support text editing with desktop keyboard input, browser composition/paste,
  and the native soft keyboard on iOS and Android.
- Keep Rust responsible for GPU resources, UI contexts, input translation, and
  rendering.
- Keep command and response traffic compatible with Perry's FFI rules.
- Use one public TypeScript API on native and Web wgpu targets.
- Let games query whether the UI currently wants pointer or keyboard input,
  while leaving existing gameplay input queries intact.

## Non-goals

- Replacing existing `shapes`, `text`, or mobile control APIs.
- Passing Rust closures, native pointers, or `egui`/`imgui` Rust objects to
  TypeScript.
- Implementing a SwiftUI adapter for watchOS in this change.
- Shipping Dear ImGui in ordinary game builds by default.
- Replacing the engine renderer or its existing 2D/3D frame paths.

## TypeScript API

Add a public `ui` module for egui and a distinct `debugUi` module for Dear
ImGui. Re-export them from the package root and add package subpath exports.
Games call the APIs from their existing frame callback; TypeScript closures,
if used for grouping layout code, execute in TypeScript and are never passed
across FFI.

The egui facade covers immediate-mode windows and panels, vertical/horizontal
layout, spacing and separators, labels and links, buttons, checkboxes, radio
buttons, sliders, drag values, text edits, combo/select controls, collapsible
sections, scroll areas, tabs, progress indicators, images, and custom painter
primitives. It also exposes window placement and sizing, style/visual controls,
fonts and texture registration, per-widget responses, and UI input-capture
queries.

The debug facade covers Dear ImGui windows and common widgets, debug drawing,
style controls, and built-in demo/metrics views. It remains independent of the
production egui context so games can toggle the debug overlay without changing
their game UI.

Widget calls use caller-provided stable numeric IDs. Click, changed, value,
focus, hover, and drag responses are exposed through typed return values or
response getters for the most recently completed frame. Value controls carry
their most recent result forward as the next frame's input so a delayed response
does not reset an actively edited value.

FFI carries numbers as numeric arguments and strings as whole string
arguments. It does not serialize a frame into JSON, CSV, or another packed text
format, and TypeScript does not parse per-frame text responses. Any variable
length drawing support uses typed scalar calls or a documented f64 scratch
buffer convention.

Illustrative usage (names and exact argument lists are finalized in the
implementation plan):

```ts
import { ui } from "@bornengine/engine/ui";

let volume = 0.8;

runGame(() => {
  ui.beginWindow(100, "Settings");
  volume = ui.sliderFloat(101, "Volume", volume, 0, 1);
  const apply = ui.button(102, "Apply");
  ui.endWindow();

  if (apply) saveSettings(volume);
});
```

`apply` and `volume` above reflect the preceding completed UI frame. The
TypeScript reference will make this timing explicit and show how to gate game
input with the UI's capture queries.

## Frame, input, and rendering flow

1. `beginDrawing` starts a game frame, resets the UI command buffers, and
   publishes a non-consuming input snapshot for the UI.
2. The TypeScript update callback queues egui and optional debugUi commands.
3. `endDrawing` translates the frame snapshot into each library's input
   events, evaluates the queued widgets, stores typed responses by widget ID,
   and submits UI paint output.
4. The next TypeScript update reads those responses and builds the next UI
   frame.

The UI input snapshot includes mouse position/buttons/deltas, scroll, keyboard
edges and modifiers, Unicode text input, and touch transitions. It is separate
from consumable game reads such as mouse wheel and typed-character polling, so
reading game input does not starve text editing or scrolling in the UI. Text
composition is passed as a whole text event. Focusing a text edit requests the
native soft keyboard on iOS and Android; Web uses DOM composition and paste
events. Copy and cut commands are returned as complete strings for the host's
existing clipboard bridge, and paste text enters the non-consuming UI snapshot.

The engine does not automatically swallow game input. It exposes egui's
`wantsPointerInput` and `wantsKeyboardInput` state so TypeScript can decide when
to suppress gameplay controls. The debugUi namespace exposes its own capture
state.

Render egui above game drawing in both renderer paths: after the 2D overlay in
the direct path, and after scene composition, post-processing, and the existing
2D overlay in the 3D path. Render Dear ImGui above egui when the debug feature is
enabled. Do not bake either UI into a render texture; widget responses still
update, but UI paint is submitted only for the window surface. UI coordinates
use logical points with the renderer's pixel scale; resize and scale changes
update the UI screen rectangle before frame evaluation.

The first implementation targets every wgpu platform, including Web. watchOS
reports the UI as unavailable and provides manifest-compatible stubs; a
watchOS UI requires a separate SwiftUI adapter. Dear ImGui is available only
in opt-in desktop native debug builds (macOS, Windows, and Linux); other
platforms keep FFI stubs so the TypeScript package links consistently.

## Rust and FFI structure

- Add a shared UI subsystem that owns egui state, the egui-wgpu renderer,
  queued commands, typed response storage, and input snapshots.
- Keep UI commands in a dedicated `ffi_core` section macro invoked by
  `define_core_ffi!`; use the macro for the native shared surface.
- Add explicit wasm-bindgen wrappers in `native/web` and route them through
  the existing JS FFI bridge. Web string arguments use the existing `_str`
  conversion path.
- Add every public FFI symbol to `package.json`'s Perry manifest and preserve
  symbol/arity parity, including feature-off and watchOS stubs.
- Gate Dear ImGui dependencies and renderer state behind a `debug-ui` Cargo
  feature. The feature is opt-in for desktop native builds.
- Keep UI work after user draw calls in the renderer frame lifecycle. It must
  not alter existing draw ordering, clear behavior, render-to-texture behavior,
  or the engine's existing input API.

## Acceptance criteria

- TypeScript can build a game HUD and settings window using egui without
  calling Rust directly or passing closures through FFI.
- TypeScript can build and toggle a Dear ImGui debug overlay in desktop debug
  builds.
- Widget interactions, text entry, scroll, touch, clipboard, and capture state
  work through the documented one-frame response model.
- Text edits can receive platform composition input and open/close the native
  soft keyboard on iOS and Android.
- Both overlays render above 2D-only games and 3D scenes at the correct logical
  scale.
- The same egui TypeScript API links on native and Web wgpu targets; unsupported
  targets report availability accurately and retain FFI parity.
- The MeuGame consumer can import and use the public UI API through its linked
  BornEngine package.

## Verification plan

Implementation verification will include native shared and desktop builds,
the Web wasm build, FFI manifest validation, and a visual smoke run of MeuGame
with both a 2D frame and a 3D scene. The UI should be checked at normal and
high-DPI scale, with keyboard/mouse input and touch on a mobile target.

## References

- [egui 0.35 workspace manifest](https://github.com/emilk/egui/blob/0.35.0/Cargo.toml)
- [egui-wgpu changelog](https://github.com/emilk/egui/blob/main/crates/egui-wgpu/CHANGELOG.md)
- [imgui-wgpu 0.28 compatibility table](https://github.com/Yatekii/imgui-wgpu-rs)
