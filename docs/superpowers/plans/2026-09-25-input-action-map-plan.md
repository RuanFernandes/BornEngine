# Input Action Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named actions and axes that combine keyboard, mouse, primary gamepad, and touch-region input with stable frame snapshots and runtime rebinding.

**Architecture:** `InputActionMap` polls the existing stateless Core input functions once per `update()`. Pure internal snapshot evaluators combine bindings and edge state, which keeps action behavior deterministic and testable without installing callbacks or taking ownership of the game loop.

**Tech Stack:** Perry TypeScript, existing `@bornengine/engine/core` input APIs, Node docs checks, `perry run` and `perry check`.

**Spec:** `docs/superpowers/specs/2026-09-25-game-scenes-audio-input-design.md` (InputActionMap)

## Global Constraints

- Keep the procedural engine API as the low-level foundation.
- Keep all new class instances in Perry-compiled TypeScript. FFI receives only numeric handles, scalar settings, and existing plain transform/input data.
- Gamepad bindings use the engine's current primary-controller behavior because the low-level API does not yet route reads by gamepad ID.
- `InputActionMap` does not take over frame ownership or install hidden global callbacks.
- Update API documentation with imports, lifecycle order, loop integration, ownership rules, action snapshots, and the distinction between the OOP layer and the low-level functions.

## Review Focus

- Multiple bindings that are simultaneously down produce one action press and do not create duplicate press/release edges.
- Rebinding while a physical key is already held adopts the new state as baseline and does not synthesize `wasPressed`.
- Touch-region evaluation checks active slots rather than assuming touch slots are dense.
- A negative and positive digital axis binding held together cancel; final analog/digital values stay in `[-1, 1]`.
- Invalid names, indices, rectangles, scale, and deadzone do not replace a prior binding.

---

### Task 1: Add pure snapshot evaluators

**Files:**
- Create: `src/input/action-map-state.ts`
- Create: `tests/game-runtime/input-action-map-state.ts`

**Interfaces:**
- Consumes: plain `ActionButtonBinding`/`ActionAxisBinding` data and a captured input snapshot.
- Produces: internal `ActionInputSnapshot`, `evaluateButtonBinding(binding, snapshot): boolean`, `evaluateActionBindings(bindings, snapshot): boolean`, `evaluateAxisBinding(binding, snapshot): number`, and `advanceActionState(previous, current, suppressEdge)` helpers; do not re-export these helpers from the public `@bornengine/engine/input` barrel.

- [ ] **Step 1: Add failing pure helper assertions**

Create `tests/game-runtime/input-action-map-state.ts`, importing the internal binding types/evaluators and defining a local `expect(value, label)` helper. `ActionInputSnapshot` stores active key/mouse/gamepad indices in number arrays, analog values by axis index, and touch slots as `(TouchSample | null)[]`, where `TouchSample` is `{ active: boolean; x: number; y: number }`. Add these cases:

~~~ts
import type { ActionButtonBinding, ActionInputSnapshot } from '../../src/input/action-map-state';
import { advanceActionState, evaluateActionBindings, evaluateAxisBinding, evaluateButtonBinding } from '../../src/input/action-map-state';

function expect(value: boolean, label: string): void {
  if (!value) { console.error('FAIL: ' + label); process.exit(1); }
}
const sparse: ActionInputSnapshot = {
  keys: [], mouseButtons: [], gamepadButtons: [], gamepadAxes: [],
  touches: [null, null, null, null, { active: true, x: 12, y: 8 }],
};
expect(evaluateButtonBinding({ kind: 'touch-region', rect: { x: 10, y: 5, width: 5, height: 5 } }, sparse),
  'active sparse touch slots hit the region');
const bindings = [{ kind: 'key', key: 1 }, { kind: 'gamepad', button: 3 }] as ActionButtonBinding[];
const held = { ...sparse, keys: [1], gamepadButtons: [3] };
expect(evaluateActionBindings(bindings, held), 'overlapping physical bindings combine as OR');
const pressed = advanceActionState(false, evaluateActionBindings(bindings, held), false);
expect(pressed.wasPressed, 'combined action reports one press edge');
const overlapping = advanceActionState(true, evaluateActionBindings(bindings, { ...held, keys: [] }), false);
expect(overlapping.isDown && !overlapping.wasReleased,
  'releasing one of two held bindings does not release the action');
const released = advanceActionState(true, false, false);
expect(released.wasReleased && !released.isDown, 'the last binding reports one release edge');
expect(evaluateAxisBinding({ negative: [{ kind: 'key', key: 1 }], positive: [{ kind: 'key', key: 2 }] },
  { ...sparse, keys: [1, 2] }) === 0, 'opposite digital directions cancel');
expect(evaluateAxisBinding({ gamepadAxis: { axis: 0, deadzone: 0.2 } },
  { ...sparse, gamepadAxes: [0.6] }) === 0.5, 'deadzone rescales the remaining analog range');
const edge = advanceActionState(false, true, true);
expect(edge.isDown && !edge.wasPressed && !edge.wasReleased,
  'a rebind baseline suppresses a synthetic edge');
~~~

- [ ] **Step 2: Run the fixture and confirm evaluator imports fail**

Run: `perry run macos tests/game-runtime/input-action-map-state.ts`

Expected: compilation fails because the internal evaluator module does not exist.

- [ ] **Step 3: Implement snapshot evaluators**

Implement sparse-index lookup for keys/buttons/axes and a nullable touch-slot array. `evaluateButtonBinding` ORs all active touches for a region and reads digital states by index; `evaluateActionBindings` ORs the bindings for one action. `evaluateAxisBinding` computes positive-held minus negative-held, applies the specified remapped deadzone and scale to one optional analog axis, then clamps the sum. `advanceActionState(previous, current, suppressEdge)` returns `{ isDown, wasPressed, wasReleased }` using boolean edges and clears both edge flags when suppression is true.

- [ ] **Step 4: Run the pure evaluator tests**

Run: `perry run macos tests/game-runtime/input-action-map-state.ts`

Expected: sparse touches, opposite directions, analog deadzone scaling, and suppressed rebind edges pass.

- [ ] **Step 5: Commit the evaluator unit**

~~~sh
git add src/input/action-map-state.ts tests/game-runtime/input-action-map-state.ts
git commit -m "feat: add pure input action evaluators"
~~~

### Task 2: Add public InputActionMap and exports

**Files:**
- Create: `src/input/input-action-map.ts`
- Create: `src/input/index.ts`
- Modify: `package.json`
- Modify: `src/index.ts`
- Modify: `tests/game-runtime/perry-compat.ts`
- Create: `tests/game-runtime/input-actions.ts`

**Interfaces:**
- Consumes: Task 1 evaluators and `isKeyDown`, `isMouseButtonDown`, `isGamepadButtonDown`, `getGamepadAxis`, `getTouchPosition`, `getMaxTouchPoints`, and `isTouchActive` from Core.
- Produces: `ActionButtonBinding`, `ActionAxisBinding`, and the `InputActionMap` public methods in the spec.

- [x] **Step 1: Add public API compile and validation assertions**

In `perry-compat.ts`, import `InputActionMap`, bind a key and a button action, bind an axis, read `isDown`, `wasPressed`, `wasReleased`, `readAxis`, and `readVector2`, then clear the map. In `input-actions.ts`, use `injectKeyDown`/`injectKeyUp` from Core to assert one press edge, stable held state, one release edge, overlapping bindings without a false release, and no synthetic press after rebinding while the new key is held. Assert that diagonal `readVector2` values are not normalized, unknown action/axis queries return false/zero, empty names and negative indices are rejected, a valid axis registration succeeds, a replacement with deadzone `1` returns false, and unbinding an unknown name returns false.

- [x] **Step 2: Run compatibility check and inspect export resolution**

Run: `perry check --strict --target macos tests/game-runtime/perry-compat.ts`

Expected: compilation fails because `@bornengine/engine/input` is not exported yet.

- [x] **Step 3: Implement binding registry and frame polling**

Create `InputActionMap` with separate action/axis registries. Validate non-empty names, non-negative integer indices, finite rectangles/scales, non-negative rectangle sizes, and deadzones in `[0, 1)` before mutating any existing registration. `bindAction` appends only semantically new bindings; `bindAxis` replaces the named axis. Copy binding arrays/rectangles on registration. `update()` captures registered physical inputs once, iterates all touch slots up to `getMaxTouchPoints()`, and derives the new action snapshot through Task 1 helpers. After a rebind, suppress the next edge while adopting the new physical state as the baseline. `readVector2` returns the two named axis values without normalization.

- [x] **Step 4: Export and run focused input checks**

Export the public types and class from `src/input/index.ts`, add the `./input` package export, and re-export the public API from `src/index.ts`.

Run:

~~~sh
perry run macos tests/game-runtime/input-action-map-state.ts
perry run macos tests/game-runtime/input-actions.ts
for target in macos windows linux ios tvos watchos android visionos web; do
  perry check --strict --target "$target" tests/game-runtime/perry-compat.ts || exit 1
done
~~~

Expected: pure snapshot tests and public default-state checks pass; the new subpath compiles on every target without adding native functions.

- [x] **Step 5: Commit the public input API**

~~~sh
git add src/input/input-action-map.ts src/input/action-map-state.ts src/input/index.ts src/index.ts package.json tests/game-runtime/input-actions.ts tests/game-runtime/input-action-map-state.ts tests/game-runtime/perry-compat.ts
git commit -m "feat: add action-based input maps"
~~~

### Task 3: Document action bindings and loop integration

**Files:**
- Create: `webpage/src/content/docs/api/input.md`
- Modify: `webpage/src/content/docs/api/core.md`
- Modify: `webpage/src/content/docs/api/index.md`
- Modify: `webpage/src/data/navigation.ts`
- Modify: `webpage/src/data/docs-coverage.mjs`
- Modify: `webpage/tests/docs-coverage.test.mjs`

**Interfaces:**
- Consumes: Task 2 public API.
- Produces: a discoverable Input API page with keyboard/mouse/gamepad/touch examples, edge snapshots, axes, rebinding, and game-loop integration.

- [x] **Step 1: Add route and required-section coverage**

Add an `input` entry to `apiCoverage` with the page's required sections, add `/docs/api/input/` to API navigation and the API index, add `input` to the API pages that require sections/examples in `docs-coverage.test.mjs`, and update the expected module list from 14 to 15 entries.

Run: `cd webpage && node --test tests/docs-coverage.test.mjs`

Expected: the new route/page fails the coverage test until its headings and examples exist.

- [x] **Step 2: Write the Input API page and Core cross-link**

Create `api/input.md` with at least two TypeScript examples: a named `move`/`jump` map and an axis/rebinding example. Explain one `update()` call per frame, snapshot edge timing, sparse touch slots, primary gamepad behavior, and the low-level Core APIs. Add a short link from the Core page's Input section.

- [x] **Step 3: Run site tests and build**

Run: `cd webpage && npm test && npm run check && npm run build && npm run validate:dist`

Expected: API coverage, route navigation, Astro checks, generated pages, and internal links pass.

- [x] **Step 4: Commit the docs**

~~~sh
git add webpage/src/content/docs/api/input.md webpage/src/content/docs/api/core.md webpage/src/content/docs/api/index.md webpage/src/data/navigation.ts webpage/src/data/docs-coverage.mjs webpage/tests/docs-coverage.test.mjs
git commit -m "docs: add input action map guide"
~~~
