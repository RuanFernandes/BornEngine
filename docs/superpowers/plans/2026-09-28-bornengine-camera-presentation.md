# BornEngine Camera and 2D Presentation

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Work in a clean worktree from BornEngine `main` at `e320b869`, branch `work/camera-presentation`; use a dedicated progress ledger.

## Goal

Give 2D games reusable camera behavior and consistent pixel/letterbox presentation across window sizes.

## Architecture

Retain the low-level `Camera2D` data record. Add `CameraRig2D` as a scene component that owns the record and updates it from a target, and `Viewport2D` as the shared logical-to-physical transform. Add `ParallaxLayer2D` as an ordered scene component. Route render and pointer conversion through the same viewport/camera transform.

## Tech Stack

Perry-compatible TypeScript, existing renderer and `InputSystem.screenToWorld/worldToScreen`, current component lifecycle and API docs.

## Spec

Implement target follow, smoothing, dead zone, bounds, min/max zoom, deterministic shake, `fit`/`integer`/`stretch` scaling, resize-safe letterboxing, and parallax. Keep defaults equivalent to current behavior.

## Global Constraints

Do not change 3D cameras or require new FFI unless the current draw backend cannot support the presentation contract. All invalid dimensions, targets, or camera options fail safely. Logical coordinates and screen/world conversion must not disagree with rendered positions.

## Review Focus

Test aspect ratios wider/narrower than logical resolution, integer scale fallback below 1x, resizing, rotated cameras, bounds smaller than viewport, smoothing with varying `dt`, shake reset, and parallax render ordering.

---

### Task 1: Camera rig, viewport mapping, and parallax

**Files:** Add `src/camera2d/camera-rig-2d.ts`, `src/camera2d/viewport-2d.ts`, `src/camera2d/parallax-layer-2d.ts`, and `src/camera2d/index.ts`. Modify `src/core/types.ts`, `src/core/renderer.ts`, `src/core/internal.ts` only if required by existing screen dimensions, `src/game/scene.ts`, `src/game/game-scene.ts`, `src/input/input-system.ts`, root `src/index.ts`, and package exports. Add `tests/game-runtime/camera-rig-2d.ts`, `tests/game-runtime/viewport-2d.ts`, and `tests/game-runtime/parallax-layer-2d.ts`. Update `webpage/src/content/docs/api/camera2d.md`, `webpage/src/content/docs/guides/2d-game.md`, and the camera migration note.

1. Add pure fixtures for camera follow/deadzone/bounds/smoothing/zoom/shake and viewport screen-to-logical/world round trips before implementation. Include exact edge coverage for bar areas, invalid/zero sizes, high-DPI dimensions as reported by the renderer, and integer scaling when no whole-number upscale fits.
2. Implement `CameraRig2D extends GameComponent` with a target `GameObject`, configurable smoothing/dead zone/bounds, zoom constraints, seeded or explicit shake envelope, and a readonly `camera` snapshot. A scene may bind one rig to `camera2D`; removing/disabling the rig must restore safe prior/default camera behavior.
3. Implement `Viewport2D` as a pure transform with `fit`, `integer`, and `stretch` modes. Integrate it so rendering, `InputSystem.screenToWorld`, and `worldToScreen` use identical scale and letterbox offsets. Preserve the current full-window behavior when no logical size is configured.
4. Implement `ParallaxLayer2D extends GameComponent`, deriving offset from camera movement and a parallax factor, with render-order semantics matching other visual components.
5. Run Perry runtime fixtures, build one native/Web sample entry where local toolchains allow, verify exports and package format, and run docs checks for changed pages. Commit `feat: add 2d camera and viewport controls`.
