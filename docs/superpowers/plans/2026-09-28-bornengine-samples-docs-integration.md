# BornEngine 2D Samples, Docs, and Integration

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for the documentation/example task. Work in a clean BornEngine worktree based on the completed feature branches, branch `integrate/2d-production`; maintain an integration ledger.

## Goal

Deliver the 2D features as a coherent developer experience and provide the requested reviewable integration branch in both repositories.

## Architecture

Two Perry-compiled sample games exercise real APIs: a platformer with tilemap collision, a `CharacterBody2D`, follow camera, sprite animation, audio, and particles; a top-down game with data-driven rooms, input rebinding, preload groups, save/settings, and 2D audio. Documentation explains the code-first flow and CLI workflows. One integration branch per repository keeps Git history valid.

## Tech Stack

TypeScript/Perry samples, current bornengine-cli, Astro docs, Rust CLI contract tests, engine runtime fixtures, native/Web platform checks.

## Spec

Each workstream updates its API page and guide. This final task adds runnable project samples, a migration guide from current 2D APIs, cross-repo golden fixture parity, and a reviewable merge of all feature branches. Do not merge to `main`, publish npm, or deploy.

## Global Constraints

No sample relies on an editor or undocumented generated files. Keep examples small, reproducible, and dependency-locked by their selected package manager. Do not make docs promise platforms or feature parity that verification has not established. Preserve the user's untracked engine lockfile.

## Review Focus

Run each sample from a clean generated project; every documented import and CLI command exists; examples exercise lifecycle/disposal; schema fixtures are identical; branch has no unresolved conflicts, accidental binaries, or user lockfile changes.

---

### Task 1: Platformer/top-down examples and complete docs

**Files:** Add `examples/2d-platformer/` and `examples/2d-top-down/`, `webpage/src/content/docs/guides/2d-production-workflow.md`, `webpage/src/content/docs/guides/migrating-2d-api.md`, and `webpage/src/content/docs/api/storage.md`. Update `webpage/src/content/docs/api/index.mdx`, `webpage/src/content/docs/guides/index.mdx`, `webpage/src/content/docs/cli/index.md`, `README.md`, and feature API pages.

1. Add example manifests and source using only committed APIs. Run Perry compile and runtime smoke tests on the current local native target; ensure assets are small/reproducible and no build binaries are committed.
2. Document the world2d schema, migration/diagnostics, Tiled import subset, asset validation/packing, dev rebuild semantics, camera/viewport transforms, physics limits, saves, action map data, and 2D audio lifecycle. Link only commands present in CLI `--help` and tests.
3. Copy the canonical importer fixture into CLI tests with an automated parity check or a single sourced fixture mechanism that works for clean checkouts. Verify both repos independently.
4. Create `integrate/2d-production` from engine `main`; merge the completed workstream branches in the declared order. Resolve conflicts deliberately, preserving existing formats and exports. Create matching integration branch in `bornengine-cli` from its main and merge CLI work. Record commit IDs across repositories in a coordination note.
5. Run engine API/runtime checks and website checks: `cd webpage && npm run check && npm test && npm run build && npm run validate:dist`. Run CLI `cargo fmt --all -- --check`, Clippy, tests, and release build. Run FFI parity, shared Rust release tests, Web/WASM check, and watchOS CI check when relevant. Record any platform-only check that cannot run locally.
6. Review the complete diffs on both integration branches for API consistency, compatibility, fixtures, lockfiles, generated files, and user changes. Commit `docs: add 2d production workflows and samples` plus integration merge commits as needed. Leave both branches clean and ready for user review; do not push, merge to main, tag, publish, or deploy.
