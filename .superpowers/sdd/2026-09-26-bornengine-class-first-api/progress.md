# SDD ledger — plan: docs/superpowers/plans/2026-09-26-bornengine-class-first-api.md

Base: `origin/main` at `542e7bbcae197d14d95cf4363dbb0d3fa5c6bbc`.
Branch: `feature/oop-api` in `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-oop-api`.

## Pre-flight interface scan

- Task 1 -> Tasks 3, 5, 6, 8: the feature branch adds scenes, `InputActionMap`, `SoundManager`, audio FFI, and function-based imports that later class facades consume. Keep the behavior and native declarations; rewrite the public ownership/import boundary in those later tasks.
- Task 2 -> Tasks 3, 4, 5, 6, 7, 8: `GameContext` provides stable context identity, readiness, resource registration, and ownership checks. Service/resource implementations consume that same contract; Task 8 assembles them into the public `Game` class.
- Task 3 -> Task 4: `Renderer` consumes the `GameContext`; resource classes delegate drawing to that renderer and reject disposed/foreign resources.
- Task 4 -> Tasks 5, 6, 7, 9, 10: resource identity/disposal is used by audio adapters, game adapters, remaining context-bound services, docs, and the multiplayer example.
- Tasks 5 and 6 -> Task 8: the concrete `Game` facade constructs audio and scene/physics services after those classes exist.
- Task 8 -> Tasks 9 and 10: docs and the multiplayer consumer target the final class-only root/subpath exports and `0.6.0` package surface.

## Rulings

- Ruling: keep the feature branch's scene/input/audio behavior while replacing its public function dependencies — the approved spec makes the feature behavior part of the new API but rejects a function-based public surface — cost if wrong: a behavior that the user expected from the feature branch could be dropped.
- Ruling: split internal `GameContext`/`Window` from the concrete `Game` assembly, which is produced in Task 8 after service classes exist — this resolves the Task 2/3/5/6 construction cycle without changing the public API in the spec — cost if wrong: internal context types may need another refactor.
- Ruling: no tests are added or run; the higher-priority task instruction prohibits both unless the user requests them — static source/export review will be recorded instead — cost if wrong: behavior regressions may escape without automated evidence.
- Ruling: the demo's engine pin is only changed to a real immutable revision available from the configured remote — the approved spec prohibits guessed/unpublished SHAs and local paths — cost if wrong: the source migration may be ready while the dependency pin remains blocked on publishing the engine revision.

## Task status

- Task 1: complete
- Ruling: docs for this skill package reference `task-start`/`task-done`, but the installed subagent scripts provide only `task-brief`, `sdd-workspace`, and `review-package`; use `task-brief` plus direct ledger updates — no completion script exists in this installation — cost if wrong: the automated completion gate is unavailable.
- Task 1: Ruling: selected the `origin/main` versions of docs coverage and its existing coverage checks, retaining Colyseus coverage absent from the older feature-branch snapshots — matches current engine main while preserving feature assertions — cost if wrong: a small feature-branch-specific coverage expectation could be lost.
- Task 1: complete (commit recorded; merge conflicts resolved in docs coverage; diff inspected; original engine checkout, dirty MeuGame, and original multiplayer checkout unchanged; tests not run per instruction).
- Task 2: Ruling: native window creation returns `void` through the existing ABI, so `Window` marks the context ready only after that call returns and can report validation/attach failures; a native panic remains process-level unless the ABI changes — preserves the approved ABI boundary — cost if wrong: startup failures that abort inside native code cannot be inspected in TypeScript.
- Task 2: Ruling: embedded mode reserves the single runtime context until `attachNativeSurface` succeeds; `close()` remains callable once after an OS close request so native cleanup still runs — preserves host-driven rendering and idempotent shutdown — cost if wrong: a host that expects repeated low-level close calls will see one call, by design.
- Task 2: complete (commit recorded; core FFI moved behind `src/core/internal.ts`; service imports bypass the public barrel; context identity/readiness/resource disposal and window transitions reviewed by tracing source; tests not run per instruction).
