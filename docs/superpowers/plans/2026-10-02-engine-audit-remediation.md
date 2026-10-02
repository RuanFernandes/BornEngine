# Engine Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Resolve the reproducible correctness, FFI safety, repository guidance, dependency, CI-quality, and web-build issues found in the BornEngine audit, then verify the release candidate.

**Architecture:** Keep the existing class-first engine API and native/web split. Harden the Rust string ABI boundary, make contributor guidance and CI gates match current practice, remediate safe dependency findings, and reduce the web bundle warning without changing public behavior.

**Tech Stack:** TypeScript, Rust, Perry, npm, Astro/Vite, GitHub Actions.

**Spec:** Findings from the immediately preceding full engine audit; no standalone feature spec.

## Global Constraints

- Preserve the existing Colyseus native callback smoke changes on this branch.
- Do not add AI attribution to source, docs, commits, PRs, or release metadata.
- Preserve ABI behavior for valid Perry inline and heap string pointers.
- Run expensive compilation jobs sequentially and avoid parallel native builds.
- Do not suppress lint categories globally; intentional FFI shape exceptions must be narrow and documented.
- Publish only after local verification, code review, green required CI, and successful merge.

## Review Focus

- Invalid native string pointers must not be dereferenced by safe Rust APIs.
- Valid heap and inline Perry strings must keep their current behavior.
- Rust lint and format gates must pass without broad suppression or generated churn unrelated to a lint.
- Dependency upgrades must not silently introduce breaking major versions.
- Web code splitting must preserve routes and the embedded editor experience.
- Maintained Colyseus fixtures should install only the server integrations they use; removing optional integrations must preserve room startup and SDK behavior.

---

### Task 1: Rust string FFI safety

**Files:** `native/shared/src/string_header.rs`, native FFI call sites, `tools/validate-ffi.js`, tests.

- [x] Add or update tests for null, inline, valid heap, malformed header and persistence-path behavior.
- [x] Make raw-pointer dereferencing explicitly unsafe at the API boundary with a precise Safety contract; confine unsafe blocks to FFI entry points where Perry guarantees pointer validity.
- [x] Update the FFI manifest validator to recognize the optional `unsafe` modifier and add a regression test so unsafe exports are not silently skipped.
- [x] Run focused Rust tests, formatting check for touched files and native Colyseus/runtime smokes.

### Task 2: Rust Clippy baseline and lint CI

**Files:** `native/shared/src/**/*.rs`, `.github/workflows/test.yml`.

- [x] Resolve `cargo clippy --release --no-deps -- -D warnings`; refactor actionable issues and add only narrow documented allowances for intentional ABI functions.
- [x] Make Clippy blocking in CI once it passes locally, and run the FFI parser regression test in CI.
- [x] Keep rustfmt advisory with an explicit baseline note: the current check produces about 42,824 lines of unrelated formatting diff and would grow grandfathered files past the ratcheting 2,000-line limit. Do not reformat the whole crate in this release.
- [x] Run shared Rust tests after the mechanical and semantic lint changes.

### Task 3: Current contributor instructions

**Files:** `AGENTS.md`.

- [x] Replace Bloom-era/function-based instructions with BornEngine's current class-first TypeScript API, profile selection, asset lifecycle, native/web architecture and current verified commands.
- [x] Verify every command and path against current package scripts, manifests and build files.

### Task 4: Dependency audit for maintained fixtures

**Files:** `tests/colyseus/server/package*.json`, `examples/multiplayer-arena/server/package*.json`, `examples/multiplayer-chat/server/package*.json`.

- [x] Audit each fixture lockfile and identify production-relevant advisories.
- [x] Upgrade within compatible ranges and regenerate lockfiles; retain reproducible installs and avoid breaking major versions.
- [x] Run npm audit plus fixture typechecks and contract tests.

### Task 5: Web bundle warning

**Files:** `webpage` source and build config only.

- [x] Locate the source of oversized chunks and apply route/component-level splitting if safe.
- [x] Verify Astro checks, tests, production build and dist validation.
- [x] Record remaining unavoidable size warnings or platform gaps accurately.

### Task 6: Align multiplayer server Node requirements

**Files:** the three maintained server `package.json` files, `examples/multiplayer-arena/README.md`, `examples/multiplayer-chat/README.md`, `tests/colyseus/README.md`.

- [x] Raise all three server `engines.node` requirements to `>=22`, matching the installed Colyseus 0.18 packages' declared engine floor.
- [x] Update the three fixture guides to state Node.js 22 or newer.
- [x] Regenerate lockfile root metadata and verify clean installs plus the existing fixture tests.

### Task 7: Trim unused Colyseus server integrations

**Files:** the three maintained server `package.json`/lockfiles and each `src/app.config.ts`.

- [x] Replace the `colyseus` umbrella dependency with explicit compatible `@colyseus/core` and `@colyseus/ws-transport` dependencies alongside `@colyseus/tools`; switch `defineRoom`/`defineServer` imports to `@colyseus/core`.
- [x] Keep schema and client SDK dependencies where the fixtures use them; do not change Colyseus major versions.
- [x] Regenerate lockfiles and verify unused auth, monitor, playground, and Redis integrations are no longer installed unless required transitively.
- [x] Run `npm audit --omit=dev` and the protocol, arena, and chat contract tests. Record any advisories that remain with their dependency paths.

### Task 8: Final integration verification

- [x] Run focused and repository-level checks sequentially, including native Colyseus smoke and available example validation.
- [x] Bump the engine package to `0.13.0` and update docs that show the current release; this branch adds the public `Room.requestWithCallbacks` API, and npm currently publishes `0.12.0`.
- [x] Verify the release package contents with `npm pack --dry-run` and ensure package version metadata matches the planned tag.
- [x] Review integration findings and resolve regressions revealed during verification; the final whole-branch code review is a separate release gate.

## Final release gate

After Task 8 passes and the final whole-branch review is clean, open a PR against `main`. Merge only after required CI checks pass. Tag `v0.13.0` at the merged commit to publish the engine/Jolt packages, and let the site deploy complete after merge.
