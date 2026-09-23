# BornEngine Webpage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The execution method is native implementation in the current checkout; do not delegate additional site work.

**Goal:** Build and publish a lightweight, SEO-optimized, multi-page BornEngine homepage and documentation portal under `webpage/`, including the complete BornEngine CLI onboarding/reference, a generated brand mark, and GitHub Pages CI/CD.

**Architecture:** Use Astro to pre-render a static homepage and Markdown/MDX documentation pages. Shared layouts own metadata, navigation, breadcrumbs, table of contents, code blocks, and responsive behavior; small data modules own navigation, prerequisites, and the verified CLI command inventory. Pagefind adds a static search index after the production build, while native CSS/SVG and small browser modules provide motion and interaction without a client-side SPA.

**Tech Stack:** Astro static output, `@astrojs/mdx`, `@astrojs/sitemap`, Pagefind, TypeScript, Node's built-in test runner, CSS/SVG, GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-09-23-bornengine-webpage-design.md`

## Global Constraints

- English is the primary documentation language; Portuguese translation is out of scope for this release.
- The homepage is `/`; documentation begins at `/docs/` with stable trailing-slash routes.
- The site is pre-rendered static HTML and must retain useful navigation when JavaScript is disabled.
- The visual system uses the approved ink/paper/acid palette, editorial rules, restrained diagrams, and purposeful motion; no generic SaaS card wall, fake metrics, testimonials, glassmorphism, or decorative particle field.
- Motion must respect `prefers-reduced-motion: reduce` and must not be required to understand content.
- Every CLI command, option, default, example, and platform limitation must be verified against the current BornEngine and `bornengine-cli` repositories.
- Getting Started must state required software, show verification commands, provide installation commands where BornEngine already defines them, and link to official third-party installation documentation.
- The generated BornEngine mark is a project asset; the site renders the wordmark as real text/SVG and the root README references the mark with no generator or AI attribution.
- SEO output includes unique metadata, canonical URLs, Open Graph/Twitter metadata, sitemap output, robots instructions, structured breadcrumbs, a social preview asset, and a custom 404 page.
- Do not modify or stage the pre-existing user change in `native/shared/src/ffi.rs`.
- Use the configured Git identity and do not add AI attribution, trailers, comments, metadata, or credits to project artifacts.
- CI installs from a committed lockfile, validates content, builds the production artifact, and deploys through GitHub Pages Actions.

## Review Focus

- GitHub Pages base-path links: links must work under `/BornEngine/` and with an empty base for a future custom domain; cover with `site.ts` and distribution-contract tests in Tasks 2 and 8.
- CLI command omissions or invented flags: the command inventory must include all 22 command IDs from `bornengine-cli`; cover with the failing inventory test and JSON contract in Task 3.
- Missing or misleading setup requirements: Getting Started must distinguish CLI, native, Web/WASM, Apple, Android, Windows, and Linux requirements and include official installation links; cover with prerequisite contract tests in Task 3 and content checks in Task 5.
- JavaScript-disabled and reduced-motion behavior: ordinary links, readable code, skip navigation, and non-looping reduced-motion CSS must remain available; cover with the interaction tests in Task 6 and manual keyboard/mobile verification in Task 9.
- Broken routes or metadata: every navigation target must resolve, every page needs a title/description/`h1`, and `robots.txt`/sitemap/404 must exist; cover with distribution validation in Task 8 and the final build in Task 9.

## File Map

Create or modify only the following site-facing files, plus the root README and the Pages workflow:

```text
webpage/
  public/
    brand/bornengine-mark.png                # Existing generated mark; reuse it.
    favicon.svg
    og-image.svg
  src/
    components/
      Brand.astro
      Breadcrumbs.astro
      Callout.astro
      CodeBlock.astro
      CommandReference.astro
      DocsSidebar.astro
      Footer.astro
      Header.astro
      PlatformRail.astro
      PrevNext.astro
      RuntimeDiagram.astro
      SearchDialog.astro
      TableOfContents.astro
    content/docs/                          # Authored English documentation pages.
    data/
      cli-commands.json
      navigation.ts
      prerequisites.json
      site.ts
    layouts/
      DocsLayout.astro
      SiteLayout.astro
    pages/
      404.astro
      index.astro
      robots.txt.ts
      docs/index.astro
      docs/[...slug].astro
    scripts/
      interaction-state.mjs
      copy-code.ts
      docs-navigation.ts
      search.ts
    styles/
      docs.css
      global.css
      homepage.css
      tokens.css
  scripts/
    content-contract.mjs
    validate-content.mjs
    validate-links.mjs
  tests/
    content-contract.test.mjs
    interaction-state.test.mjs
    site-contract.test.mjs
    dist-contract.test.mjs
  astro.config.mjs
  package.json
  package-lock.json
  tsconfig.json
.github/workflows/docs.yml
README.md
```

## Implementation Tasks

### Task 1: Scaffold the static site package

**Files:**
- Create: `webpage/package.json`
- Create: `webpage/astro.config.mjs`
- Create: `webpage/tsconfig.json`
- Create: `webpage/src/styles/tokens.css`
- Create: `webpage/src/styles/global.css`
- Preserve: `webpage/public/brand/bornengine-mark.png`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `check`, `test`, `validate:dist`, and `preview` for all later tasks.
- Produces an Astro config with `output: 'static'`, MDX integration, sitemap integration, `site`, `base`, and `trailingSlash: 'always'`.

- [ ] **Step 1: Create the package manifest and lockfile.**

Run:

```bash
cd webpage
npm init -y
npm install astro @astrojs/mdx @astrojs/sitemap pagefind
npm install --save-dev @astrojs/check typescript
```

Replace the generated scripts with this contract while retaining the versions written by npm:

```json
{
  "name": "@bornengine/docs-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && pagefind --site dist --output-subdir _pagefind",
    "check": "astro check && node scripts/validate-content.mjs",
    "test": "node --test tests",
    "validate:dist": "node scripts/validate-links.mjs",
    "preview": "astro preview"
  }
}
```

- [ ] **Step 2: Add the Astro configuration.**

Create `webpage/astro.config.mjs` with the repository Pages defaults and environment overrides:

```js
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://ruanfernandes.github.io';
const base = process.env.BASE_PATH ?? '/BornEngine';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
});
```

- [ ] **Step 3: Add strict TypeScript configuration and design tokens.**

Create `tsconfig.json` extending `astro/tsconfigs/strict`. Put the approved colors, layout widths, focus ring, code colors, and motion durations in `src/styles/tokens.css`; put reset, typography, links, focus, skip-link, code overflow, and reduced-motion rules in `src/styles/global.css`.

- [ ] **Step 4: Verify the scaffold before adding components.**

Run:

```bash
npx astro check
```

Expected: Astro check exits successfully with no source files to validate. Commit only the package scaffold and styles with `chore: scaffold BornEngine docs site`.

### Task 2: Add tested content and path contracts before production helpers

**Files:**
- Create: `webpage/tests/content-contract.test.mjs`
- Create: `webpage/scripts/content-contract.mjs`

**Interfaces:**
- Produces `REQUIRED_COMMAND_IDS`, `commandInventoryErrors(commands)`, and `prerequisiteErrors(entries)` for the data and validation tasks.
- `commandInventoryErrors` returns an array of human-readable error strings and returns `[]` for a complete inventory.
- `prerequisiteErrors` returns an array of missing/invalid prerequisite-field errors and returns `[]` for valid entries with HTTPS docs links and non-empty verification commands.

- [ ] **Step 1: Write the failing command-inventory and prerequisite tests.**

Create `tests/content-contract.test.mjs` with this test shape:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_COMMAND_IDS,
  commandInventoryErrors,
  prerequisiteErrors,
} from '../scripts/content-contract.mjs';

test('accepts the complete BornEngine CLI command inventory', () => {
  const commands = REQUIRED_COMMAND_IDS.map((id) => ({ id, title: id }));
  assert.deepEqual(commandInventoryErrors(commands), []);
});

test('reports an omitted nested CLI command', () => {
  const commands = REQUIRED_COMMAND_IDS
    .filter((id) => id !== 'engine/use')
    .map((id) => ({ id, title: id }));
  assert.deepEqual(commandInventoryErrors(commands), ['Missing CLI command: engine/use']);
});

test('requires official installation links and verification commands', () => {
  assert.deepEqual(prerequisiteErrors([
    { id: 'rust', docsUrl: 'https://rustup.rs/', verify: 'rustc --version' },
    { id: 'perry', docsUrl: 'https://docs.perryts.com/getting-started/installation.html', verify: 'perry --version' },
  ]), []);
  assert.deepEqual(prerequisiteErrors([
    { id: 'rust', docsUrl: 'rustup.rs', verify: '' },
  ]), [
    'rust must link to an HTTPS installation document',
    'rust must include a verification command',
  ]);
});
```

- [ ] **Step 2: Run the tests and confirm the expected red state.**

Run `npm test`. Expected: Node fails with `ERR_MODULE_NOT_FOUND` for `scripts/content-contract.mjs`; this demonstrates that the tests are testing a missing production helper rather than passing accidentally.

- [ ] **Step 3: Implement the smallest contract helper.**

Create `scripts/content-contract.mjs` with this exact required ID list:

```js
export const REQUIRED_COMMAND_IDS = [
  'create', 'new', 'init', 'build', 'run', 'dev', 'check',
  'clean', 'doctor', 'info', 'version',
  'engine/current', 'engine/install', 'engine/list', 'engine/update',
  'engine/remove', 'engine/use', 'upgrade', 'update',
  'config/set', 'config/get', 'config/list',
];

export function commandInventoryErrors(commands) {
  const present = new Set(commands.map(({ id }) => id));
  return REQUIRED_COMMAND_IDS
    .filter((id) => !present.has(id))
    .map((id) => `Missing CLI command: ${id}`);
}

export function prerequisiteErrors(entries) {
  const errors = [];
  for (const entry of entries) {
    if (!/^https:\/\//.test(entry.docsUrl ?? '')) {
      errors.push(`${entry.id} must link to an HTTPS installation document`);
    }
    if (!entry.verify?.trim()) {
      errors.push(`${entry.id} must include a verification command`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests and commit the green contract.**

Run `npm test`. Expected: 3 passing tests, 0 failures. Commit with `test: add webpage content contracts`.

### Task 3: Create data sources, navigation, and Getting Started prerequisite content

**Files:**
- Create: `webpage/src/data/site.ts`
- Create: `webpage/src/data/navigation.ts`
- Create: `webpage/src/data/cli-commands.json`
- Create: `webpage/src/data/prerequisites.json`
- Create: `webpage/src/content.config.ts`
- Create: `webpage/scripts/validate-content.mjs`
- Test: `webpage/tests/content-contract.test.mjs`

**Interfaces:**
- `site.ts` exports `siteName`, `repoUrl`, `cliRepoUrl`, `defaultSiteUrl`, `basePath`, and `withBase(path)`.
- `navigation.ts` exports grouped sidebar entries with `title`, `href`, and optional `children`.
- `cli-commands.json` contains one object per required ID with `id`, `group`, `title`, `summary`, `synopsis`, `examples`, `options`, `behavior`, and `related`.
- `prerequisites.json` contains the task matrix and official documentation URLs used by the installation page.
- `validate-content.mjs` exits with status 1 and prints every error when contracts fail; it exits 0 with a concise summary when they pass.

- [ ] **Step 1: Add the site configuration and base-path helper.**

Create `site.ts` with `defaultSiteUrl = 'https://ruanfernandes.github.io'`, `basePath = import.meta.env.BASE_URL`, and this path helper:

```ts
export function withBase(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${basePath.replace(/\/$/, '')}${normalized}` || '/';
}
```

Keep repository links exact: `https://github.com/RuanFernandes/BornEngine` and `https://github.com/RuanFernandes/bornengine-cli`.

- [ ] **Step 2: Add the verified CLI inventory.**

Create `cli-commands.json` with the 22 IDs required by Task 2. Use these synopsis contracts:

```text
create: bornengine create
new: bornengine new <project-name> [--package-manager <pnpm|npm|yarn>] [--engine-version <version>] [--engine-path <path>]
init: bornengine init [--package-manager <pnpm|npm|yarn>] [--engine-version <version>] [--engine-path <path>]
build: bornengine build <entry-file> [--name <output>] [--os <friendly-os> | --target <exact-target>]
run: bornengine run <entry-file> [--name <output>] [--os <friendly-os> | --target <exact-target>] [-- <program-args>]
dev: bornengine dev <entry-file> [--name <output>] [--os <friendly-os> | --target <exact-target>] [--watch]
check: bornengine check <entry-file> [--os <friendly-os> | --target <exact-target>]
clean: bornengine clean
doctor: bornengine doctor
info: bornengine info
version: bornengine version
engine/current: bornengine engine current
engine/install: bornengine engine install [version]
engine/list: bornengine engine list
engine/update: bornengine engine update
engine/remove: bornengine engine remove [version]
engine/use: bornengine engine use <version-or-path>
upgrade: bornengine upgrade [version] [--latest]
update: bornengine update
config/set: bornengine config set <key> <value>
config/get: bornengine config get <key>
config/list: bornengine config list
```

Document the global `--verbose`/`-v` count flag and the `--pm`, `--engine`, `-e`, `-n`, and `-o` aliases exactly as implemented. Do not document `bornengine create <name>` because `create` is interactive and takes no project-name argument.

- [ ] **Step 3: Add prerequisite data and official links.**

Create entries for `rust`, `node`, `npm`, `pnpm`, `yarn`, `perry`, `wasm-pack`, `xcode`, `android-studio`, `windows-toolchain`, and `linux-backend`. Each entry must contain a verified `docsUrl`, a concrete `verify` command, an `install` command when the BornEngine repositories define one, and a `scope` describing whether it is CLI, native, Web/WASM, Apple, Android, Windows, or Linux setup.

Use these repository-verified commands in the data:

```sh
cargo install --git https://github.com/RuanFernandes/bornengine-cli
npm install -g @perryts/perry
npm install --global pnpm
corepack enable
cargo install wasm-pack
sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev
```

Use official links from the approved spec for installation guidance; do not copy third-party setup instructions into the repository beyond the short command BornEngine actually relies on.

- [ ] **Step 4: Define the docs content schema and navigation data.**

The schema must require `title`, `description`, `section`, and `order`, with optional `editPath`, `previous`, and `next` fields. Navigation groups must cover Getting Started, Concepts, CLI, API, Platforms, Guides, Troubleshooting, and Reference, with the exact routes listed in the spec.

- [ ] **Step 5: Implement the content validator and extend the tests.**

`validate-content.mjs` must load the JSON data, call both contract helpers, verify that each required navigation href starts with `/docs/` or is an approved external URL, and check that every prerequisite entry has a title, scope, HTTPS docs URL, and verification command. Run:

```bash
npm test
npm run check
```

Expected: all contract tests pass and the validator reports the command inventory plus prerequisite count. Commit with `docs: add BornEngine site content contracts`.

### Task 4: Build the shared layout and visual system

**Files:**
- Create: `webpage/src/layouts/SiteLayout.astro`
- Create: `webpage/src/layouts/DocsLayout.astro`
- Create: `webpage/src/components/Brand.astro`
- Create: `webpage/src/components/Header.astro`
- Create: `webpage/src/components/Footer.astro`
- Create: `webpage/src/components/Breadcrumbs.astro`
- Create: `webpage/src/components/DocsSidebar.astro`
- Create: `webpage/src/components/TableOfContents.astro`
- Create: `webpage/src/components/PrevNext.astro`
- Modify: `webpage/src/styles/global.css`
- Create: `webpage/src/styles/docs.css`
- Create: `webpage/tests/site-contract.test.mjs`

**Interfaces:**
- `SiteLayout` accepts `title`, `description`, `canonicalPath`, `theme`, and optional `jsonLd` props.
- `DocsLayout` accepts the same metadata plus `section`, `headings`, `breadcrumbs`, `editPath`, `previous`, and `next`.
- `Brand` renders the mark asset with real `BornEngine` text and an accessible label; it never bakes text into the PNG.
- `DocsSidebar` consumes the navigation data and marks the current route with `aria-current="page"`.

- [ ] **Step 1: Write the failing site contract.**

Create `tests/site-contract.test.mjs` that reads the expected component/layout files and asserts their contract strings:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared layouts expose accessible metadata and navigation hooks', async () => {
  const [site, docs, sidebar] = await Promise.all([
    readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/DocsLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocsSidebar.astro', import.meta.url), 'utf8'),
  ]);
  assert.match(site, /<html[^>]+lang=["']en/);
  assert.match(site, /canonical/);
  assert.match(docs, /On this page/);
  assert.match(docs, /Breadcrumb/);
  assert.match(sidebar, /aria-current/);
});
```

- [ ] **Step 2: Run the test and confirm it fails because the layouts do not exist.**

Run `npm test`. Expected: the site contract fails with a missing `SiteLayout.astro` file.

- [ ] **Step 3: Implement the shared layouts and components.**

Use a semantic `header`/`nav`/`main`/`aside`/`article`/`footer` structure. Add the skip link before the header, a visible focus outline, canonical/meta tags, Open Graph fields, and `aria-current` state. Keep the docs reading column between 680px and 780px and collapse the right rail before the sidebar on tablet.

`Brand.astro` uses `/brand/bornengine-mark.png` for the mark and renders the wordmark as text. `Header.astro` links to `/`, `/docs/`, `/docs/cli/`, and the GitHub repository through `withBase`. `DocsLayout.astro` renders breadcrumbs, title, description, article content, in-page headings, related links, and previous/next links.

- [ ] **Step 4: Run the site contract and Astro check.**

Run `npm test` and `npx astro check`. Expected: the site contract passes and Astro reports no layout/type errors. Commit with `feat: add BornEngine documentation layout`.

### Task 5: Implement the homepage and all documentation content

**Files:**
- Create: `webpage/src/pages/index.astro`
- Create: `webpage/src/pages/docs/index.astro`
- Create: `webpage/src/pages/docs/[...slug].astro`
- Create: `webpage/src/content/docs/getting-started/index.md`
- Create: `webpage/src/content/docs/getting-started/installation.md`
- Create: `webpage/src/content/docs/getting-started/quickstart.md`
- Create: `webpage/src/content/docs/getting-started/project-structure.md`
- Create: `webpage/src/content/docs/concepts/game-loop.md`
- Create: `webpage/src/content/docs/concepts/api-shape.md`
- Create: `webpage/src/content/docs/concepts/assets.md`
- Create: `webpage/src/content/docs/cli/index.md`
- Create: `webpage/src/content/docs/cli/project.md`
- Create: `webpage/src/content/docs/cli/build.md`
- Create: `webpage/src/content/docs/cli/diagnostics.md`
- Create: `webpage/src/content/docs/cli/engine.md`
- Create: `webpage/src/content/docs/cli/configuration.md`
- Create: `webpage/src/content/docs/api/index.md`
- Create: `webpage/src/content/docs/api/core.md`
- Create: `webpage/src/content/docs/api/shapes.md`
- Create: `webpage/src/content/docs/api/textures.md`
- Create: `webpage/src/content/docs/api/text.md`
- Create: `webpage/src/content/docs/api/audio.md`
- Create: `webpage/src/content/docs/api/models.md`
- Create: `webpage/src/content/docs/api/math.md`
- Create: `webpage/src/content/docs/api/scene.md`
- Create: `webpage/src/content/docs/api/physics.md`
- Create: `webpage/src/content/docs/api/vfx.md`
- Create: `webpage/src/content/docs/api/world.md`
- Create: `webpage/src/content/docs/api/mobile.md`
- Create: `webpage/src/content/docs/platforms/index.md`
- Create: `webpage/src/content/docs/platforms/desktop.md`
- Create: `webpage/src/content/docs/platforms/apple.md`
- Create: `webpage/src/content/docs/platforms/mobile.md`
- Create: `webpage/src/content/docs/platforms/web-wasm.md`
- Create: `webpage/src/content/docs/guides/physics.md`
- Create: `webpage/src/content/docs/guides/skeletal-animation.md`
- Create: `webpage/src/content/docs/guides/world-format.md`
- Create: `webpage/src/content/docs/guides/assets.md`
- Create: `webpage/src/content/docs/troubleshooting.md`
- Create: `webpage/src/content/docs/reference/architecture.md`
- Create: `webpage/src/content/docs/reference/migration.md`
- Create: `webpage/src/components/RuntimeDiagram.astro`
- Create: `webpage/src/components/PlatformRail.astro`
- Create: `webpage/src/components/CodeBlock.astro`
- Create: `webpage/src/components/CommandReference.astro`
- Create: `webpage/src/components/Callout.astro`
- Create: `webpage/src/styles/homepage.css`

**Interfaces:**
- `[...slug].astro` maps content entries to trailing-slash routes and passes frontmatter metadata to `DocsLayout`.
- MDX content can use `CodeBlock`, `CommandReference`, and `Callout` components without importing client frameworks.
- `CommandReference` accepts a command group and renders every entry from `cli-commands.json` with the real synopsis, options, examples, behavior, and related links.

- [ ] **Step 1: Create the route renderer and docs landing page.**

Use Astro's content collection renderer to build static paths from `src/content/docs`. The docs landing page at `/docs/` must offer direct paths for new users, API readers, CLI users, platform builders, and troubleshooting. It must contain one `h1`, a short description, and ordinary links to all top-level sections.

- [ ] **Step 2: Write the Getting Started pages with verified setup instructions.**

The installation page must include the prerequisite matrix and these verified commands:

```sh
cargo install --git https://github.com/RuanFernandes/bornengine-cli
npm install -g @perryts/perry
npm install --global pnpm
bornengine doctor
```

The quickstart page must use the actual interactive flow:

```sh
bornengine create
# Enter MyGame when prompted
cd MyGame
bornengine run main.ts
```

It must also show the non-interactive path:

```sh
bornengine new MyGame --package-manager npm --engine-version 0.4.16
bornengine build main.ts --name my-game --os linux
```

Explain that `create` asks for the project name, package manager, and stable engine version; `new` is the scriptable path; scaffolding refuses to overwrite populated/conflicting files; `run` is for a native executable on the current host; Web/mobile outputs are build-only. Link to the official third-party installation documents from `prerequisites.json`.

- [ ] **Step 3: Write the concepts and API pages from the current source.**

Use this web-compatible example on the game-loop page and API introduction:

```ts
import {
  initWindow,
  runGame,
  clearBackground,
  drawText,
  Colors,
} from '@bornengine/engine';

initWindow(800, 450, 'My Game');

runGame(() => {
  clearBackground(Colors.SNOW);
  drawText('Hello, BornEngine!', 190, 200, 20, Colors.DARKGRAY);
});
```

Each module page must name its real import path and key public types/functions from the corresponding `src/*/index.ts`. Physics, world, scene, models, and mobile pages must link to the existing deeper guides instead of inventing a separate API.

- [ ] **Step 4: Write the CLI group pages from the command data.**

The project page covers `create`, `new`, and `init`; the build page covers `build`, `run`, `dev`, and `check`; diagnostics covers `clean`, `doctor`, `info`, and `version`; engine covers all `engine/*` commands plus `upgrade`; configuration covers `config set|get|list` and `update`. Include real examples from the CLI README such as:

```sh
bornengine dev main.ts --watch
bornengine config set package-manager pnpm
bornengine engine use ../BornEngine
bornengine engine use 0.4.16
```

Explain aliases and conflicts exactly: `--pm` aliases `--package-manager`, `--engine` aliases `--engine-path`, `-o`/`--os` conflicts with `--target`, and `run` only accepts native executables for the current host. Do not claim that `update` self-updates; it prints an installation instruction.

- [ ] **Step 5: Write platform, guide, troubleshooting, and reference pages.**

Use `docs/web-target.md`, the Apple target docs, `docs/physics.md`, `docs/skeletal-animation.md`, `docs/world-format.md`, and the CLI troubleshooting section as source material. The Web/WASM page must show the existing engine build command:

```sh
./native/web/build.sh main.ts
cd dist/web && python3 -m http.server 8080
```

State platform-specific limitations honestly, including the need for a macOS host for macOS builds, platform SDK/toolchain support for cross-compilation, and the Debian/Ubuntu Linux headers documented by the CLI.

- [ ] **Step 6: Implement the homepage composition and motion-ready styles.**

The homepage must contain the asymmetrical hero, the SVG runtime diagram, platform rail, CLI onboarding band, concise API sample, capability bands, and final links to Getting Started, CLI, API, and GitHub. Use real project claims only. The runtime diagram uses an SVG `playhead` element whose loop is disabled by the global reduced-motion media query.

- [ ] **Step 7: Build the production route set before moving on.**

Run:

```bash
npm run check
npm run build
```

Expected: Astro produces every route in the spec under `webpage/dist/`, no content schema errors occur, and Pagefind creates `dist/_pagefind/`. Commit with `feat: add BornEngine homepage and docs content`.

### Task 6: Add code blocks, search, menu, copy feedback, and motion enhancement

**Files:**
- Create: `webpage/src/scripts/interaction-state.mjs`
- Create: `webpage/tests/interaction-state.test.mjs`
- Create: `webpage/src/scripts/copy-code.ts`
- Create: `webpage/src/scripts/docs-navigation.ts`
- Create: `webpage/src/scripts/search.ts`
- Create: `webpage/src/components/SearchDialog.astro`
- Modify: `webpage/src/components/CodeBlock.astro`
- Modify: `webpage/src/components/Header.astro`
- Modify: `webpage/src/layouts/DocsLayout.astro`
- Modify: `webpage/src/styles/global.css`

**Interfaces:**
- `nextMenuState(isOpen)` returns the inverse boolean.
- `copyFeedback(success)` returns `{ label, liveMessage }` with separate success and failure text.
- Browser scripts progressively enhance ordinary links and controls; they do not own page routing.

- [ ] **Step 1: Write the failing interaction-state tests.**

Create the test before the helper:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFeedback, nextMenuState } from '../src/scripts/interaction-state.mjs';

test('menu state toggles predictably', () => {
  assert.equal(nextMenuState(false), true);
  assert.equal(nextMenuState(true), false);
});

test('copy feedback exposes accessible success and failure messages', () => {
  assert.deepEqual(copyFeedback(true), {
    label: 'Copied',
    liveMessage: 'Code copied to clipboard.',
  });
  assert.deepEqual(copyFeedback(false), {
    label: 'Copy failed',
    liveMessage: 'Copy failed. Select the code and copy it manually.',
  });
});
```

- [ ] **Step 2: Run the tests and verify the expected red state.**

Run `npm test`. Expected: Node reports that `interaction-state.mjs` is missing.

- [ ] **Step 3: Implement the helpers and browser enhancements.**

Implement the two pure functions with no DOM dependency. `copy-code.ts` reads only the nearest `code` element, uses `navigator.clipboard.writeText`, updates the button label, and writes the result to a visually-hidden `aria-live` element. `docs-navigation.ts` toggles the mobile sidebar with `aria-expanded`, closes it on an internal link activation, and observes the current section without replacing normal URL navigation. `search.ts` dynamically loads Pagefind's generated UI when the dialog opens and keeps the static navigation visible as the fallback.

Add a keyboard shortcut for `/` and `Cmd/Ctrl+K` that opens search unless focus is already in an input/textarea. Do not prevent browser find or typing in form controls. Add an IntersectionObserver only for reveal classes and disconnect it when reduced motion is active.

- [ ] **Step 4: Verify interaction tests and accessibility hooks.**

Run:

```bash
npm test
npx astro check
```

Expected: interaction and content tests pass. Inspect generated HTML for `aria-live`, `aria-expanded`, `aria-controls`, `aria-current`, keyboard-focusable buttons, and a skip link. Commit with `feat: add lightweight docs interactions`.

### Task 7: Add SEO assets, robots output, and the custom 404 page

**Files:**
- Create: `webpage/public/favicon.svg`
- Create: `webpage/public/og-image.svg`
- Create: `webpage/src/pages/robots.txt.ts`
- Create: `webpage/src/pages/404.astro`
- Modify: `webpage/src/layouts/SiteLayout.astro`
- Modify: `webpage/src/layouts/DocsLayout.astro`
- Create: `webpage/tests/dist-contract.test.mjs`

**Interfaces:**
- `robots.txt.ts` emits a plain-text response with `User-agent: *`, an allow rule, and an absolute sitemap URL based on the configured site/base.
- `SiteLayout` emits title, description, canonical, Open Graph, Twitter/X, favicon, and optional JSON-LD metadata.
- `DocsLayout` emits `BreadcrumbList` JSON-LD with the actual current route.

- [ ] **Step 1: Write the distribution-contract test before the SEO implementation.**

Create `tests/dist-contract.test.mjs` so it accepts a dist directory argument and checks `index.html`, `docs/index/index.html`, `404.html`, `robots.txt`, sitemap output, the Pagefind directory, and required metadata strings. Run it against a clean/nonexistent directory and confirm it fails with a list of missing artifacts.

- [ ] **Step 2: Implement SEO metadata and static assets.**

Create a simple SVG favicon using the BornEngine frame/playhead silhouette and an SVG social card with the real `BornEngine` wordmark, the phrase `Native games from TypeScript.`, and no unsupported metrics. Use the generated PNG mark in the card or homepage only when it does not inflate the critical path.

Add `robots.txt.ts` using `import.meta.env.SITE`/`import.meta.env.BASE_URL` or the site config helper so repository-path and custom-domain builds produce the correct absolute sitemap URL. Ensure the sitemap integration emits the configured canonical URLs.

Add JSON-LD only for real project information: `SoftwareApplication`/`Organization` fields that can be supported by the repository and `BreadcrumbList`/`TechArticle` fields derived from page data. Do not add ratings or aggregate values.

- [ ] **Step 3: Implement and run the distribution validator.**

`validate-links.mjs` must parse generated HTML, normalize links against the configured base path, ignore hashes and approved external URLs, and report missing local files. It must accept either a single sitemap file or the sitemap index/files emitted by the installed Astro integration, while requiring at least one sitemap artifact and a robots file that points to it.

Run:

```bash
npm run build
npm run validate:dist
```

Expected: all required routes and SEO assets pass. Commit with `feat: add BornEngine SEO and error pages`.

### Task 8: Add GitHub Pages CI/CD and README brand integration

**Files:**
- Create: `.github/workflows/docs.yml`
- Modify: `README.md`
- Modify: `webpage/package.json` only if the validator command needs a script alias

**Interfaces:**
- Pull requests validate and build the site without deploying.
- Pushes to `main` and manual dispatch build, upload, and deploy the Pages artifact.
- README displays the local generated mark and links to the documentation route without AI attribution.

- [ ] **Step 1: Add the README mark and documentation link.**

Immediately below the root title, add an accessible centered mark using the committed relative asset:

```html
<p align="center">
  <img src="webpage/public/brand/bornengine-mark.png" alt="BornEngine mark" width="96">
</p>
```

Keep the existing project description and lineage text unchanged. Add the documentation site to the existing BornEngine links using the verified Pages URL after the first successful deployment; before that verification, keep the repository-relative `webpage/` link.

- [ ] **Step 2: Add the workflow with separate validation and deployment jobs.**

Create `.github/workflows/docs.yml` with this shape:

```yaml
name: Documentation site

on:
  push:
    branches: [main]
    paths:
      - 'webpage/**'
      - '.github/workflows/docs.yml'
  pull_request:
    branches: [main]
    paths:
      - 'webpage/**'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: webpage
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: webpage/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run check
      - run: npm run build
      - run: npm run validate:dist
      - uses: actions/upload-pages-artifact@v3
        with:
          path: webpage/dist

  deploy:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Set `SITE_URL` and `BASE_PATH` in the build step environment only when the repository Pages path differs from the Astro defaults. Do not deploy pull-request builds.

- [ ] **Step 3: Validate workflow syntax and local scripts.**

Run:

```bash
npm test
npm run check
npm run build
npm run validate:dist
git diff --check
```

Review the workflow for least-privilege permissions and verify that the existing release/test workflows were not modified. Commit with `ci: deploy BornEngine docs to GitHub Pages`.

### Task 9: Final verification, commit aggregation, and deployment

**Files:**
- Verify: every file under `webpage/`, `.github/workflows/docs.yml`, `README.md`
- Preserve: `native/shared/src/ffi.rs`

**Interfaces:**
- A clean production build is the deployment artifact.
- The final push contains all site commits together while leaving the pre-existing native change uncommitted and unmodified.

- [ ] **Step 1: Run the complete local verification suite from the site directory.**

Run:

```bash
cd webpage
npm test
npm run check
npm run build
npm run validate:dist
```

Expected: every test and validation command exits 0; the build output contains the homepage, docs landing page, all listed docs routes, 404, robots, sitemap output, social/favicons, and Pagefind assets.

- [ ] **Step 2: Serve the production output and check real navigation.**

Run a local server from `webpage/dist` and inspect `/`, `/docs/`, `/docs/getting-started/installation/`, `/docs/cli/`, `/docs/api/physics/`, `/docs/platforms/web-wasm/`, `/404.html`, and a nested route under the repository base path. Check desktop and narrow viewport layouts, keyboard-only header/sidebar/search/copy flows, link focus, table/code overflow, and reduced-motion behavior. Confirm the generated PNG mark is visible and the README reference resolves.

- [ ] **Step 3: Confirm the unrelated native modification was preserved.**

Run:

```bash
git status --short
git diff -- native/shared/src/ffi.rs
git diff --name-only origin/main..HEAD
```

The native file must still be the only pre-existing modified path and must not appear in any site commit. Inspect the staged diff before committing the final README/workflow adjustments.

- [ ] **Step 4: Check GitHub authentication and Pages configuration.**

Run `gh auth status` and `gh repo view RuanFernandes/BornEngine --json nameWithOwner,defaultBranchRef,url`. If Pages is not configured for GitHub Actions, configure the repository Pages source through the GitHub API only after verifying the repository and using the current authenticated account. If the API reports that Pages is already configured, leave it unchanged.

- [ ] **Step 5: Push the completed site changes together.**

After all checks pass, push the site commits to `origin main` in one push. Do not stage or commit `native/shared/src/ffi.rs`. If branch protection rejects a direct push, stop and report the exact restriction rather than changing branch policy.

- [ ] **Step 6: Verify the deployed workflow and live URL.**

Use `gh run list --workflow docs.yml --limit 1` and `gh run watch <run-id> --exit-status` for the new deployment. Read the Pages URL from the repository/API response, open the homepage and one docs route, and update the root README documentation link if the verified URL differs from the default repository Pages path. Run one final `git diff --check` and report the exact commit(s), workflow run, and live URL.

## Plan self-review

- Spec coverage: homepage, multi-page docs, CLI inventory, Getting Started prerequisites/official links, API/platform/guides, branding, accessibility, motion, SEO, validation, CI/CD, README integration, and deployment are covered by Tasks 3–9.
- Placeholder scan: the plan contains no `TBD`, `TODO`, “implement later”, or unspecified edge-case step. Every implementation step names a file, command, interface, or concrete content contract.
- Type consistency: `withBase`, `commandInventoryErrors`, `prerequisiteErrors`, layout props, command data fields, and validation scripts are defined before their consumers.
- Review focus coverage: each risk in the Review Focus section maps to explicit tests or manual checks in Tasks 2, 3, 5, 6, 8, and 9.
- Scope: all work is contained in the new `webpage/` site, the root README, the single Pages workflow, and design/plan artifacts. Existing engine source and native workflows remain outside the change.
