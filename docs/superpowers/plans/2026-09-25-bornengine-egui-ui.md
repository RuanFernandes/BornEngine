# BornEngine egui UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add egui as BornEngine's game-facing GUI, controlled from TypeScript and rendered by the Rust wgpu backend.

**Architecture:** `EngineState` owns a typed command/response bridge and a per-frame non-consuming input snapshot. A Rust egui adapter evaluates TypeScript commands at frame end; `Renderer` submits egui-wgpu paint output above game drawing. The TypeScript facade uses stable widget IDs and reads the preceding frame's responses.

**Tech Stack:** Rust, wgpu 29, egui 0.35, egui-wgpu 0.35, Perry TypeScript FFI, wasm-bindgen, Web JS glue.

**Spec:** `docs/superpowers/specs/2026-09-25-bornengine-egui-imgui-design.md`

## Global Constraints

- Use egui/egui-wgpu 0.35 with wgpu 29.
- Rust evaluates TypeScript widget commands; Rust does not call back into TypeScript.
- TypeScript reads widget responses during the next game update.
- egui is supported on all wgpu platforms, including Web; watchOS reports unavailable and keeps manifest-compatible stubs.
- Carry FFI numbers as numbers and strings as whole strings; never parse a packed per-frame response string.
- Snapshot consumable input before the game callback so game reads do not starve UI input.
- Expose input-capture state without automatically suppressing gameplay input.
- Render UI on the window surface only; do not bake UI into render textures.
- Text edits support desktop keyboard input, Web composition/paste, and native iOS/Android soft keyboards.

## Review Focus

- A game polling the scroll wheel or typed-character queue must not remove those inputs from the UI snapshot. Pin this in Task 2's snapshot test.
- A press and release arriving within one frame must remain visible to egui. Pin this in Task 2's edge-transition test.
- Responses must be keyed by stable IDs, clear at the next UI frame, and default safely for missing IDs. Pin this in Task 1's bridge tests.
- Logical coordinates must remain aligned after a high-DPI resize. Cover this in Task 4's visual smoke run.
- UI paint must not enter an offscreen render texture or disappear from an ordinary surface frame. Cover both paths in Task 4's render smoke run.

---

### Task 1: Typed UI command and response bridge

**Files:**
- Create: `native/shared/src/ui/mod.rs`
- Create: `native/shared/src/ui/commands.rs`
- Create: `native/shared/src/ui/responses.rs`
- Create: `native/shared/src/ffi_core/ui.rs`
- Modify: `native/shared/src/lib.rs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/ffi_core/mod.rs`
- Modify: `package.json`
- Modify: `tools/validate-ffi.js`
- Regenerate: `native/watchos` FFI stubs from `package.json` if needed
- Test: unit tests in `native/shared/src/ui/commands.rs` and `responses.rs`

**Interfaces:**
- Produces: `UiBackend::{Egui, DearImGui}`, `UiOpcode`, `UiCommand`, and `UiResponse { clicked, changed, hovered, focused, dragged, value, text }`.
- Produces: `UiSystem::begin_frame()`, `queue_command`, `response`, `response_text`, and `publish_completed_responses`.
- Produces: `bloom_ui_command(backend, opcode, id, a, b, c, d, text) -> f64` (1 accepted, 0 invalid), backend-scoped `bloom_ui_scratch_reset(backend)`, `bloom_ui_scratch_push_f64(backend, value)`, and `bloom_ui_scratch_command(backend, opcode, id, count, text) -> f64` calls for variable-length painter data; `bloom_ui_inject_text(text)`, `bloom_ui_response(backend, id, field)`, `bloom_ui_response_text(backend, id)`, `bloom_ui_is_available(backend)`, and `bloom_ui_wants_input(backend, kind)`.
- Consumes: the platform `engine()` guard and existing Perry string-header helpers.

- [x] **Step 1: Add failing bridge tests.** Verify command ordering, response lookup by `(backend, id)`, missing-response defaults, and that completed responses remain readable through the next `begin_frame` and are replaced only after that frame is evaluated.

```rust
#[test]
fn completed_responses_survive_the_next_game_callback_then_replace() {
    let mut ui = UiSystem::default();
    ui.begin_frame();
    ui.publish_completed_responses(
        UiBackend::Egui,
        vec![(42, UiResponse { clicked: true, ..Default::default() })],
    );

    assert!(ui.response(UiBackend::Egui, 42).clicked);
    assert!(!ui.response(UiBackend::DearImGui, 42).clicked);

    // begin_frame runs before the TypeScript callback; preserve the last
    // completed response so that callback can read it.
    ui.begin_frame();
    assert!(ui.response(UiBackend::Egui, 42).clicked);

    // The response set is replaced only after the next UI evaluation.
    ui.publish_completed_responses(UiBackend::Egui, vec![]);
    assert!(!ui.response(UiBackend::Egui, 42).clicked);
}
```

- [x] **Step 2: Run the bridge tests and confirm they fail because the bridge types do not exist.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::responses::tests::completed_responses_survive_the_next_game_callback_then_replace`

Expected: compilation fails because `UiSystem` and `UiResponse` have not been implemented.

- [x] **Step 3: Implement the bridge and native FFI section.** Keep scalar command payloads as an opcode, stable numeric ID, four numeric values, and one complete string. Provide separate per-backend f64 scratch buffers for variable-length painter data, with reset, push, and submit calls. Store egui and Dear ImGui response maps independently. Define the numeric opcodes once in Rust and mirror them in the TypeScript facade in Task 7. Guard each native FFI entry through `ffi::guard`; decode incoming strings only with `str_from_header`; allocate any returned string with `alloc_perry_string`.

- [x] **Step 4: Declare the native symbols in `package.json` and extend `tools/validate-ffi.js`.** The validator must require the new shared-macro symbols on native platforms and confirm their arities match the manifest. Add a Rust test that an unknown opcode is rejected without panicking and that ordinary commands remain ordered.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::`

Expected: all bridge tests pass, including the missing-ID and unknown-opcode cases.

Run: `node tools/validate-ffi.js --native-only`

Expected: all native FFI declarations and manifest arities match. The full validator runs in Task 5 after Web wrappers are added.

### Task 2: Non-consuming input snapshots

**Files:**
- Modify: `native/shared/src/input.rs`
- Create: `native/shared/src/ui/input.rs`
- Modify: `native/shared/src/ui/mod.rs`
- Modify: `native/shared/src/engine.rs`
- Test: unit tests in `native/shared/src/input.rs` and `native/shared/src/ui/input.rs`

**Interfaces:**
- Consumes: `UiSystem::begin_frame` and `bloom_ui_inject_text` from Task 1.
- Produces: `InputState::ui_snapshot() -> UiInputSnapshot`, with pointer position/delta/button transitions, scroll, key edges/modifiers, whole Unicode text events, and touch transitions, without consuming game input.
- Produces: `UiSystem::set_input_snapshot(UiInputSnapshot)` to make the current input available after `begin_frame()` has reset commands.
- `UiInputSnapshot` stays renderer-independent and includes `pointer_position`, `pointer_delta`, `pointer_buttons: Vec<UiPointerButtonEvent>`, `scroll_x`, `scroll_y`, `keys: Vec<UiKeyEvent>`, `modifiers`, `text: Vec<String>`, and `touches: Vec<UiTouchEvent>`; each pointer-button event carries a stable button and pressed/released edge.
- Produces: `UiInputBridge`, which stages whole-string text events, merges them into snapshots, and records soft-keyboard focus transitions.

- [x] **Step 1: Add failing tests for scroll/text duplication and same-frame input edges.**

```rust
#[test]
fn ui_snapshot_keeps_scroll_and_text_after_game_consumes_them() {
    let mut input = InputState::new();
    input.accumulate_mouse_wheel(1.0);
    input.push_char('é' as u32);
    input.begin_frame();

    let snapshot = input.ui_snapshot();
    assert_eq!(snapshot.scroll_y, 1.0);
    assert_eq!(input.consume_mouse_wheel(), 1.0);
    assert_eq!(snapshot.text, vec!["é"]);
    assert_eq!(input.pop_char(), 'é' as u32);
}
```

Also test a touch slot pressed and released before `end_frame`; the snapshot must retain a release transition for that slot.

- [x] **Step 2: Run the input tests and confirm the UI snapshot API is missing.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d input::tests::ui_snapshot`

Expected: compilation fails because `UiInputSnapshot` and `InputState::ui_snapshot` are not defined.

- [x] **Step 3: Implement the snapshot.** Capture consumable wheel and character data after `InputState::begin_frame` and before the TypeScript callback. Convert queued codepoints to whole-string text events and merge strings staged by `bloom_ui_inject_text`. Keep the shared snapshot renderer-neutral; Task 3's egui adapter maps Bloom key and mouse IDs to egui events and tracks prior touch slots to synthesize start, move, and end transitions.

- [x] **Step 4: Connect snapshot and command lifecycles to `EngineState`.** `begin_frame_without_callbacks` must call `input.begin_frame`, call `ui.begin_frame()`, publish the non-consuming snapshot with `ui.set_input_snapshot(input.ui_snapshot())`, and then start renderer drawing. Keep that snapshot available through the TypeScript callback and UI evaluation. Tasks 3 and 4 connect evaluation, response replacement, and paint output to `end_frame`; preserve the previous completed response set for the current callback and clear deferred input transitions only after UI evaluation.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d input::tests::ui_snapshot`

Expected: both snapshot and transition tests pass without changing the results of the existing game input getters.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::input::tests`

Expected: whole-string injection is preserved and soft-keyboard requests are emitted only for focus changes.

### Task 3: egui command interpreter and responses

**Files:**
- Modify: `native/shared/Cargo.toml`
- Modify: `native/shared/src/ui/mod.rs`
- Create: `native/shared/src/ui/egui.rs`
- Test: unit tests in `native/shared/src/ui/egui.rs`

**Interfaces:**
- Consumes: `UiCommand`, `UiResponse`, and `UiInputSnapshot` from Tasks 1–2.
- Produces: `EguiUi::run_frame(commands, input, screen_rect: [f32; 4], dt) -> EguiFrameOutput`, with typed widget responses, egui shapes, texture deltas, and `wants_pointer_input` / `wants_keyboard_input` values.

- [x] **Step 1: Add a failing interaction test.** Feed a pointer move, press, and release inside a queued button; assert the produced response for its ID is clicked and the following frame returns that response to the bridge.

```rust
#[test]
fn button_response_is_published_after_the_frame_that_received_the_click() {
    let mut ui = EguiUi::default();
    let pos = [55.0, 62.0];
    let input = UiInputSnapshot {
        pointer_position: Some(pos),
        pointer_buttons: vec![
            UiPointerButtonEvent { button: 0, pressed: true },
            UiPointerButtonEvent { button: 0, pressed: false },
        ],
        ..Default::default()
    };
    let commands = [
        UiCommand::new(UiBackend::Egui, UiOpcode::SetWindowPosition, 100, [16.0, 16.0, 0.0, 0.0], ""),
        UiCommand::new(UiBackend::Egui, UiOpcode::BeginWindow, 100, [0.0; 4], "Continue"),
        UiCommand::new(UiBackend::Egui, UiOpcode::Button, 7, [0.0; 4], "Continue"),
        UiCommand::new(UiBackend::Egui, UiOpcode::EndWindow, 100, [0.0; 4], ""),
    ];
    let output = ui.run_frame(
        &commands,
        input,
        [0.0, 0.0, 320.0, 240.0],
        1.0 / 60.0,
    );

    assert!(output.response(7).clicked);
}
```

- [x] **Step 2: Run the egui interaction test and confirm `EguiUi` is missing.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::egui::tests::button_response_is_published_after_the_frame_that_received_the_click`

Expected: compilation fails because `EguiUi` is not defined.

- [x] **Step 3: Add egui 0.35 and interpret commands inside `Context::run_ui`.** Implement windows/panels, horizontal and vertical layout, text, links, common button/toggle/radio/slider/drag/text-edit/combo/scroll/tab/progress/image controls, custom painter primitives, style values, and window placement. Use numeric IDs for interactive widgets; return changed values and interaction flags in `EguiFrameOutput`. Store updated text values as whole strings.

- [x] **Step 4: Test interaction, value carry-forward, stale IDs, and capture flags.** Run the egui module tests.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::egui::`

Expected: the button, slider carry-forward, text-edit, and input-capture tests pass.

### Task 4: egui-wgpu rendering in both frame paths

**Files:**
- Modify: `native/shared/Cargo.toml`
- Modify: `native/shared/src/renderer/mod.rs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/ui/egui.rs`
- Update: `native/{macos,linux,windows,android,ios,tvos,visionos,web}/Cargo.lock`
- Test: renderer checks and MeuGame visual smoke

**Interfaces:**
- Consumes: `EguiFrameOutput` from Task 3.
- Produces: an egui-wgpu render pass after regular game drawing, with `LoadOp::Load`, surface format, logical screen size, and physical pixels-per-point; `should_render_ui(is_render_texture) -> bool` expresses the surface-only policy.

- [x] **Step 1: Add a failing pure test for the render-target policy.** Assert `should_render_ui(false) == true` for a surface frame and `should_render_ui(true) == false` for a render-texture frame.

```rust
#[test]
fn ui_paint_is_skipped_for_render_texture_frames() {
    assert!(should_render_ui(false));
    assert!(!should_render_ui(true));
}
```

- [x] **Step 2: Run the policy test and confirm the helper is missing.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d renderer::ui_tests::ui_paint_is_skipped_for_render_texture_frames`

Expected: compilation fails because `should_render_ui` is not defined.

- [x] **Step 3: Add egui-wgpu 0.35 and initialize its renderer with the engine device, queue, and final output format.** Consume texture deltas and tessellated primitives from `EguiFrameOutput`. Render after the direct 2D pass in `Renderer::end_frame`, and after the 3D composition, post-processing, and `overlay_2d` pass in `end_frame_with_scene`. Skip UI paint when the selected final target is a render texture. Submit/present the frame once, preserving the existing screenshot and profiler ordering.

- [x] **Step 4: Preserve logical sizing across resize and scale changes.** Rebuild the egui screen rectangle from `logical_width`/`logical_height`; calculate pixels-per-point from physical/logical dimensions; do not recreate the egui context on resize.

- [x] **Step 5: Compile the shared crate and Linux renderer.**

Run: `cargo check --manifest-path native/shared/Cargo.toml --no-default-features`

Expected: the shared library compiles with egui and wgpu 29.

Run: `cargo check --manifest-path native/linux/Cargo.toml --no-default-features --features models3d,image-extras`

Expected: the direct 2D and scene renderer paths compile with the egui pass.

### Task 5: Web FFI, text composition, clipboard, and touch input

**Files:**
- Create: `native/web/src/ui_ffi.rs`
- Modify: `native/web/src/lib.rs`
- Modify: `native/web/src/bloom_glue.js`
- Modify: `native/shared/src/ui/input.rs`
- Create: `native/web/tests/ui-input.test.mjs`

**Interfaces:**
- Consumes: the `bloom_ui_*` symbols from Task 1 and `UiInputSnapshot` from Task 2.
- Produces: wasm-bindgen wrappers with `_str` variants for every string-in command; browser composition/paste/touch events populate UI input without a Rust-to-TypeScript callback.

- [ ] **Step 1: Add failing JS tests for `compositionend`, paste text, and touch-slot start/move/end translation.** Use a small DOM-event adapter with injected FFI functions so the tests assert exact strings, slots, and event order.

```js
test('composition text is injected as a whole UI text event', () => {
  const calls = [];
  const adapter = createUiInputAdapter((name, value) => calls.push({ name, value }));
  adapter.dispatchCompositionEnd('東京');
  assert.deepEqual(calls, [{ name: 'bloom_ui_inject_text', value: '東京' }]);
});
```

- [ ] **Step 2: Run the Web adapter tests and confirm the event adapter does not exist.**

Run: `node --test native/web/tests/ui-input.test.mjs`

Expected: the module import fails because `makeUiInputAdapter` has not been implemented.

- [ ] **Step 3: Add the wasm-bindgen wrappers.** Route numeric-only calls directly to `EngineState`; implement `_str` wrappers for `bloom_ui_command` and `bloom_ui_inject_text`; return text response strings directly through wasm-bindgen. Register the module in `native/web/src/lib.rs`.

- [ ] **Step 4: Add browser composition, paste, and keyboard-focus listeners in `bloom_glue.js`.** Use a hidden DOM text input while egui requests text focus, forward composition and paste as whole strings through `bloom_ui_inject_text`, and hide it when focus ends. Keep existing stable touch-slot mapping and event order. Do not flatten event batches into text for Perry to split or parse.

- [ ] **Step 5: Run Web adapter tests and compile wasm.**

Run: `node --test native/web/tests/ui-input.test.mjs`

Expected: composition, paste, and touch-event tests pass.

Run: `cargo check --manifest-path native/web/Cargo.toml --target wasm32-unknown-unknown`

Expected: the egui backend, wrappers, and WebGL/WebGPU surface compile for wasm.

### Task 6: Native mobile text input and clipboard hooks

**Files:**
- Modify: `native/android/src/lib.rs`
- Modify: `native/ios/src/lib.rs`
- Modify: `native/tvos/src/lib.rs`
- Modify: `native/visionos/src/lib.rs`
- Modify: `native/shared/src/input.rs`
- Modify: `native/shared/src/ui/input.rs`
- Test: platform keyboard smoke checks

**Interfaces:**
- Consumes: `UiInputBridge::take_keyboard_request`, `bloom_ui_inject_text`, and existing native clipboard functions.
- Produces: focus-driven show/hide requests for the Android and iOS software keyboard; complete text-input events delivered to `UiInputSnapshot`.

- [ ] **Step 1: Add a failing shared state test.** When a text edit gains focus, mark soft-keyboard visibility requested; when focus leaves, mark it hidden. Repeated focus state must not enqueue duplicate native requests.

```rust
#[test]
fn soft_keyboard_request_changes_only_when_text_focus_changes() {
    let mut input = UiInputBridge::default();
    input.set_text_focus(true);
    input.set_text_focus(true);
    input.set_text_focus(false);

    assert_eq!(input.take_keyboard_requests(), vec![true, false]);
}
```

- [ ] **Step 2: Run the shared keyboard-state test and confirm it fails.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::input::tests::soft_keyboard_request_changes_only_when_text_focus_changes`

Expected: compilation fails because the focus request state is absent.

- [ ] **Step 3: Implement the focus transition queue and platform entry points.** On Android, connect the transition to the NativeActivity input-method bridge. On iOS, connect it to a focused UIKit text-input view. tvOS and visionOS continue to use their available hardware/remote keyboard events and do not request an onscreen keyboard unless their host explicitly supports one.

- [ ] **Step 4: Route text and clipboard data into the UI snapshot.** Native host input must preserve Unicode strings as complete events. Clipboard copy/cut requests go through the current platform clipboard implementation; paste is injected as a UI text event.

- [ ] **Step 5: Run the shared test and build the Android/iOS target crates available on the host.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::input::tests::soft_keyboard_request_changes_only_when_text_focus_changes`

Expected: only focus transitions generate keyboard requests.

### Task 7: Public TypeScript API and package surface

**Files:**
- Create: `src/ui/index.ts`
- Create: `src/ui/types.ts`
- Create: `src/ui/opcodes.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Test: `examples/ui-smoke/main.ts` via Perry compile

**Interfaces:**
- Consumes: native/Web FFI bridge from Tasks 1, 5, and 6.
- Produces: `@bornengine/engine/ui` exports for `beginWindow/endWindow`, panels and layout groups, labels/links, buttons/toggles/radios, slider/drag controls, text edits, combo/select/collapse/scroll/tab/progress widgets, images from registered engine texture handles, style/font registration, custom painter primitives, availability, capture queries, and stable `UiId`/`UiResponse` types.
- Widget helpers return values carried forward from the previous completed frame; `response(id)` exposes the full typed response. Painter calls with variable-length geometry use the documented per-backend f64 scratch bridge.

- [ ] **Step 1: Add a Perry consumer fixture with a failing import.** The fixture must compile a window with a label, button, slider, text edit, image, custom paint primitive, and `wantsPointerInput` query.

```ts
import { runGame } from "@bornengine/engine/core";
import { loadTexture } from "@bornengine/engine/textures";
import { ui } from "@bornengine/engine/ui";

let gain = 0.5;
let applyCount = 0;
let pointerSamples = 0;
const iconTexture = loadTexture("ui-icon.png");
runGame(() => {
  ui.beginWindow(100, "Settings");
  ui.label(106, "Audio");
  gain = ui.sliderFloat(101, "Gain", gain, 0, 1);
  const playerName = ui.textEditSingleline(103, "Player");
  const icon = ui.registerTexture(iconTexture);
  ui.image(104, icon, 32, 32);
  ui.paintRect(105, 8, 8, 80, 24, { r: 0.2, g: 0.3, b: 0.4, a: 1 });
  const applyPressed = ui.button(102, "Apply");
  ui.endWindow();
  if (applyPressed && playerName.length > 0) applyCount += 1;
  if (!ui.wantsPointerInput()) pointerSamples += 1;
});
```

- [ ] **Step 2: Compile the fixture and confirm the new module import fails.**

Run: `perry compile examples/ui-smoke/main.ts`

Expected: Perry reports that `@bornengine/engine/ui` is not exported.

- [ ] **Step 3: Implement the typed facade.** Mirror the Rust `UiOpcode` values in `opcodes.ts`. Each widget queues its command and reads its typed response by backend and stable ID. Include the documented widgets, style controls, fonts/textures, custom painter calls, `isAvailable`, `wantsPointerInput`, and `wantsKeyboardInput`.

- [ ] **Step 4: Export the subpath and root API.** Update `package.json` exports, `src/index.ts`, and Perry FFI declarations. Add compile-time checks that every exported FFI function has a matching manifest entry.

- [ ] **Step 5: Compile the fixture.**

Run: `perry compile examples/ui-smoke/main.ts`

Expected: the sample imports and links all egui functions without undeclared-FFI warnings.

### Task 8: API documentation and consumer smoke run

**Files:**
- Create: `docs/api/ui.md`
- Create: `examples/ui-smoke/package.json`
- Modify: `examples/ui-smoke/main.ts`
- Update: all platform `Cargo.lock` files changed by egui
- Verify: `tools/validate-ffi.js`, native/Web builds, and a disposable copy of `MeuGame`

**Interfaces:**
- Consumes: public UI API from Task 7.
- Produces: a documented example of delayed responses, stable IDs, text input, capture queries, 2D HUDs, 3D overlays, and UI availability per platform.

- [ ] **Step 1: Document the frame timing and platform behavior.** Include a button example showing that its response is read in the next update, an input-capture example, text input/soft-keyboard guidance, and the watchOS availability check.

- [ ] **Step 2: Build the smoke fixture against this worktree.** Compile its native and Web targets and run `node tools/validate-ffi.js`.

Run: `node tools/validate-ffi.js`

Expected: the command and response symbols match across native crates and the Perry manifest.

- [ ] **Step 3: Run the fixture and a disposable copy of `MeuGame`.** Exercise direct 2D mode, a 3D scene, high-DPI resize, button/slider/text-edit input, clipboard, touch, and a render-texture frame. Confirm UI renders over the window surface and is absent from the offscreen texture.

- [ ] **Step 4: Compile the final supported targets.**

Run: `cargo check --manifest-path native/shared/Cargo.toml --no-default-features`

Expected: shared UI and renderer compile.

Run: `cargo check --manifest-path native/linux/Cargo.toml`

Expected: native desktop FFI and both render paths compile.

Run: `cargo check --manifest-path native/web/Cargo.toml --target wasm32-unknown-unknown`

Expected: Web wgpu UI and browser wrappers compile.
