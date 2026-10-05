# Retained GUI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a retained, extensible GUI tree for BornEngine with broad Graal-inspired 2D control coverage, egui rendering, and complete website/repository documentation.

**Architecture:** TypeScript owns `GUI` instances, parent-child relationships, geometry, profiles, subclass hooks, and frame-to-frame event delivery through `game.gui`. A typed native bridge sends retained control commands to the existing Rust egui evaluator; it shares the same egui context and surface as `game.ui`, while Rust owns hit testing, native input, paint, and response capture. The existing immediate API stays intact, and watchOS exposes link-compatible unavailable stubs.

**Tech Stack:** TypeScript compiled by Perry, Rust, egui/egui-wgpu already in BornEngine, Perry native FFI, wasm-bindgen Web wrappers, Node test harnesses, Astro website docs.

**Spec:** `docs/superpowers/specs/2026-10-05-retained-gui-system-design.md`

## Global Constraints

- `GUI` is a concrete base class as well as the common container/control type.
- Controls are constructed independently of `Game`.
- `x` and `y` are logical-pixel offsets relative to the parent content origin.
- `center()` centers on both axes in the parent; `centerHorizontal()` and `centerVertical()` select one axis.
- Native responses are read on the next update, consistent with `game.ui`.
- The native bridge carries typed numeric arguments and whole strings through bounded FFI calls. It does not serialize a tree or per-frame style/event payload as JSON.
- The retained GUI works on the same targets as the existing egui `game.ui` backend.
- It does **not work on watchOS in the current release**: controls do not render there and GUI input/events are unavailable.
- This watchOS limitation is temporary. A dedicated SwiftUI adapter is planned for future work, with no delivery date promised.
- Existing `game.ui` remains supported and the developer inspector stays above player UI when enabled.

## Review Focus

- Center anchors must reflow after parent/viewport resize, and `setX`/`setY` must clear only their own axis. Pin with the nested-centering and anchor-reset tests in Task 1.
- Cycles, already-parented controls, and cross-game reparenting must fail without damaging either tree. Pin with the ownership tests in Task 1.
- A native response must dispatch once before the next `Game.loop`, bubble to ancestors, and stop after `stopPropagation`; hidden/detached controls must not receive stale events. Pin with Task 1 and Task 7 frame tests.
- Text edits and sliders must carry their latest value through the one-frame response delay, including when siblings reorder but controls keep identity. Pin with the response-carry-forward and stable-ID tests in Tasks 5–6.
- watchOS must link the same public API, report unavailable, and dispatch no GUI events or paint. Pin with Task 5 FFI checks and Task 7 availability tests.

---

### Task 1: Retained tree, geometry, lifecycle, and event model

**Files:**
- Create: `src/gui/types.ts`
- Create: `src/gui/layout.ts`
- Create: `src/gui/events.ts`
- Create: `src/gui/gui.ts`
- Create: `src/gui/manager.ts`
- Create: `src/gui/index.ts`
- Test: `tests/gui-api.test.mjs`

**Interfaces:**
- Produces `GUI`, `GUIManager`, `GuiPoint`, `GuiSize`, `GuiRect`, `GUIControlOptions`, and `GUIEvent`. `GUIControlOptions` accepts optional `x`, `y`, `width`, `height`, `visible`, `active`, `clipChildren`, and `clipToBounds`; every control constructor defaults it to `{}`.
- Each `GUI` receives a stable numeric `id` at construction from the process-wide range `1..=0xffffffff`; IDs are monotonic, never wrap/reuse, and do not depend on sibling order. Construction throws when the range is exhausted.
- All controls and containers have an optional `GUIControlOptions` constructor argument and can be created with no arguments. `GUI` exposes read-only `parent` and `getControls()`, plus `getParent()`, `getRoot()`, `getX()/setX(x)`, `getY()/setY(y)`, `getWidth()/setWidth(width)`, `getHeight()/setHeight(height)`, `getPosition()/setPosition(x, y)`, `getSize()/setSize(width, height)`, `resize(x, y, width, height)`, `center()`, `centerHorizontal()`, `centerVertical()`, `localToGlobal(point)`, `globalToLocal(point)`, `addControl(control)`, `removeControl(control)`, `clearControls()`, `isVisible()/setVisible(value)`, `isActive()/setActive(value)`, `show()`, `hide()`, `setClipChildren(value)`, `setClipToBounds(value)`, `getMinimumSize()/setMinimumSize(width, height)`, `getHint()/setHint(text)`, `getCursor()/setCursor(cursor)`, `focus()`, `blur()`, `isFocused()`, `makeFirstResponder(enabled = true)`, `isFirstResponder()`, `tabFirst()`, `bringToFront()`, `pushToBack()`, and `destroy()`.
- Geometry setters return `this`; `addControl` returns the attached child. Parent and child arrays have no writable public setter.
- `GUIManager` is constructed with its owning `Game`; it exposes the same root collection operations plus `updateFrame(deltaTime)`, `renderFrame()`, `isAvailable()`, `wantsPointerInput()`, and `wantsKeyboardInput()`; Game lifecycle wiring is deferred to Task 7.
- `GUIEvent` carries numeric `type`, `target`, `currentTarget`, optional local/global pointer coordinates, optional key/button/wheel values, and `stopPropagation()`. `GUIEventType` assigns stable codes for action/change, focus/blur, pointer enter/leave/move/down/up/drag, wheel, and key down/up.
- Protected hooks use typed event arguments: `onAdd`, `onRemove`, `onShow`, `onHide`, `onWake`, `onSleep`, `onMove`, `onResize`, `onAction`, `onChange`, `onFocus`, `onBlur`, pointer enter/leave/move/down/up/drag, wheel, and key down/up.

- [ ] **Step 1: Add failing Node tests.** Use the existing Node TypeScript hook pattern from `tests/ui-api.test.mjs`. Add `GUI.center_uses_parent_content_bounds_and_reflows_after_resize`, `GUI.ids_stay_stable_after_reordering_and_never_wrap`, `GUI.setX_clears_only_horizontal_center_anchor`, `GUI.rejects_cycles_and_cross_game_reparenting`, `GUI.events_bubble_and_stop_at_current_target`, and `GUI.focus_clears_when_subtree_is_detached`.

Run: `node --test tests/gui-api.test.mjs`

Expected: FAIL because `src/gui/` does not exist.

- [ ] **Step 2: Implement geometry and tree ownership.** Reject non-finite positions and non-finite/negative sizes with `RangeError`; compute centered positions from parent content bounds; preserve an anchor through resize; clear only the affected anchor in `setX`/`setY`; invoke move/resize hooks once per actual change; reject cycles and reparenting without detaching the existing owner.

- [ ] **Step 3: Implement visibility, focus state, z-order, lifecycle, and bubbling.** Dispatch lifecycle hooks once per transition; traverse from target to root for events; stop traversal when `stopPropagation()` is called; suppress hooks for hidden, detached, inactive, or destroyed nodes.

- [ ] **Step 4: Run the focused tests.**

Run: `node --test tests/gui-api.test.mjs`

Expected: the geometry, ownership, and event tests pass; no native FFI call is required by pure tree operations.

- [ ] **Step 5: Commit the tree API.**

```bash
git add src/gui tests/gui-api.test.mjs
git commit -m "feat: add retained GUI tree"
```

### Task 2: Profiles and typed control command model

**Files:**
- Create: `src/gui/profile.ts`
- Create: `src/gui/commands.ts`
- Modify: `src/gui/types.ts`
- Modify: `src/gui/gui.ts`
- Modify: `src/gui/index.ts`
- Modify: `src/index.ts`
- Modify: `package.json` (`exports["./gui"]`)
- Test: `tests/gui-api.test.mjs`

**Interfaces:**
- Produces `GuiProfile`, `GuiProfileOptions`, and static `GUIProfiles.get(name): GuiProfile`, `GUIProfiles.register(name, profile): void`, and `GUIProfiles.clone(name): GuiProfile`. Unknown and duplicate names throw. `GUI.getProfile()/setProfile(profile)` expose the assigned style; `GUI.setOwnProfile()` assigns a deep clone and returns it for customization.
- `GuiProfile` stores typed normal/hover/disabled colors, text/selection colors, font/alignment/spacing, border, opacity, `Texture | null` background, shadow, focus/modality, cursor, and optional button sounds; `clone()` copies nested values.
- Produces `GuiControlKind` constants and `GuiControlCommand { kind, id, rect, clip, profile, values, text }`. `GUI._emitCommands(commands, inheritedProfile, clip)` is the internal overridable renderer hook; each command carries its stable `GUI.id`, resolved logical bounds, clip, and profile snapshot.
- `GUIProfiles` seeds default, text, button, window, scroll, checkbox, radio, popup, slider, progress, tree/list, and blue profile variants. Controls may share a registered profile; `setOwnProfile()` deep-clones the assigned or default profile.
- Re-export profile and command types from `src/gui/index.ts` and `src/index.ts`; add `"./gui": "./src/gui/index.ts"` without changing `"./ui"`.

- [ ] **Step 1: Add failing profile and command-model tests.** Extend `tests/gui-api.test.mjs` with `GUIProfiles.clone_is_independent_of_registered_profile`, `GUIProfiles.rejects_duplicate_names`, `GUI.setOwnProfile_assigns_and_returns_clone`, and `GUI._emitCommands_keeps_stable_id_bounds_clip_and_profile`.

Run: `node --test tests/gui-api.test.mjs`

Expected: FAIL because profiles and typed control commands are not implemented.

- [ ] **Step 2: Implement `GuiProfile` and `GUIProfiles`.** Clone nested color/font/border values by value; reject duplicate registration and unknown lookup; seed the built-in default, control-family, and blue profile names.

- [ ] **Step 3: Implement `GuiControlKind`, `GuiControlCommand`, and profile snapshots.** Add `_emitCommands` to `GUI`; preserve stable IDs, resolved bounds, clip rectangles, inherited profile scope, scalar values, and whole strings in typed in-memory records.

- [ ] **Step 4: Export profiles and command types.** Re-export the new APIs through `src/gui/index.ts` and `src/index.ts`; add `"./gui": "./src/gui/index.ts"` to `package.json` without changing `"./ui"`.

- [ ] **Step 5: Run focused model tests.**

Run: `node --test tests/gui-api.test.mjs`

Expected: duplicate registration fails predictably; clones are isolated; typed commands keep stable identity and inherited layout/style data.

- [ ] **Step 6: Commit the profile and command model.**

```bash
git add src/gui src/index.ts package.json tests/gui-api.test.mjs
git commit -m "feat: add GUI profiles and command model"
```

### Task 3: Layout, button, text, and value controls

**Files:**
- Create: `src/gui/controls/layout.ts`
- Create: `src/gui/controls/buttons.ts`
- Create: `src/gui/controls/text.ts`
- Create: `src/gui/controls/value.ts`
- Create: `src/gui/controls/index.ts`
- Modify: `src/gui/index.ts`
- Test: `tests/gui-api.test.mjs`

**Interfaces:**
- Produces `GuiWindow`, `GuiPanel`, `GuiScroll`, `GuiBitmapBorder`, `GuiStretch`, `GuiFrameSet`, abstract `GuiButtonBase`, `GuiButton`, `GuiCheckBox`, `GuiRadioButton`, `GuiBitmapButton`, `GuiText`, `GuiMLText`, `GuiTextEdit`, `GuiMLTextEdit`, `GuiTextEditSlider`, and `GuiSlider`.
- Text controls expose `getText()/setText(text)`; `GuiTextEdit` and `GuiMLTextEdit` also expose `selectAll()`, `clear()`, `setMaxLength(n)`, `setPassword(enabled)`, and `setNumbersOnly(enabled)`.
- Value controls expose typed `getValue()/setValue(value)` and `onChange`; checkbox/radio values are `boolean`, slider/text-edit-slider values are `number`. `GuiRadioButton.setGroup(groupId)` enforces one selected control per sibling group.
- `GuiWindow` exposes `getTitle()/setTitle(title)`, `setMovable(enabled)`, `setResizable(enabled)`, and `setClosable(enabled)`. `GuiBitmapButton.setTextures({ normal, hover, pressed, disabled })` accepts `Texture | null` states. `GuiScroll` exposes `setHorizontalScrollBarMode(mode)`, `setVerticalScrollBarMode(mode)`, and `setScrollBarThickness(pixels)`, with mode `'alwaysOn' | 'alwaysOff' | 'dynamic'`. `GuiFrameSet` exposes `setColumnCount(n)`, `setRowCount(n)`, and `setSplitterWidth(pixels)`. `GuiStretch` exposes `setClientSize(width, height)`. `GuiBitmapBorder` exposes `setTiled(enabled)`.

- [ ] **Step 1: Add failing family tests.** Add `GuiScroll.clips_children_to_its_viewport`, `GuiRadioButton.enforces_one_selection_per_group`, `GuiTextEdit.applies_length_password_and_numeric_options`, and `GuiSlider.clamps_and_preserves_value_by_control_id`.

Run: `node --test tests/gui-api.test.mjs`

Expected: FAIL because these control families do not exist.

- [ ] **Step 2: Implement layout controls.** Emit container/window/scroll/frameset command scopes; children inherit the resolved content origin and clip; setters update typed command data.

- [ ] **Step 3: Implement button and value controls.** Add action/change hooks and typed values; ensure a pending native value does not overwrite a newer explicit TypeScript `setValue` call.

- [ ] **Step 4: Implement single/multiline text and text-edit-slider controls.** Preserve whole strings, limits, password/numbers-only modes, selection, and range/value state in command records.

- [ ] **Step 5: Run API tests.**

Run: `node --test tests/gui-api.test.mjs`

Expected: inheritance, clipping, value validation, and text options pass.

- [ ] **Step 6: Commit layout and input controls.**

```bash
git add src/gui/controls src/gui/index.ts tests/gui-api.test.mjs
git commit -m "feat: add GUI layout and input controls"
```

### Task 4: Selection, display, and custom drawing controls

**Files:**
- Create: `src/gui/controls/selection.ts`
- Create: `src/gui/controls/display.ts`
- Modify: `src/gui/controls/index.ts`
- Modify: `src/gui/index.ts`
- Create: `tests/game-runtime/gui-api-types.ts`
- Test: `tests/gui-api.test.mjs`

**Interfaces:**
- Produces abstract `GuiArray`; `GuiPopUpMenu`, `GuiPopUpEdit`, `GuiTreeView`, `GuiTextList`, `GuiTab`, `GuiMenu`, `GuiContextMenu`, `GuiBitmap`, `GuiShowImg`, `GuiProgress`, and `GuiDrawingPanel`.
- `GuiTreeView` exposes `addNode(label, value?)`, `addNodeByPath(path, value?)`, `clearNodes()`, `getSelected()`, and `getSelectedPath()`. `GuiPopUpMenu` exposes `add(label, id)`, `clear()`, `setSelected(id)`, `getSelected()`, and `getSelectedText()`.
- `GuiTab` exposes `addTab(label, id)`, `setSelected(id)`, and `getSelected()`. `GuiTextList` exposes `addRow(id, text)`, `removeRow(id)`, `clearRows()`, and `getSelected()`.
- `GuiBitmap` and `GuiShowImg` accept a game-owned `Texture` through `setTexture(texture)` and typed tint/opacity/rotation/zoom setters. `GuiBitmapButton.setTextures({ normal, hover, pressed, disabled })` accepts `Texture | null` for each state.
- `GuiDrawingPanel` exposes typed `drawLine`, `drawRect`, `drawCircle`, `drawText`, `drawImage`, `drawPolyline`, `drawPolygon`, and `clearDrawing`; `GuiProgress.setValue(value)` clamps to `[0, 1]`.

- [ ] **Step 1: Add failing selection/display tests.** Add `every_documented_gui_class_extends_GUI`, `GuiBitmapButton_keeps_normal_hover_pressed_and_disabled_textures`, and `GuiPopUpMenu.preserves_selected_id_and_text`, `GuiTreeView.addNodeByPath_builds_and_selects_path`, `GuiTab.selects_one_child_page`, `GuiTextList.selects_rows_by_id`, `GuiPopUpEdit.preserves_typed_editable_text`, `GuiContextMenu.opens_on_secondary_click_and_bubbles_action`, `GuiProgress.clamps_to_unit_interval`, and `GuiDrawingPanel.preserves_typed_primitives_and_clear_order`.

Run: `node --test tests/gui-api.test.mjs`

Expected: FAIL because these control families do not exist.

- [ ] **Step 2: Implement array, popup, tree, tab, menu, and text-list controls.** Keep item IDs stable, selection typed, path parsing bounded, and menu callbacks in TypeScript.

- [ ] **Step 3: Implement bitmap/image/progress and drawing-panel controls.** Validate texture ownership at attachment/render time; preserve primitive order and require drawing commands to remain clipped by the panel.

- [ ] **Step 4: Export every control and compile the public API fixture.** Add root and `@bornengine/engine/gui` imports for `GUI`, `GuiScroll`, `GuiTreeView`, `GuiProfile`, and `GUIProfiles`; assert subclassing and method signatures in `tests/game-runtime/gui-api-types.ts`.

Run: `node --test tests/gui-api.test.mjs`

Expected: all control families extend `GUI`; item selection, texture setters, progress clamping, and drawing order pass.

Run: `perry compile tests/game-runtime/gui-api-types.ts -o /tmp/bornengine-gui-api-check --no-link`

Expected: the public API fixture compiles using root and GUI subpath imports.

- [ ] **Step 5: Commit selection and display controls.**

```bash
git add src/gui/controls src/gui/index.ts tests/gui-api.test.mjs tests/game-runtime/gui-api-types.ts
git commit -m "feat: add GUI selection and display controls"
```

### Task 5: Typed Rust command, response, and event bridge

**Files:**
- Create: `src/gui/opcodes.ts`
- Create: `src/gui/native-bridge.ts`
- Modify: `src/gui/commands.ts`
- Modify: `src/gui/manager.ts`
- Test: `tests/gui-api.test.mjs`
- Create: `native/shared/src/gui/mod.rs`
- Create: `native/shared/src/gui/commands.rs`
- Create: `native/shared/src/gui/responses.rs`
- Create: `native/shared/src/ffi_core/gui.rs`
- Create: `native/web/src/gui_ffi.rs`
- Modify: `native/shared/src/lib.rs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/ffi_core/mod.rs`
- Modify: `native/web/src/lib.rs`
- Modify: `native/watchos/src/ffi_stubs.rs`
- Modify: `package.json` Perry FFI declarations
- Modify: `tools/validate-ffi.js`
- Test: unit tests in `native/shared/src/gui/commands.rs` and `responses.rs`

**Interfaces:**
- Produces `GuiOpcode`, `GuiCommand { opcode, id, args: [f64; 4], text }`, `GuiResponse`, and `GuiEventRecord` with stable GUI-domain IDs.
- `GuiEventField` assigns stable numeric fields for event type, control ID, global/local coordinates, key/button/wheel code, and modifiers; Rust and TypeScript use the same constants. `GUIEventType`, `GuiOpcode`, and `GuiEventField` are mirrored in `src/gui/opcodes.ts`.
- Produces `bloom_gui_command(opcode, id, a, b, c, d, text) -> f64`, `bloom_gui_scratch_reset()`, `bloom_gui_scratch_push_f64(value)`, `bloom_gui_scratch_command(opcode, id, count, text) -> f64`, `bloom_gui_response(id, field) -> f64`, `bloom_gui_response_text(id) -> string`, `bloom_gui_event_count() -> f64`, `bloom_gui_event_field(index, field) -> f64`, `bloom_gui_is_available() -> f64`, and `bloom_gui_wants_input(kind) -> f64`.
- Native GUI commands and responses remain separately namespaced from `game.ui`, then join the existing egui evaluation path in Task 6. Web wrappers convert whole strings with wasm-bindgen; watchOS stubs return unavailable/empty values and accept no-op commands.
- The shared FFI macro supplies desktop/mobile native exports; Web wrappers and manual watchOS stubs preserve the same manifest signatures.

- [ ] **Step 1: Add failing Rust bridge tests.** Add `gui_command_rejects_invalid_opcode_and_non_finite_geometry`, `gui_response_map_isolated_from_immediate_ui_ids`, `gui_response_snapshot_keeps_text_and_slider_values_until_next_update`, `gui_event_records_preserve_frame_order`, and `missing_gui_responses_return_defaults`. In `tests/gui-api.test.mjs`, add `gui_manager_encodes_typed_commands_and_reads_GUI_domain_responses` with mocked FFI functions and `gui_opcodes_match_native_rust_constants` by reading the Rust and TypeScript constants.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d gui::`

Expected: FAIL because the retained GUI bridge does not exist.

- [ ] **Step 2: Implement bounded command and response storage.** Validate opcode, unsigned 32-bit ID, finite numeric bounds, and scratch length before queueing; reuse the existing UI limits of 16,384 queued commands and 1,048,576 f64 scratch values per frame. Replace a completed response/event set atomically after evaluation so TypeScript can consume it on the following update.

- [ ] **Step 3: Add shared native, Web, and watchOS FFI implementations.** Decode/allocate strings only through the existing Perry string-header helpers; wrap shared calls in `ffi::guard`; keep Web and watchOS signatures identical to `package.json`.

- [ ] **Step 4: Declare the symbols and enforce parity.** Add every `bloom_gui_*` signature to `package.json` and require it in `tools/validate-ffi.js` for the shared macro, Web module, and watchOS stub.

Run: `node tools/validate-ffi.js`

Expected: every retained GUI symbol and signature matches the package manifest, Web wrapper, shared macro, and watchOS stub.

- [ ] **Step 5: Run bridge tests and FFI validation.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d gui::`

Expected: invalid payloads are rejected, response namespaces stay separate, text/slider responses remain readable through the next update, and events retain order.

- [ ] **Step 6: Commit the bridge.**

```bash
git add native/shared/src/gui native/shared/src/ffi_core native/shared/src/lib.rs native/shared/src/engine.rs native/web/src/gui_ffi.rs native/web/src/lib.rs native/watchos/src/ffi_stubs.rs package.json tools/validate-ffi.js
git commit -m "feat: add retained GUI FFI bridge"
```

### Task 6: egui control evaluation, rendering, and response capture

**Files:**
- Modify: `native/shared/src/ui/egui.rs`
- Modify: `native/shared/src/ui/mod.rs`
- Modify: `native/shared/src/gui/mod.rs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/renderer/ui_pass.rs`
- Test: unit tests in `native/shared/src/ui/egui.rs` and `native/shared/src/renderer/ui_pass.rs`

**Interfaces:**
- Produces `EguiUi::run_frame(ui_commands, gui_commands, input_snapshot, screen_rect, pixels_per_point, dt)` returning existing `game.ui` responses/paint plus a distinct retained-GUI response/event set.
- One `egui::Context` evaluates both streams. Immediate `game.ui` commands keep their current order and IDs; retained GUI commands use their separate domain and resolved logical-pixel bounds. The same paint output is submitted after both direct-2D and scene/3D game draws. The inspector remains the final UI layer.
- Profile scopes apply to a control's own widget and descendants; child clipping intersects parent and viewport clip rectangles. Scroll, popup, tab, tree/list, and custom drawing commands use egui layout/widgets/painter equivalents.

- [ ] **Step 1: Add failing egui tests.** Add `retained_control_uses_absolute_parent_relative_bounds`, `nested_clip_intersects_parent_and_viewport`, `profile_scope_is_restored_after_children`, `scroll_area_keeps_scroll_state_by_stable_id`, `reordering_controls_preserves_stable_id_widget_state`, `text_edit_retains_latest_native_value_until_applied`, `native_value_is_returned_for_next_frame`, `capture_flags_follow_focused_edit_and_hovered_controls`, and `retained_gui_paint_is_submitted_in_direct_2d_and_scene_3d_paths`.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::egui::`

Expected: FAIL because egui does not evaluate the retained command stream.

- [ ] **Step 2: Merge the retained commands into the existing egui frame.** Use resolved rectangles for placement and clipping; retain widget state by namespaced IDs; capture click/change/hover/focus/drag, text/value, pointer/key/wheel events, and input-capture state.

- [ ] **Step 3: Implement profile scopes and every control kind.** Map all Task 3–4 control kinds to egui widgets or painter output; preserve current `game.ui` behavior and ensure `GuiDrawingPanel` primitives are clipped and ordered with their owner.

- [ ] **Step 4: Publish completed GUI responses and events without delaying `game.ui`.** Replace the retained response/event snapshot only after egui evaluation; response values are available to TypeScript on the next update.

- [ ] **Step 5: Run egui and bridge tests.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::egui::`

Expected: bounds, clipping, profile restoration, scrolling, stable-ID state after reordering, text/value carry-forward, responses, painter output, and 2D/3D surface pass submission pass.

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d gui::`

Expected: command/response/event storage remains correct through a rendered frame.

- [ ] **Step 6: Commit egui evaluation.**

```bash
git add native/shared/src/ui native/shared/src/gui native/shared/src/engine.rs native/shared/src/renderer/ui_pass.rs
git commit -m "feat: render retained GUI controls with egui"
```

### Task 7: Game lifecycle, frame order, and platform availability

**Files:**
- Modify: `src/core/game.ts`
- Modify: `src/gui/manager.ts`
- Modify: `tests/game-runtime/game-lifecycle-harness.cjs`
- Create: `tests/game-runtime/gui-frame-harness.cjs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/gui/mod.rs`
- Test: `tests/game-runtime/gui-frame-harness.cjs`

**Interfaces:**
- Produces public `readonly game.gui: GUIManager`; the constructor creates it, context disposal releases it, and embedded activation registers its frame service.
- `GUIManager` implements the existing `ContextFrameService` contract. `updateFrame(deltaTime)` consumes previous responses/events before `Game.loop`; `renderFrame()` lays out and enqueues commands after `Game.render` and before `GameInspector.render`.
- `GUIManager` receives its owning `Game` internally. Before emission, it checks every control/profile texture against the owning Game and `isLoaded`; it omits image commands for foreign or unloaded textures, then calls the existing `game.ui.registerTexture(texture)` for valid textures so both APIs use the same egui texture registry. `game.gui.isAvailable()` delegates to `bloom_gui_is_available`; `wantsPointerInput()` and `wantsKeyboardInput()` read the retained egui capture state. Unsupported watchOS returns `false` and queues no render or event work.

- [ ] **Step 1: Add failing lifecycle tests.** Add `gui_responses_dispatch_before_loop_and_commands_after_render`, `gui_event_bubbles_once_on_next_frame`, `removed_or_hidden_subtree_drops_stale_responses`, `gui_manager_disposes_with_game`, `watchos_gui_reports_unavailable`, and `gui_does_not_emit_image_for_foreign_or_unloaded_texture`.

Run: `node tests/game-runtime/gui-frame-harness.cjs`

Expected: FAIL because `Game` has no `gui` manager or retained frame phase.

- [ ] **Step 2: Integrate the GUI manager with context ownership and frame phases.** Register it with the same ready/embedded activation and disposal behavior as existing Game services; consume responses before loop and enqueue the tree after render.

- [ ] **Step 3: Keep immediate UI and inspector ordering stable.** Test a frame containing both `game.ui` and `game.gui`; retain their separate IDs and ensure the inspector remains above both.

- [ ] **Step 4: Verify watchOS behavior and public availability.** Ensure the watchOS stub returns zero for availability/capture and empty responses/events; no TypeScript event hook is called when unavailable.

- [ ] **Step 5: Run lifecycle tests and engine runtime harness.**

Run: `node tests/game-runtime/gui-frame-harness.cjs`

Expected: response timing, ordering, stale-response clearing, disposal, and platform gating pass.

Run: `npm run test:runtime`

Expected: existing Game lifecycle and runtime service contracts remain green.

- [ ] **Step 6: Commit Game integration.**

```bash
git add src/core/game.ts src/gui/manager.ts tests/game-runtime/game-lifecycle-harness.cjs tests/game-runtime/gui-frame-harness.cjs native/shared/src/engine.rs native/shared/src/gui/mod.rs
git commit -m "feat: integrate retained GUI with game frames"
```

### Task 8: Website and repository documentation

**Files:**
- Create: `webpage/src/content/docs/api/gui.md`
- Create: `webpage/src/content/docs/guides/gui-controls.md`
- Create: `docs/api/gui.md`
- Create: `docs/guides/gui-controls.md`
- Modify: `webpage/src/content/docs/api/index.md`
- Modify: `webpage/src/content/docs/api/ui.md`
- Modify: `webpage/src/content/docs/api/debug-ui.md`
- Modify: `webpage/src/content/docs/guides/audio-and-ui.md`
- Modify: `webpage/src/content/docs/platforms/apple.md`
- Modify: `webpage/src/data/navigation.ts`
- Modify: `docs/api/ui.md`
- Modify: `docs/watchos-target.md`
- Create: `webpage/tests/gui-docs.test.mjs`

**Interfaces:**
- Website API reference documents `GUI`, `game.gui`, all controls, profiles, helpers, events, focus, availability, and coexistence with `game.ui`.
- Website guide shows a subclassed scroll panel with nested controls, event bubbling, profile cloning, audio feedback, and the one-frame response model.
- Repository docs mirror the GUI API/guide. The Apple platform page, GUI pages, and `docs/watchos-target.md` explicitly state that GUI controls do not work on watchOS currently, the limitation is temporary, and a future SwiftUI adapter is planned without a date promise.

- [ ] **Step 1: Add failing docs contract tests.** Add assertions for new navigation entries, exact watchOS wording and future-adapter mention across required pages, API coverage for every public control, and links between the immediate and retained APIs.

Run: `node --test webpage/tests/gui-docs.test.mjs`

Expected: FAIL because the GUI docs and navigation entries do not exist.

- [ ] **Step 2: Write the API reference and control guide.** Use BornEngine TypeScript examples only; document each control's purpose and methods, method-based geometry, profile defaults, event/focus behavior, availability, and next-frame responses.

- [ ] **Step 3: Update existing docs and navigation.** Keep `api/ui.md` focused on immediate `game.ui`, link it to `api/gui.md`, and add links from API index, debug UI, audio/UI, and navigation. Mirror the reference/guide locally and update Apple/watchOS platform docs.

- [ ] **Step 4: Run the docs contract and website checks.**

Run: `node --test webpage/tests/gui-docs.test.mjs`

Expected: coverage, navigation, cross-links, and watchOS notices pass.

Run: `npm test --prefix webpage`

Expected: all website contract tests pass.

Run: `npm run check --prefix webpage && npm run build --prefix webpage`

Expected: Astro checks and optimized website build complete without errors.

- [ ] **Step 5: Commit documentation.**

```bash
git add webpage/src/content/docs/api/gui.md webpage/src/content/docs/guides/gui-controls.md docs/api/gui.md docs/guides/gui-controls.md webpage/src/content/docs/api/index.md webpage/src/content/docs/api/ui.md webpage/src/content/docs/api/debug-ui.md webpage/src/content/docs/guides/audio-and-ui.md webpage/src/content/docs/platforms/apple.md webpage/src/data/navigation.ts docs/api/ui.md docs/watchos-target.md webpage/tests/gui-docs.test.mjs
git commit -m "docs: document retained GUI controls"
```

### Task 9: Full target and regression verification

**Files:**
- Test: `tests/gui-api.test.mjs`
- Test: `tests/game-runtime/gui-frame-harness.cjs`
- Test: Rust GUI/UI module tests
- Test: `webpage/tests/gui-docs.test.mjs`
- Verify: package FFI, Web compile, all changed files

**Interfaces:**
- Consumes all public APIs and native interfaces from Tasks 1–8; this task changes implementation only to fix issues discovered by verification.

- [ ] **Step 1: Run TypeScript and Game integration tests.**

Run: `node --test tests/gui-api.test.mjs`

Run: `node tests/game-runtime/gui-frame-harness.cjs`

Run: `npm run test:runtime`

Expected: GUI contracts and existing Game runtime tests pass.

- [ ] **Step 2: Run Rust and FFI checks.**

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d gui::`

Run: `cargo test --manifest-path native/shared/Cargo.toml --lib --no-default-features --features models3d ui::egui::`

Run: `node tools/validate-ffi.js`

Run: `cargo check --manifest-path native/shared/Cargo.toml --target wasm32-unknown-unknown --no-default-features --features web`

Run: `cargo check --manifest-path native/web/Cargo.toml --target wasm32-unknown-unknown --no-default-features`

Expected: retained GUI/egui tests pass, FFI declarations match all targets, and shared plus Web wrapper crates compile.

- [ ] **Step 3: Run website validation.**

Run: `npm test --prefix webpage`

Run: `npm run check --prefix webpage && npm run build --prefix webpage`

Expected: website tests, Astro checks, and optimized docs build pass.

- [ ] **Step 4: Review the final diff and commit any verification fixes with technical commit messages.** Confirm no change removes `game.ui`, every documented control is exported/rendered, the watchOS notice is consistent, and no unrelated `tools/vscode/` files are staged.
