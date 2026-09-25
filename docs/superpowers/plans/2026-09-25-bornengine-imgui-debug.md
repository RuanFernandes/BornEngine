# BornEngine Dear ImGui Debug UI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Dear ImGui as an optional TypeScript-controlled developer overlay for desktop native BornEngine builds.

**Architecture:** Reuse the shared typed UI command/response bridge and non-consuming input snapshot from the egui plan. Keep an independent Dear ImGui context and renderer behind the `debug-ui` Cargo feature. The feature is supported only on macOS, Linux, and Windows; all other targets report the backend unavailable while preserving the common FFI surface.

**Tech Stack:** Rust, imgui 0.12, imgui-wgpu 0.28, wgpu 29, Perry TypeScript FFI.

**Prerequisite:** Complete Task 1 (typed UI bridge and FFI) and Task 2 (input snapshots) from `docs/superpowers/plans/2026-09-25-bornengine-egui-ui.md` first. This plan reuses those interfaces and does not add another FFI ABI.

## Global Constraints

- Gate all Dear ImGui dependencies, contexts, commands, and rendering behind `debug-ui`; it is disabled by default.
- Support only desktop native macOS, Linux, and Windows builds. Web, Android, iOS, tvOS, visionOS, and watchOS return unavailable for `UiBackend::DearImGui`.
- Keep Dear ImGui state independent from the production egui context and widgets.
- Accept commands during the game's normal TypeScript callback and evaluate them in Rust; do not call TypeScript from Rust.
- Keep stable numeric widget IDs and the same one-frame response model as egui.
- Render after egui and after the game's final 2D overlay, including the 3D scene path. Never paint into render textures.
- Preserve the existing Perry FFI manifest arities and platform parity. Reuse the `bloom_ui_*` functions and Dear ImGui backend selector from the egui plan.

## Review Focus

- A build without `debug-ui` must not include imgui dependencies and must report the Dear ImGui backend unavailable.
- Enabling `debug-ui` on desktop must not enable it for Web or mobile builds.
- Dear ImGui widgets must not share window/style/font state with egui.
- Debug paint must appear above egui and game overlays on both direct 2D and 3D scene paths, while remaining absent from render textures.
- The TypeScript API must compile in Perry and preserve values across the documented one-frame response delay.

---

### Task 1: Gate Dear ImGui dependencies to desktop native builds

**Files:**
- Modify: `native/shared/Cargo.toml`
- Modify: `native/linux/Cargo.toml`
- Modify: `native/macos/Cargo.toml`
- Modify: `native/windows/Cargo.toml`
- Update: `native/shared/Cargo.lock`
- Update: `native/linux/Cargo.lock`
- Update: `native/macos/Cargo.lock`
- Update: `native/windows/Cargo.lock`

**Interfaces:**
- Produces: a `debug-ui` feature in `bloom-shared` that enables optional `imgui` and `imgui-wgpu` dependencies.
- Produces: a `debug-ui` forwarding feature in Linux, macOS, and Windows crates.
- Consumes: `UiBackend::DearImGui`, `UiSystem`, and the common availability query from the egui plan.

- [ ] **Step 1: Add a failing feature/availability check.** Verify that the desktop crates expose an opt-in `debug-ui` feature and that the default build resolves no `imgui` packages.

Run: `cargo tree --manifest-path native/linux/Cargo.toml --no-default-features -e features`

Expected: no imgui dependency appears in the default feature graph.

- [ ] **Step 2: Add the optional dependencies and feature forwarding.** Pin `imgui` 0.12 and `imgui-wgpu` 0.28 behind `bloom-shared/debug-ui`, and forward the feature from only Linux, macOS, and Windows. Keep the target dependencies unavailable on wasm32 and do not declare the feature in mobile crates.

- [ ] **Step 3: Resolve lockfiles and verify feature graphs.** Update the shared and desktop lockfiles. Confirm that the disabled Linux graph excludes imgui and that `--features debug-ui` includes the compatible versions.

Run: `cargo tree --manifest-path native/linux/Cargo.toml --no-default-features --features debug-ui -e features`

Expected: imgui 0.12 and imgui-wgpu 0.28 appear only with the opt-in feature.

### Task 2: Implement the Dear ImGui command interpreter

**Files:**
- Create: `native/shared/src/ui/imgui.rs`
- Modify: `native/shared/src/ui/mod.rs`
- Modify: `native/shared/src/ui/commands.rs`
- Modify: `native/shared/src/ui/responses.rs`

**Interfaces:**
- Consumes: queued commands selected by `UiBackend::DearImGui`, `UiInputSnapshot`, and stable IDs.
- Produces: an independent `DearImGuiUi` context with response values for windows, labels, buttons, checkboxes, radio buttons, sliders, drag values, text input, combo/select controls, trees, tables, plots, debug drawing, style settings, and the built-in demo/metrics windows.
- Produces: pointer and keyboard capture values scoped to the Dear ImGui backend.

- [ ] **Step 1: Add failing interpreter tests.** Cover button clicks, slider value carry-forward, per-backend response isolation from egui, text input, and enabling the demo window.

Run: `cargo test --manifest-path native/shared/Cargo.toml --no-default-features --features debug-ui ui::imgui::tests`

Expected: compilation fails because the Dear ImGui interpreter is not implemented.

- [ ] **Step 2: Implement a separate Dear ImGui context and command interpreter.** Map shared opcodes to imgui widgets, consume only Dear ImGui commands, and publish typed responses through `UiSystem`. Keep frame commands and responses independent from egui while reusing the backend-keyed bridge.

- [ ] **Step 3: Add tests for stale IDs, capture state, and feature isolation.** Confirm responses are replaced after each completed UI frame and missing IDs return the default response.

Run: `cargo test --manifest-path native/shared/Cargo.toml --no-default-features --features debug-ui ui::imgui::tests`

Expected: debug widget and response tests pass.

### Task 3: Render the debug overlay above egui

**Files:**
- Modify: `native/shared/src/renderer/mod.rs`
- Modify: `native/shared/src/engine.rs`
- Modify: `native/shared/src/ui/imgui.rs`

**Interfaces:**
- Consumes: Dear ImGui commands and the shared frame input snapshot.
- Produces: an `imgui-wgpu` draw pass layered above egui and game overlays in direct 2D and 3D scene frames.

- [ ] **Step 1: Add a failing render-order policy test.** Assert that debug UI is submitted after egui for a surface frame and is skipped for render-texture output.

- [ ] **Step 2: Add feature-gated renderer state.** Initialize the Dear ImGui context and `imgui-wgpu` renderer from the existing wgpu device, queue, and final surface format only when `debug-ui` is enabled on a supported desktop target.

- [ ] **Step 3: Run and render Dear ImGui commands at the overlay insertion point.** Keep borrowed ImGui draw data alive through the GPU submission in the same renderer call. Place the pass after egui and, in the 3D path, after composition, post-processing, and `overlay_2d`. Preserve one present per frame and existing screenshot/profiler order.

- [ ] **Step 4: Keep paint surface-only.** Execute widgets and publish responses on render-texture frames but skip the Dear ImGui GPU pass when the final target is an offscreen render texture.

- [ ] **Step 5: Compile both feature states on Linux.**

Run: `cargo check --manifest-path native/linux/Cargo.toml`

Expected: the default desktop build compiles without Dear ImGui.

Run: `cargo check --manifest-path native/linux/Cargo.toml --features debug-ui`

Expected: the opt-in desktop build compiles with the overlay renderer.

### Task 4: Report backend availability across targets

**Files:**
- Modify: `native/shared/src/ffi_core/ui.rs`
- Modify: `native/web/src/ui_ffi.rs`
- Modify: `native/watchos` generated stubs if the shared manifest change requires regeneration
- Modify: `tools/validate-ffi.js`

**Interfaces:**
- Consumes: the shared `bloom_ui_is_available(backend)` FFI operation.
- Produces: `1` only when the Dear ImGui feature is compiled for a supported desktop target; `0` when disabled or unsupported.

- [ ] **Step 1: Add availability coverage for feature-off and unsupported targets.** Check default desktop, feature-enabled desktop, and wasm configurations.

- [ ] **Step 2: Implement feature-aware availability without changing FFI arity.** Use the common UI FFI symbol and backend selector; return unavailable on every non-desktop target and when the feature is disabled.

- [ ] **Step 3: Validate platform manifest parity.** Regenerate watchOS stubs if needed and run the repository FFI validator.

Run: `node tools/validate-ffi.js`

Expected: every target retains the same FFI names and arities.

### Task 5: Add the TypeScript `debugUi` facade

**Files:**
- Create: `src/debug-ui/index.ts`
- Create: `src/debug-ui/types.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Create: `examples/ui-smoke/debug-ui.ts`

**Interfaces:**
- Consumes: the common backend-selected `bloom_ui_*` bridge and Rust opcode values.
- Produces: `debugUi.isAvailable`, begin/end window and layout calls, common debug widgets, debug drawing, style controls, demo/metrics toggles, typed responses, and independent input-capture queries.
- Public entry points: `@bornengine/engine/debug-ui` and root export `debugUi`.

- [ ] **Step 1: Add a Perry fixture for disabled and enabled builds.** The fixture imports `debugUi`, checks availability, builds a window with a checkbox and slider, and toggles the demo/metrics views.

- [ ] **Step 2: Compile and confirm the package subpath is missing.**

Run: `perry compile examples/ui-smoke/debug-ui.ts`

Expected: Perry reports that `@bornengine/engine/debug-ui` is not exported.

- [ ] **Step 3: Implement the typed facade.** Keep the API separate from `ui`; use stable IDs, the shared Dear ImGui backend selector, and the same previous-frame response model. Return false from `isAvailable` on unsupported and feature-off builds.

- [ ] **Step 4: Export and compile the debug module.** Add the package subpath and root re-export, then compile the fixture with the normal build and a desktop `debug-ui` build.

Expected: the normal build links and reports unavailable; the desktop opt-in build links and reports available.

### Task 6: Document opt-in builds and verify the overlay

**Files:**
- Create: `docs/api/debug-ui.md`
- Modify: `docs/api/ui.md`
- Modify: `examples/ui-smoke/main.ts`

**Interfaces:**
- Consumes: the public TypeScript `debugUi` API and desktop Cargo feature.
- Produces: documentation for build opt-in, availability checks, delayed responses, demo/metrics windows, and the distinction between production egui and Dear ImGui diagnostics.

- [ ] **Step 1: Document platform and feature behavior.** Explain that `debug-ui` is opt-in for desktop native builds, is unavailable elsewhere, and can be checked at runtime through `debugUi.isAvailable()`.

- [ ] **Step 2: Exercise both frame paths.** Run the smoke fixture in direct 2D mode and with a 3D scene. Confirm the debug overlay appears above egui and game overlays at normal/high-DPI scales, captures its own input state, and never appears in a render texture.

- [ ] **Step 3: Verify feature combinations.** Build Linux, macOS, and Windows manifests with and without `debug-ui`; compile Web/mobile manifests without the feature; run FFI parity validation and Perry compile for the fixture.

Expected: only opt-in desktop native builds include the Dear ImGui dependency and renderer, while all targets link the same TypeScript package surface.
