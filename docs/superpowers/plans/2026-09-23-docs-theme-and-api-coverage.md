# Documentation Theme and API Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the documentation system theme-aware and substantially expand BornEngine's verified TypeScript API and recipe coverage.

**Architecture:** Resolve a `system` documentation theme before the header paints, expose a persistent accessible toggle, and give docs their own semantic color tokens while leaving the ink homepage intentional. Transform Markdown fences into the same static-fallback/Monaco contract already used by the homepage, then expand the existing content collection with module references and composition recipes sourced from `src/*/index.ts`.

**Tech Stack:** Astro 7, Astro content collections, MDX/rehype, vanilla browser modules, Monaco Editor 0.56, Node's built-in test runner, GitHub Pages Actions.

**Spec:** `docs/superpowers/specs/2026-09-23-docs-theme-and-api-coverage-design.md`

## Global Constraints

- Documentation layouts use a `system` theme mode by default.
- Keep the homepage's intentionally dark visual direction unchanged.
- Give every Markdown code fence the same Copy + Monaco read-only treatment as the homepage.
- Preserve static HTML as an accessible and indexable fallback.
- The source of truth for all API examples is the TypeScript under `src/*/index.ts`.
- Do not change engine runtime behavior or rename the package in source code.
- Do not make Monaco an editable playground or add a server-side execution service.
- Keep the site static, lightweight on first load, SEO-friendly, and compatible with the existing GitHub Pages build.
- Do not stage or modify the pre-existing `native/shared/src/ffi.rs` change.
- Do not add attribution to AI systems in code, docs, commits, or generated files.

## Review Focus

- A first visit with `prefers-color-scheme: dark` must paint docs dark before the header, while a fixed ink homepage remains ink.
- A stored `paper` or `ink` preference must override the system preference, update `aria-pressed`, and survive reloads.
- A Markdown fence with a language class must remain valid static `<pre><code>` if Monaco or JavaScript fails.
- Code copying must return the original source text after Monaco replaces the visual fallback.
- Every API/recipe route must be linked, built, and contain the required practical sections without using legacy `bloom` imports.

---

### Task 1: Add pure theme state and its contract

**Files:**
- Create: `webpage/src/scripts/theme-state.mjs`
- Create: `webpage/tests/theme-contract.test.mjs`

**Interfaces:**
- Produces `resolveTheme({ storedTheme, prefersDark, fallback }) => 'ink' | 'paper'`.
- Produces `nextTheme(theme) => 'ink' | 'paper'`.
- Produces `THEME_STORAGE_KEY = 'bornengine-theme'`.
- Consumes no DOM APIs so Node tests can exercise the preference rules.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { THEME_STORAGE_KEY, nextTheme, resolveTheme } from '../src/scripts/theme-state.mjs';

test('resolves a stored theme before the system preference', () => {
  assert.equal(resolveTheme({ storedTheme: 'ink', prefersDark: false }), 'ink');
  assert.equal(resolveTheme({ storedTheme: 'paper', prefersDark: true }), 'paper');
});

test('uses the system preference when no stored choice exists', () => {
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: true }), 'ink');
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: false }), 'paper');
});

test('rejects unknown storage values and falls back to paper', () => {
  assert.equal(resolveTheme({ storedTheme: 'sepia', prefersDark: false }), 'paper');
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: false, fallback: 'ink' }), 'ink');
});

test('toggles between the two supported themes', () => {
  assert.equal(nextTheme('paper'), 'ink');
  assert.equal(nextTheme('ink'), 'paper');
  assert.equal(THEME_STORAGE_KEY, 'bornengine-theme');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd webpage && node --test tests/theme-contract.test.mjs`

Expected: FAIL because `src/scripts/theme-state.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

```js
export const THEME_STORAGE_KEY = 'bornengine-theme';

const THEMES = new Set(['ink', 'paper']);

export function resolveTheme({ storedTheme, prefersDark, fallback = 'paper' }) {
  if (THEMES.has(storedTheme)) return storedTheme;
  if (prefersDark === true) return 'ink';
  if (prefersDark === false) return 'paper';
  return THEMES.has(fallback) ? fallback : 'paper';
}

export function nextTheme(theme) {
  return theme === 'ink' ? 'paper' : 'ink';
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd webpage && node --test tests/theme-contract.test.mjs`

Expected: 4 passing tests.

- [ ] **Step 5: Commit the isolated state contract**

```bash
git add webpage/src/scripts/theme-state.mjs webpage/tests/theme-contract.test.mjs
git commit -m "feat: add documentation theme state"
```

### Task 2: Add the persistent docs theme toggle

**Files:**
- Create: `webpage/src/components/ThemeToggle.astro`
- Create: `webpage/src/scripts/theme.ts`
- Modify: `webpage/src/layouts/SiteLayout.astro`
- Modify: `webpage/src/components/Header.astro`
- Modify: `webpage/src/styles/global.css`
- Test: `webpage/tests/site-contract.test.mjs`

**Interfaces:**
- `SiteLayout` accepts `theme?: 'ink' | 'paper' | 'system'`; docs default to `system`, while homepage callers retain `ink`.
- `Header` accepts `showThemeToggle?: boolean` and renders `ThemeToggle` only for system-aware layouts.
- `theme.ts` consumes `resolveTheme`, `nextTheme`, and `THEME_STORAGE_KEY` and binds `[data-theme-toggle]`.

- [ ] **Step 1: Extend the site contract with failing assertions**

Add assertions that `SiteLayout.astro` contains `theme?: 'ink' | 'paper' | 'system'`, the header contains `data-theme-toggle`, and the layout imports `theme-state.mjs` through `theme.ts`.

Run: `cd webpage && node --test tests/site-contract.test.mjs`

Expected: FAIL because the system theme mode and toggle do not exist.

- [ ] **Step 2: Implement the pre-paint theme bootstrap**

Place an inline script immediately after `<body>` opens. It must read `body.dataset.themeMode`, `localStorage.getItem(THEME_STORAGE_KEY)`, and `matchMedia('(prefers-color-scheme: dark)')`, then update the body class before the header markup is painted:

```js
const mode = document.body.dataset.themeMode;
if (mode === 'system') {
  const stored = localStorage.getItem('bornengine-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = stored === 'ink' || stored === 'paper' ? stored : prefersDark ? 'ink' : 'paper';
  document.body.classList.remove('theme-paper', 'theme-ink');
  document.body.classList.add(`theme-${resolved}`);
}
```

Keep fixed `ink` and `paper` layouts unchanged.

- [ ] **Step 3: Implement the accessible toggle and runtime synchronization**

`ThemeToggle.astro` must render a real button with `data-theme-toggle`, `aria-pressed="false"`, a visually hidden label, and a non-text icon. `theme.ts` must:

```ts
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const body = document.body;
const current = () => body.classList.contains('theme-ink') ? 'ink' : 'paper';

button?.addEventListener('click', () => {
  const theme = nextTheme(current());
  body.classList.remove('theme-paper', 'theme-ink');
  body.classList.add(`theme-${theme}`);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  button.setAttribute('aria-pressed', String(theme === 'ink'));
  button.setAttribute('aria-label', theme === 'ink' ? 'Switch to light mode' : 'Switch to dark mode');
});
```

Also initialize the label/state and, only while no stored choice exists, update the theme when the system media query changes.

- [ ] **Step 4: Style the control in both header modes and mobile navigation**

Add `.theme-toggle`, `.theme-toggle__icon`, and dark/paper overrides in `global.css`. The control must inherit the header's contrast, keep a minimum 44px hit target, and remain visible beside Search on desktop and inside the stacked menu on mobile.

- [ ] **Step 5: Run the contract and Astro type check**

Run: `cd webpage && node --test tests/theme-contract.test.mjs tests/site-contract.test.mjs && npm run check`

Expected: all focused tests pass and Astro reports 0 errors, warnings, and hints.

- [ ] **Step 6: Commit the theme UI**

```bash
git add webpage/src/components/ThemeToggle.astro webpage/src/scripts/theme.ts webpage/src/layouts/SiteLayout.astro webpage/src/components/Header.astro webpage/src/styles/global.css webpage/tests/site-contract.test.mjs
git commit -m "feat: add system-aware docs theme toggle"
```

### Task 3: Make the documentation palette coherent in ink mode

**Files:**
- Modify: `webpage/src/styles/tokens.css`
- Modify: `webpage/src/styles/docs.css`
- Modify: `webpage/src/styles/global.css`
- Test: `webpage/tests/site-contract.test.mjs`

**Interfaces:**
- Produces semantic `--docs-*` tokens for canvas, text, muted text, border, elevated surface, active navigation, inline code, and code blocks.
- Consumes `theme-paper` and `theme-ink` body classes from Task 2.

- [ ] **Step 1: Add failing dark-palette assertions**

Assert that `tokens.css` contains `--docs-canvas`, `--docs-text`, and `--docs-code-surface`, and that `docs.css` contains `.theme-ink .docs-article` and `.theme-ink .docs-sidebar__group a` overrides.

Run: `cd webpage && node --test tests/site-contract.test.mjs`

Expected: FAIL because the docs-specific tokens and dark selectors do not exist.

- [ ] **Step 2: Define the paired token values**

Add paper values such as `--docs-canvas: var(--paper-50)`, `--docs-text: var(--ink-950)`, `--docs-muted: var(--slate-700)`, `--docs-border: var(--line-light)`, `--docs-elevated: var(--paper-100)`, and `--docs-code-surface: var(--ink-900)`. Add `.theme-ink` overrides with `--docs-canvas: var(--ink-950)`, `--docs-text: var(--paper-50)`, `--docs-muted: #b9c2c8`, `--docs-border: var(--line-dark)`, `--docs-elevated: var(--ink-900)`, and `--docs-code-surface: #0d1217`.

- [ ] **Step 3: Replace hard-coded docs colors with semantic tokens**

Update sidebar links, active state, breadcrumbs, article lede/body, inline code, blockquotes, tables, TOC, related links, prev/next links, mobile toolbar/sidebar, and search dialog to consume the docs tokens. Add explicit `.theme-ink` selectors for inherited browser defaults where the token is not enough.

- [ ] **Step 4: Run build-level style checks**

Run: `cd webpage && npm run check && npm test`

Expected: content validation and all tests pass.

- [ ] **Step 5: Commit the docs palette**

```bash
git add webpage/src/styles/tokens.css webpage/src/styles/docs.css webpage/src/styles/global.css webpage/tests/site-contract.test.mjs
git commit -m "fix: make documentation palette theme aware"
```

### Task 4: Share Monaco code fences between Markdown and the homepage

**Files:**
- Create: `webpage/src/plugins/rehype-code-block.mjs`
- Create: `webpage/src/styles/code-block.css`
- Create: `webpage/tests/code-block-contract.test.mjs`
- Modify: `webpage/astro.config.mjs`
- Modify: `webpage/src/components/CodeBlock.astro`
- Modify: `webpage/src/layouts/SiteLayout.astro`
- Modify: `webpage/src/scripts/copy-code.ts`
- Modify: `webpage/src/scripts/monaco-code.mjs`
- Modify: `webpage/src/styles/homepage.css`
- Modify: `webpage/src/styles/docs.css`

**Interfaces:**
- `rehypeCodeBlock()` mutates a HAST root by replacing each Markdown `pre > code` element with a `figure.code-block` containing `data-code-block`, `data-monaco-code`, `data-monaco-language`, `data-monaco-editor`, and `data-monaco-fallback`.
- The existing homepage `CodeBlock` emits the same attributes.
- `monaco-code.mjs` consumes those attributes, preserves the fallback, and uses the existing `monacoLanguage` mapping.

- [ ] **Step 1: Write the failing HAST transformation test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import rehypeCodeBlock from '../src/plugins/rehype-code-block.mjs';

test('wraps a TypeScript fence in the shared code block contract', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'code',
        properties: { className: ['language-ts'] },
        children: [{ type: 'text', value: 'const answer: number = 42;' }],
      }],
    }],
  };

  rehypeCodeBlock()(tree);
  const figure = tree.children[0];
  assert.equal(figure.tagName, 'figure');
  assert.ok(figure.properties.dataCodeBlock);
  assert.ok(figure.properties.dataMonacoCode);
  assert.equal(figure.properties.dataMonacoLanguage, 'typescript');
  assert.equal(figure.children[1].properties.dataMonacoEditor, true);
  assert.equal(figure.children[2].properties.dataMonacoFallback, true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd webpage && node --test tests/code-block-contract.test.mjs`

Expected: FAIL because the rehype plugin does not exist.

- [ ] **Step 3: Implement the HAST transformer**

Walk only element children, detect `pre` whose first meaningful child is `code`, normalize aliases (`ts` → `typescript`, `js` → `javascript`, `sh`/`bash` → `shell`, and missing language → `plaintext`), and replace the node with:

```js
{
  type: 'element',
  tagName: 'figure',
  properties: {
    className: ['code-block', 'code-block--docs'],
    dataCodeBlock: true,
    dataMonacoCode: true,
    dataMonacoLanguage: language,
  },
  children: [
    { type: 'element', tagName: 'figcaption', properties: {}, children: [/* language, Copy, status */] },
    { type: 'element', tagName: 'div', properties: { className: ['code-block__monaco'], dataMonacoEditor: true, ariaHidden: 'true' }, children: [] },
    { ...originalPre, properties: { ...originalPre.properties, dataMonacoFallback: true } },
  ],
}
```

Preserve the original Shiki/code children inside the fallback and never put source text in a data attribute.

- [ ] **Step 4: Register the plugin and extract shared styles**

Configure `mdx({ rehypePlugins: [rehypeCodeBlock] })` in `astro.config.mjs`. Move shared `.code-block` caption, copy button, fallback, Monaco mount, and ready-state styles into `code-block.css`, import it from `SiteLayout.astro`, and leave only homepage-specific sizing in `homepage.css`. Add docs-specific spacing in `docs.css` without duplicating the contract.

- [ ] **Step 5: Keep copying and Monaco compatible with transformed fences**

Make `copy-code.ts` bind both homepage and transformed figures, always read `block.querySelector('code').textContent`, and never depend on `data-code`. Make `monaco-code.mjs` accept the transformed language aliases and retain the static fallback on import/editor failure.

- [ ] **Step 6: Build the generated HTML and run focused tests**

Run: `cd webpage && node --test tests/code-block-contract.test.mjs tests/monaco-contract.test.mjs && npm run build`

Expected: the built docs HTML contains `data-monaco-editor`, `data-monaco-fallback`, and a Copy button around Markdown fences; the build completes with the existing lazy Monaco chunk warning only.

- [ ] **Step 7: Commit the shared fence implementation**

```bash
git add webpage/src/plugins/rehype-code-block.mjs webpage/src/styles/code-block.css webpage/src/components/CodeBlock.astro webpage/src/layouts/SiteLayout.astro webpage/src/scripts/copy-code.ts webpage/src/scripts/monaco-code.mjs webpage/src/styles/homepage.css webpage/src/styles/docs.css webpage/astro.config.mjs webpage/tests/code-block-contract.test.mjs
git commit -m "feat: enhance documentation code fences"
```

### Task 5: Add coverage metadata and enforce useful module pages

**Files:**
- Create: `webpage/src/data/docs-coverage.mjs`
- Create: `webpage/tests/docs-coverage.test.mjs`
- Modify: `webpage/scripts/validate-content.mjs`
- Modify: `webpage/src/data/navigation.ts`

**Interfaces:**
- `apiCoverage` lists the exact 12 module files, their route, and required section labels.
- `recipeCoverage` lists the exact recipe files and routes.
- Validation reads `src/content/docs/**/*.md`, `apiCoverage`, and `recipeCoverage`; it fails on missing files, missing navigation hrefs, fewer than two TypeScript fences, or missing `##` sections named in the coverage map.

- [ ] **Step 1: Write failing coverage tests against the current shallow pages**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { apiCoverage, recipeCoverage } from '../src/data/docs-coverage.mjs';

test('declares every public module and recipe route', () => {
  assert.equal(apiCoverage.length, 12);
  assert.deepEqual(apiCoverage.map((item) => item.slug), [
    'core', 'shapes', 'textures', 'text', 'audio', 'models', 'math',
    'scene', 'physics', 'vfx', 'world', 'mobile',
  ]);
  assert.deepEqual(recipeCoverage.map((item) => item.slug), [
    '2d-game', '3d-scene', 'physics-gameplay', 'assets-and-worlds', 'audio-and-ui',
  ]);
});
```

Run: `cd webpage && node --test tests/docs-coverage.test.mjs`

Expected: FAIL because the coverage module does not exist.

- [ ] **Step 2: Define the coverage map**

Use these API section requirements: Core (`Frame lifecycle`, `Input`, `Cameras and coordinates`, `Files and profiling`); Shapes (`Drawing`, `Collision helpers`); Textures (`Loading`, `Sampling`, `Render textures`); Text (`Default font`, `Font handles`, `Measurement`); Audio (`Device lifecycle`, `Sound`, `Music and spatial audio`); Models (`Loading`, `Primitives`, `Materials and animation`); Math (`Vectors`, `Transforms`, `Intersections`); Scene (`Nodes`, `Geometry and materials`, `Picking and lights`); Physics (`World stepping`, `Shapes and bodies`, `Queries and constraints`, `Characters`); VFX (`Particles`, `Decals`); World (`Schema`, `Loading and instantiation`, `Environment and ownership`); Mobile (`Joystick`, `Buttons`, `Touch claims`).

Use recipe sections `Setup`, `Game loop`, `Complete example`, and `Next steps`.

- [ ] **Step 3: Implement validation and navigation assertions**

Add coverage checks to `validate-content.mjs` and the Node test suite. Update `navigation.ts` with a `Recipes` group containing `/docs/guides/2d-game/`, `/docs/guides/3d-scene/`, `/docs/guides/physics-gameplay/`, `/docs/guides/assets-and-worlds/`, and `/docs/guides/audio-and-ui/`.

- [ ] **Step 4: Run the test and validator in red-to-green order**

Run: `cd webpage && node --test tests/docs-coverage.test.mjs && npm run validate:dist`

Expected: the coverage test stays red until the content tasks add the five recipe pages and required headings; after those tasks it becomes green.

- [ ] **Step 5: Commit the coverage contract**

```bash
git add webpage/src/data/docs-coverage.mjs webpage/tests/docs-coverage.test.mjs webpage/scripts/validate-content.mjs webpage/src/data/navigation.ts
git commit -m "test: define documentation coverage contract"
```

### Task 6: Expand foundational API documentation

**Files:**
- Modify: `webpage/src/content/docs/api/index.md`
- Modify: `webpage/src/content/docs/api/core.md`
- Modify: `webpage/src/content/docs/api/shapes.md`
- Modify: `webpage/src/content/docs/api/textures.md`
- Modify: `webpage/src/content/docs/api/text.md`
- Modify: `webpage/src/content/docs/api/math.md`

**Interfaces:**
- Every page uses the section names from `apiCoverage`.
- Every TypeScript snippet imports from `@bornengine/engine/<module>` or the root package and matches the source signatures.

- [ ] **Step 1: Add failing content assertions for the five foundational modules**

Extend `docs-coverage.test.mjs` to require at least two fenced TypeScript examples and every declared heading in each of the five files. Run `cd webpage && node --test tests/docs-coverage.test.mjs`; expected: FAIL on missing headings/examples.

- [ ] **Step 2: Expand Core and the API overview**

Add a root-vs-subpath import section, a complete frame example using `initWindow`, `setTargetFPS`, `windowShouldClose`, `beginDrawing`, `clearBackground`, `getDeltaTime`, and `endDrawing`, a callback example using `runGame`, and practical tables for `Key`, mouse/touch input, camera modes, file helpers, and profiler functions. State that handles/resources must be explicitly released and that Web/WASM uses `runGame` where the browser owns the frame loop.

- [ ] **Step 3: Expand Shapes, Textures, Text, and Math**

Use verified examples for a 2D collision loop (`drawRect` + `checkCollisionRecs`), sprite loading/filtering/rendering (`loadTexture`, `setTextureFilter`, `drawTexturePro`, `unloadTexture`), off-screen rendering (`loadRenderTexture`, `beginTextureMode`, `endTextureMode`), custom font measurement (`loadFont`, `drawTextEx`, `measureTextEx`, `unloadFont`), vector/matrix camera setup (`vec3`, `vec3Normalize`, `mat4LookAt`), and ray/intersection helpers. Include argument tables and coordinate/color conventions.

- [ ] **Step 4: Build the pages and run coverage tests**

Run: `cd webpage && node --test tests/docs-coverage.test.mjs && npm run check`

Expected: the five foundational pages pass their required sections and no invalid content links are reported.

- [ ] **Step 5: Commit the foundational content**

```bash
git add webpage/src/content/docs/api/index.md webpage/src/content/docs/api/core.md webpage/src/content/docs/api/shapes.md webpage/src/content/docs/api/textures.md webpage/src/content/docs/api/text.md webpage/src/content/docs/api/math.md
git commit -m "docs: expand core drawing and math API"
```

### Task 7: Expand asset, scene, and audio API documentation

**Files:**
- Modify: `webpage/src/content/docs/api/audio.md`
- Modify: `webpage/src/content/docs/api/models.md`
- Modify: `webpage/src/content/docs/api/scene.md`

**Interfaces:**
- Snippets use `@bornengine/engine/audio`, `/models`, and `/scene` exports exactly as declared in source.
- Related links point to existing asset, skeletal animation, and platform routes.

- [ ] **Step 1: Add the required section assertions**

Run the focused coverage test and confirm these three files fail until their required headings and snippets are present.

- [ ] **Step 2: Document Audio ownership and frame rules**

Add device init/close, short sound loading/playback, music streaming with `updateMusicStream`, 3D listener setup, bus gain/ducking/reverb, async staging, and native/Web format notes. Include a teardown snippet that closes audio after the main loop.

- [ ] **Step 3: Document Models and materials**

Add model load/draw/unload, primitive drawing, mesh/material compilation, PBR/material texture arrays, instancing, planar reflection, procedural sky, and skeletal animation lifecycle with `loadModelAnimation`, `instantiateAnimation`, `animPlay`, `animUpdate`, and `animFinished`. Include explicit resource ownership rules.

- [ ] **Step 4: Document the retained Scene graph**

Add node creation/destruction, TRS transforms, geometry upload layout, color/PBR/texture assignment, parent/visibility/shadow flags, directional/point lights, frame callbacks, projection/picking, and post-FX selection. Include one complete node setup and cleanup example.

- [ ] **Step 5: Run checks and commit**

Run: `cd webpage && node --test tests/docs-coverage.test.mjs && npm run check && npm test`

```bash
git add webpage/src/content/docs/api/audio.md webpage/src/content/docs/api/models.md webpage/src/content/docs/api/scene.md
git commit -m "docs: expand asset scene and audio API"
```

### Task 8: Expand physics, VFX, world, and mobile documentation

**Files:**
- Modify: `webpage/src/content/docs/api/physics.md`
- Modify: `webpage/src/content/docs/api/vfx.md`
- Modify: `webpage/src/content/docs/api/world.md`
- Modify: `webpage/src/content/docs/api/mobile.md`

**Interfaces:**
- Physics examples use `createWorld`, `setGravity`, `sphereShape`, `createBody`, `step`, `getBodyPosition`, and `destroyWorld` from `@bornengine/engine/physics`.
- World examples use the actual `loadWorld`, `instantiateWorld`, and `applyWorldEnvironment` contract and schema version 2.

- [ ] **Step 1: Add the required section assertions**

Run: `cd webpage && node --test tests/docs-coverage.test.mjs`; expected: these four pages fail until their declared sections exist.

- [ ] **Step 2: Document physics from world creation through gameplay**

Cover fixed/variable stepping, body configs and motion types, reusable shapes, forces/impulses, layers, CCD/sensors, transforms, raycasts/overlaps, contacts, constraints, characters, soft bodies, and vehicles. Include a complete fixed-step accumulator example and cleanup order.

- [ ] **Step 3: Document VFX lifetime and GPU consumption**

Cover `ParticleConfig`, creation/configuration, emission/update, instance-buffer consumption, clear/count budgeting, decals, and frame ordering. Include one smoke-style system and one decal lifecycle snippet.

- [ ] **Step 4: Document versioned worlds and mobile controls**

Explain world JSON schema, validation/migration, prefab expansion, applying environment every frame, and ownership callbacks. Add virtual joystick/button creation, update/draw ordering, movement input, touch claim reset, and sparse touch-slot guidance.

- [ ] **Step 5: Run checks and commit**

Run: `cd webpage && node --test tests/docs-coverage.test.mjs && npm run check && npm test`

```bash
git add webpage/src/content/docs/api/physics.md webpage/src/content/docs/api/vfx.md webpage/src/content/docs/api/world.md webpage/src/content/docs/api/mobile.md
git commit -m "docs: expand gameplay systems API"
```

### Task 9: Add complete composition recipes and navigation

**Files:**
- Create: `webpage/src/content/docs/guides/2d-game.md`
- Create: `webpage/src/content/docs/guides/3d-scene.md`
- Create: `webpage/src/content/docs/guides/physics-gameplay.md`
- Create: `webpage/src/content/docs/guides/assets-and-worlds.md`
- Create: `webpage/src/content/docs/guides/audio-and-ui.md`
- Modify: `webpage/src/data/navigation.ts`
- Modify: `webpage/src/content/docs/guides/index.md`

**Interfaces:**
- Each recipe has frontmatter `title`, `description`, `section: Guides`, and a unique numeric `order`.
- Each recipe contains `## Setup`, `## Game loop`, `## Complete example`, and `## Next steps`.
- Every snippet uses the module imports and function names documented in Tasks 6–8.

- [ ] **Step 1: Add the recipe files with failing coverage**

Create the five frontmatter blocks and section headings with no complete code yet. Run `cd webpage && node --test tests/docs-coverage.test.mjs`; expected: fail because each recipe needs at least two TypeScript fences.

- [ ] **Step 2: Write the 2D and 3D recipes**

The 2D recipe composes `initWindow`, `getDeltaTime`, keyboard input, `drawRect`, `drawTexture`, collision helpers, and `drawText`. The 3D recipe composes `beginMode3D`, `drawGrid`, `createSceneNode`, `setSceneNodeTrs`, `setSceneNodePbr`, model/primitive drawing, and cleanup.

- [ ] **Step 3: Write the physics, assets/world, and audio/UI recipes**

The physics recipe uses a fixed-step accumulator and synchronizes render transforms. The assets/world recipe shows stable `assets/` paths, texture/model loading, `loadWorld`, prefab/model callbacks, and environment application. The audio/UI recipe shows audio init, sound/music ownership, input-driven UI drawing, font measurement, and teardown.

- [ ] **Step 4: Link recipes from the guides landing page and sidebar**

Use the exact routes from `recipeCoverage` in the `Guides` navigation group and add a guide card/list to `guides/index.md`. Add cross-links from the relevant API pages and platform notes.

- [ ] **Step 5: Run route/content checks and commit**

Run: `cd webpage && npm run check && node --test tests/docs-coverage.test.mjs && npm run build && npm run validate:dist`

```bash
git add webpage/src/content/docs/guides/2d-game.md webpage/src/content/docs/guides/3d-scene.md webpage/src/content/docs/guides/physics-gameplay.md webpage/src/content/docs/guides/assets-and-worlds.md webpage/src/content/docs/guides/audio-and-ui.md webpage/src/data/navigation.ts webpage/src/content/docs/guides/index.md
git commit -m "docs: add engine composition recipes"
```

### Task 10: Run the complete verification and publish

**Files:**
- Modify only files required by verification fixes from Tasks 1–9.

**Interfaces:**
- The existing `webpage` scripts remain the source of truth for local and CI verification.
- The existing `.github/workflows/docs.yml` remains the deployment path.

- [ ] **Step 1: Run all local checks from a clean generated state**

```bash
cd webpage
npm test
npm run check
npm run build
npm run validate:dist
```

Expected: tests pass, Astro reports zero diagnostics, the build emits 44+ HTML pages with Pagefind, and distribution validation passes.

- [ ] **Step 2: Inspect the generated contracts**

Confirm that the homepage remains `data-theme="ink"`, docs HTML contains `data-monaco-code`, `data-monaco-editor`, `data-monaco-fallback`, and Copy controls, and both `theme-paper` and `theme-ink` docs selectors exist in generated CSS.

- [ ] **Step 3: Run the final diff checks without staging `ffi.rs`**

```bash
git diff --check
git status --short
git diff --cached --name-only
```

Expected: only `webpage/**` and intended docs files are staged; `native/shared/src/ffi.rs` remains an unstaged pre-existing modification.

- [ ] **Step 4: Push the implementation commits to `main`**

```bash
git push origin main
gh run list --repo RuanFernandes/BornEngine --workflow docs.yml --limit 1 --json databaseId,status,conclusion,headSha,url
```

Wait for the docs workflow to finish successfully, then verify `https://ruanfernandes.github.io/BornEngine/`, `/docs/api/core/`, and `/docs/guides/2d-game/` return HTTP 200 and contain the generated theme/code markers.
