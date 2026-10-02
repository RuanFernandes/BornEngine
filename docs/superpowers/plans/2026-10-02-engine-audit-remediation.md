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

---

### Task 1: Rust string FFI safety

**Files:** `native/shared/src/string_header.rs`, native FFI call sites, tests.

- [ ] Add or update tests for null, inline, valid heap, malformed header and persistence-path behavior.
- [ ] Make raw-pointer dereferencing explicitly unsafe at the API boundary with a precise Safety contract; confine unsafe blocks to FFI entry points where Perry guarantees pointer validity.
- [ ] Run focused Rust tests, formatting check for touched files and native Colyseus/runtime smokes.

### Task 2: Rust formatting and Clippy baseline

**Files:** `native/shared/src/**/*.rs`, `.github/workflows/test.yml`.

- [ ] Make `cargo fmt --all -- --check` pass; keep formatting changes scoped to files that fail the formatter.
- [ ] Resolve `cargo clippy --release --no-deps -- -D warnings`; refactor actionable issues and add only narrow documented allowances for intentional ABI functions.
- [ ] Remove `continue-on-error` from the two Rust lint steps only after both commands pass locally.
- [ ] Run shared Rust tests after the mechanical and semantic lint changes.

### Task 3: Current contributor instructions

**Files:** `AGENTS.md`.

- [ ] Replace Bloom-era/function-based instructions with BornEngine's current class-first TypeScript API, profile selection, asset lifecycle, native/web architecture and current verified commands.
- [ ] Verify every command and path against current package scripts, manifests and build files.

### Task 4: Dependency audit for maintained fixtures

**Files:** `tests/colyseus/server/package*.json`, `examples/multiplayer-arena/server/package*.json`, `examples/multiplayer-chat/server/package*.json`.

- [ ] Audit each fixture lockfile and identify production-relevant advisories.
- [ ] Upgrade within compatible ranges and regenerate lockfiles; retain reproducible installs and avoid breaking major versions.
- [ ] Run npm audit plus fixture typechecks and contract tests.

### Task 5: Web bundle warning

**Files:** `webpage` source and build config only.

- [ ] Locate the source of oversized chunks and apply route/component-level splitting if safe.
- [ ] Verify Astro checks, tests, production build and dist validation.
- [ ] Record remaining unavoidable size warnings or platform gaps accurately.

### Task 6: Integration and release

- [ ] Run focused and repository-level checks sequentially, including native Colyseus smoke and available example validation.
- [ ] Review the final diff and resolve newly discovered release-blocking regressions.
- [ ] Open a PR against `main`; merge and publish the next package release plus site only after required CI checks pass.
