# Documentation Theme and API Coverage Design

## Context

The documentation site currently renders every documentation route with the
paper theme. The global stylesheet contains a `prefers-color-scheme` hint, but
the docs do not resolve that preference into component colors and there is no
user-facing theme control. Code fences are static Markdown output, while the
homepage has a separate Monaco-enabled code block.

The public engine surface is substantially broader than the current prose:
core/window and input, 2D drawing, textures, text, audio, models/materials,
math, scene graph, physics, VFX, world data, and mobile controls. The source
of truth for all API examples is the TypeScript under `src/*/index.ts`; legacy
examples using the `bloom` package name are not documentation sources.

## Goals

- Make documentation routes respect the operating-system light/dark
  preference on first visit.
- Add an accessible Light/Dark toggle that persists the user's choice and
  updates all documentation surfaces consistently.
- Keep the homepage's intentionally dark visual direction unchanged.
- Give every Markdown code fence the same Copy + Monaco read-only treatment as
  the homepage, while preserving static HTML as an accessible and indexable
  fallback.
- Expand the docs so every public engine module has a useful learning path,
  verified snippets, lifecycle guidance, target notes, and practical links.
- Add complete recipes that show how the modules compose into real games.
- Keep the site static, lightweight on first load, SEO-friendly, and compatible
  with the existing GitHub Pages build.

## Non-goals

- Do not generate a TypeScript declaration website for every exported symbol.
- Do not replace the existing Astro/content-collection architecture.
- Do not change engine runtime behavior or rename the package in source code.
- Do not make Monaco an editable playground or add a server-side execution
  service.
- Do not make the homepage follow the docs theme automatically.

## Design

### Theme resolution

Documentation layouts use a `system` theme mode by default. A small inline
bootstrap runs before the header is painted, resolves the stored preference or
`prefers-color-scheme`, and applies the resolved `theme-paper` or `theme-ink`
class. The header exposes a button with an accessible label and pressed state.
The choice is stored under a BornEngine-specific local-storage key; clearing
that key returns the route to system preference behavior.

Documentation CSS uses semantic docs tokens for canvas, text, muted text,
border, elevated surface, active navigation, inline code, and code blocks. The
tokens have explicit paper and ink values, so the sidebar, article, table,
breadcrumb, table-of-contents, mobile menu, search dialog, and footer all
change together. The fixed ink homepage keeps its current class and palette.

### Shared code fences

A rehype transformation wraps Markdown `<pre><code>` output in the existing
code-block contract. It adds a filename/language caption, copy button, a
`data-monaco-editor` mount point, and the original highlighted `<pre>` as the
fallback. The existing CodeBlock component uses the same contract, so the
homepage and docs share one client behavior and one visual surface.

The Monaco client keeps the fallback visible until initialization succeeds,
loads the editor only near the viewport, loads language definitions on demand,
and uses read-only options with no minimap or editing context menu. If Monaco
cannot load, the static fence remains fully usable. Copy always reads the
fallback code text, so it works before and after enhancement.

### Documentation information architecture

The existing API pages remain the module landing pages. Each module page is
expanded with a consistent sequence: import boundary, mental model, minimal
example, lifecycle/ownership rules, key function groups, platform caveats,
failure modes, and related links. The covered modules are Core, Shapes,
Textures, Text, Audio, Models, Math, Scene, Physics, VFX, World, and Mobile.

New recipe pages cover a small 2D game, a retained 3D scene, physics gameplay,
asset/world composition, and audio/UI integration. Each recipe starts from a
known CLI project shape and uses only exports verified in the engine source.

The navigation keeps the current groups but adds the recipes where they help a
reader choose a next step. API pages use concise function tables rather than
duplicating every declaration; deeper behavior stays in focused guides.

## Verification

- Unit tests cover theme resolution, persistence decisions, code-fence
  transformation, and Monaco language configuration.
- Content validation checks that all public module pages and recipe routes are
  represented in navigation and contain the required practical sections.
- `npm run check`, `npm test`, `npm run build`, and `npm run validate:dist` must
  pass before deployment.
- The GitHub Pages workflow remains the only publishing path and must complete
  successfully for the final commit.
