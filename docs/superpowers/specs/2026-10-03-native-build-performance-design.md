# Native Build Performance Design

**Date:** 2026-10-03
**Status:** Proposed for review
**Repositories:** `BornEngine` and `bornengine-cli`

## Goal

Make native game iteration faster and easier to diagnose. A cold build should report real compiler progress, later projects should reuse compiled engine dependencies from a machine-wide Cargo target cache, and small games should not compile SQLite or embedded QuickJS unless they opt into those capabilities.

## Current behavior

- `bornengine run` and `build` call Perry behind a spinner. The CLI captures Perry's stdout and stderr until the process exits, so a long Cargo build looks silent even while it is working.
- The CLI's Cargo profile proxy selects engine features from `perry.toml`, but does not set `CARGO_TARGET_DIR`. Cargo therefore writes build artifacts next to the installed engine package. Separate project installations can compile the same engine dependencies again.
- Cargo's registry and the JavaScript package manager already cache downloaded sources/packages globally. The missing reuse is primarily compiled Rust artifacts, not repeated network downloads.
- The 2D profile omits Jolt, 3D models, and extra image codecs, but Linux still compiles `rusqlite` with bundled SQLite and `rquickjs` because those dependencies are unconditional for that target.

## Decisions

### Shared native build cache

- For native Perry builds, the CLI sets `CARGO_TARGET_DIR` to `BaseDirs::cache_dir()/BornEngine/cargo-target` when the caller has not set `CARGO_TARGET_DIR`. The CLI already depends on the `directories` crate, so this uses the standard per-user cache location on each host OS without a new dependency.
- Preserve an explicit `CARGO_TARGET_DIR` unchanged. This keeps CI, containers, and advanced users in control.
- Use one stable cache root per user and host. Let Cargo fingerprints separate engine revisions, Rust toolchains, target triples, profiles, and feature sets; do not encode project paths in the cache location.
- Print the effective cache path in `bornengine cache path`, including a caller-provided override. The first build for a missing engine/feature/toolchain combination still compiles; later projects reuse compatible dependency artifacts.
- Add `bornengine cache warm` for a game project. It reads the project's engine version, native target, profile, and optional features, then builds the engine library into the shared cache without compiling or launching the game's TypeScript entrypoint. It accepts the same `--jobs` and development/release profile choices as `run`.
- Do not compile the engine during `bornengine-cli` installation. The CLI release does not identify a game's engine version, feature set, or target; warming is meaningful only after a project resolves those values.
- Do not automatically relocate or delete package-local Cargo targets in the first version. Cargo validates all shared artifacts by fingerprints; a legacy package-local cache may remain until naturally removed by the package manager.

### Visible compiler progress

- Stream Perry stdout and stderr to their corresponding terminal streams while the child is running. Drain both concurrently so a full pipe cannot deadlock the build.
- Retain enough captured output to report a useful error if Perry exits unsuccessfully.
- Replace the silent spinner-only presentation with a compact build status and elapsed time. Compiler output must remain readable and must not be overwritten by spinner redraws.
- `--verbose` continues to print the full command and enables Perry verbosity; it no longer delays those messages until after compilation.
- Apply live output consistently to `run`, `build`, `dev`, and `cache warm`.

### Native features and stable APIs

- Add opt-in native Cargo features named `sqlite` and `scripting`. `sqlite` gates bundled `rusqlite`; `scripting` gates QuickJS on targets where QuickJS is supported.
- Keep the TypeScript API and every declared Perry FFI symbol available. When an optional feature is disabled, Rust stubs return the existing failure/status shape and expose a clear feature-disabled error; they must not silently succeed or omit symbols.
- The default `2d`, `2.5d`, and `3d` profiles do not enable SQLite or scripting. A project opts in through `[bornengine].native_features` in `perry.toml`; `bornengine new` accepts `--native-features sqlite,scripting` and writes the selection into the generated project.
- Keep the current model/Jolt profile mapping intact. Leave existing Web/WebAssembly feature behavior unchanged in this iteration. Document targets where embedded QuickJS remains unsupported or uses an existing stub.
- Add feature forwarding to each native platform manifest that supports the capability. Unsupported targets keep their current stubs. Keep `package.json` FFI declarations unchanged unless implementation proves a new symbol is required; validate any FFI change across the manifest and adapters.

### Faster development builds and resource controls

- `bornengine run` and `bornengine dev` use a fast native development profile with `opt-level=1` and incremental Cargo compilation by default. `bornengine run --release` and `bornengine dev --release` select the fully optimized native profile. `bornengine build` remains fully optimized.
- Accept `--jobs <N>` on native build commands and `cache warm`; require a positive value and pass it as `CARGO_BUILD_JOBS`. When omitted, preserve the caller's environment and Cargo's normal job selection.
- Keep Rust profile selection independent from the game's renderer mode and from the `2d`/`2.5d`/`3d` feature profile.

## Scope

Modify the CLI's process runner, Cargo profile proxy, commands, generated `perry.toml`, tests, and CLI documentation. Modify the Rust shared crate and all platform feature manifests needed to gate SQLite and QuickJS without changing the Perry FFI surface. Update the engine's build-profile and persistence/scripting docs.

## Non-goals

- Do not bundle large precompiled native libraries in npm packages in this iteration. That would add a platform, architecture, toolchain, engine-version, and feature matrix to release management.
- Do not change the TypeScript API or remove SQLite/scripting support from any currently supported target.
- Do not make automatic network requests during cache warm beyond Cargo's normal dependency resolution.
- Do not impose a hard-coded Cargo job limit on every machine.

## Acceptance criteria

1. A user-provided `CARGO_TARGET_DIR` is preserved; otherwise two projects using the same compatible engine build use the same global target directory.
2. A warm cache reuses compatible Cargo artifacts, and `bornengine cache warm` populates that same cache for the project's selected native profile.
3. Perry stdout and stderr appear before the child exits; output from both streams is not lost or deadlocked, and failures still include actionable diagnostics.
4. A 2D native build without `sqlite` or `scripting` does not compile `libsqlite3-sys` or `rquickjs-sys`; opting in restores the real implementations.
5. Feature-off database and scripting calls keep all declared FFI symbols and return explicit unsupported/disabled results. Feature-on native builds preserve current behavior.
6. Existing 2D/2.5D/3D model and physics feature selection remains unchanged. WebAssembly, watchOS, and other platform adapters continue to match the supported-feature matrix.
7. `run`/`dev` select the incremental development profile, `run --release` and `build` select the optimized profile, and `--jobs` overrides `CARGO_BUILD_JOBS` only when supplied.
8. CLI help, generated project files, and engine docs explain that the first cache miss still compiles and that later compatible builds reuse artifacts.
