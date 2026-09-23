# BornEngine Webpage Design

**Date:** 2026-09-23
**Status:** Approved design

## Goal

Build a polished, English-first, multi-page website inside `webpage/` that introduces BornEngine on a dedicated homepage and teaches users how to install, build, run, and extend games with the BornEngine engine and CLI. The site must publish as static files to GitHub Pages and deploy automatically through GitHub Actions.

## Success criteria

- The homepage at `/` presents BornEngine as a native TypeScript game engine without pretending to be the documentation hub.
- The documentation area begins at `/docs/` and has stable, human-readable URLs for getting started, CLI, API modules, platforms, guides, troubleshooting, and reference material.
- Every public CLI command currently implemented by `bornengine-cli` is documented with an accurate synopsis, examples, options, behavior, and related guidance.
- API examples and module descriptions are grounded in the current BornEngine README, `src/` exports, and existing `docs/` files.
- The site works without client-side JavaScript for basic navigation and reading. JavaScript is limited to search, menus, copy feedback, and small enhancements.
- The production build emits metadata, canonical URLs, Open Graph data, a sitemap, robots instructions, structured breadcrumbs, and a useful 404 page.
- Reduced-motion users receive the same information without looping animation or scroll-triggered motion.
- Pull requests and pushes that touch the site fail when content, internal links, or the production build are invalid.
- A successful push to `main` deploys the generated site through the GitHub Pages environment.

## Audience and content principles

The primary audience is English-speaking game developers who are new to BornEngine, TypeScript developers who want a native target, and experienced engine users looking for API or CLI reference material.

Content uses direct, practical English. It favors exact commands, short paragraphs, honest platform limitations, and examples that teach one idea at a time. It does not use fabricated metrics, testimonials, ratings, download counts, unsupported platform claims, or vague marketing language.

The site is a maintained public surface, not a mirror of every internal renderer ticket. Public-facing content prioritizes the paths a game developer needs to ship a project. Internal performance RFCs and ticket history remain linked from the repository when relevant rather than being copied into the navigation.

## Source of truth

The site content is authored from these existing sources:

- `README.md` for the project promise, installation, quick start, modules, platforms, architecture, and lineage.
- `package.json` and `src/` for public package entry points, module exports, types, and function names.
- `docs/web-target.md`, `docs/physics.md`, `docs/skeletal-animation.md`, `docs/world-format.md`, the Apple platform documents, and other public guides for implementation details and limitations.
- `../bornengine-cli/README.md`, `../bornengine-cli/src/cli.rs`, and `../bornengine-cli/src/commands/` for CLI commands, flags, defaults, and behavior.

The CLI repository is separate, so the published site stores an authored documentation snapshot rather than cloning another repository during every Pages build. The CLI source link appears on the CLI landing page so changes can be synchronized deliberately.

## Technical architecture

### Static site framework

Use Astro with static output. Astro is responsible for layouts, content collections, route generation, metadata, and the production build; it must not become a client-side application. Markdown/MDX content is compiled to HTML at build time.

Use Pagefind after the Astro build to generate a static search index. Search UI code loads only when the user opens search or invokes its keyboard shortcut.

Use project-owned CSS, inline or local SVG, and small native JavaScript modules. Do not add a general-purpose UI kit or a large animation runtime. CSS keyframes and the Web Animations API are sufficient for the approved motion language.

### Proposed site structure

```text
webpage/
  public/
    favicon.svg
    og-image.svg
    brand/
      bornengine-mark.png
  src/
    components/
      CodeBlock.astro
      CommandBlock.astro
      DocsSidebar.astro
      Header.astro
      Footer.astro
      SearchDialog.astro
      TableOfContents.astro
      Breadcrumbs.astro
      PrevNext.astro
      Callout.astro
      PlatformRail.astro
      RuntimeDiagram.astro
    content/
      docs/
        ... markdown and MDX pages ...
    data/
      cli-commands.ts
      navigation.ts
      site.ts
    layouts/
      SiteLayout.astro
      DocsLayout.astro
    pages/
      index.astro
      404.astro
      robots.txt.ts
      docs/
        index.astro
        [...slug].astro
    scripts/
      copy-code.ts
      docs-navigation.ts
      search.ts
    styles/
      tokens.css
      global.css
      homepage.css
      docs.css
  scripts/
    validate-content.mjs
    validate-links.mjs
  tests/
    content-contract.test.mjs
  astro.config.mjs
  package.json
  package-lock.json
  tsconfig.json
```

The exact component split may remain smaller when implementation shows that two components have no independent responsibility. The boundaries above are the intended ownership boundaries: layouts own page shells, components own reusable UI, data owns navigation and command contracts, and content owns prose.

### Route model

All documentation pages use trailing-slash URLs. The content path determines the URL and page title; frontmatter supplies the description, section, order, and optional previous/next relationships. The site config supplies `site` and `base` so the same build works at the repository Pages path and on a future custom domain.

The initial route set is:

```text
/
/docs/
/docs/getting-started/
/docs/getting-started/installation/
/docs/getting-started/quickstart/
/docs/getting-started/project-structure/
/docs/concepts/game-loop/
/docs/concepts/api-shape/
/docs/concepts/assets/
/docs/cli/
/docs/cli/project/
/docs/cli/build/
/docs/cli/diagnostics/
/docs/cli/engine/
/docs/cli/configuration/
/docs/api/
/docs/api/core/
/docs/api/shapes/
/docs/api/textures/
/docs/api/text/
/docs/api/audio/
/docs/api/models/
/docs/api/math/
/docs/api/scene/
/docs/api/physics/
/docs/api/vfx/
/docs/api/world/
/docs/api/mobile/
/docs/platforms/
/docs/platforms/desktop/
/docs/platforms/apple/
/docs/platforms/mobile/
/docs/platforms/web-wasm/
/docs/guides/physics/
/docs/guides/skeletal-animation/
/docs/guides/world-format/
/docs/guides/assets/
/docs/troubleshooting/
/docs/reference/architecture/
/docs/reference/migration/
```

The CLI group pages cover these exact commands and preserve their relationships in the navigation:

- Project: `create`, `new`, `init`.
- Build and run: `build`, `run`, `dev`, `check`.
- Diagnostics: `clean`, `doctor`, `info`, `version`.
- Engine dependency: `engine current`, `engine install`, `engine list`, `engine update`, `engine remove`, `engine use`, and top-level `upgrade`.
- Configuration and release: `config set`, `config get`, `config list`, and top-level `update`.

Each command has a data entry in `src/data/cli-commands.ts` containing the canonical synopsis, flags, examples, behavior notes, and related routes. Tests compare the command inventory against the expected source-derived list so a page cannot silently omit a command.

### Getting Started prerequisites

The Getting Started section begins with a visible “What you need” matrix instead of burying setup requirements in a quick-start paragraph. It distinguishes requirements by the task the reader wants to perform:

| Goal | Required setup |
| --- | --- |
| Read the docs or inspect examples | Nothing beyond a browser and Git if the repository is being cloned. |
| Install the BornEngine CLI | Rust and Cargo through `rustup`; the CLI itself does not require Node.js. |
| Create and build a native game | The CLI, Perry, Rust/Cargo, one package manager (`pnpm`, `npm`, or `yarn`), and the native linker/backend dependencies for the host. |
| Build for Web/WASM | The native-game setup plus `wasm-pack`; `wasm-opt` is an optional size optimization step documented by the Web guide. |
| Build for Apple platforms | A macOS host with Xcode for iOS, tvOS, watchOS, or visionOS targets, plus any Perry target setup described by the relevant platform guide. |
| Build for Android | Perry's Android target setup plus Android Studio and the Android SDK/NDK required by the selected target. |

The first installation page includes copyable verification commands:

```sh
rustc --version
cargo --version
perry --version
bornengine --version
node --version
npm --version
bornengine doctor
```

The page explains that `node`/`npm` are checked because game projects install the engine package even though the CLI binary itself is Rust-based. Users who choose pnpm or Yarn run that manager's version command instead of installing all three package managers.

The page includes an installation table with official third-party documentation links and the exact command used by BornEngine where the repository already defines one:

- Rust and Cargo: [rustup installation](https://rustup.rs/) and the [Rust installation guide](https://www.rust-lang.org/tools/install).
- Node.js and npm: [Node.js downloads](https://nodejs.org/en/download) and [npm's installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). The page recommends the current Node.js LTS line.
- pnpm: [pnpm installation](https://pnpm.io/installation). The CLI documentation also shows `npm install --global pnpm` for users following the default setup.
- Yarn: [Yarn installation](https://yarnpkg.com/getting-started/install), including the `corepack enable` path used by the CLI troubleshooting guidance.
- Perry: the [Perry installation guide](https://docs.perryts.com/getting-started/installation.html), with the documented npm path `npm install -g @perryts/perry` and a note to keep `perry` on `PATH`.
- Web/WASM: the repository's [Web/WASM guide](../../web-target.md) plus the [wasm-pack installation/quickstart documentation](https://rustwasm.github.io/wasm-pack/installer/). The page shows `cargo install wasm-pack` because that is the command currently documented by BornEngine.
- Apple toolchains: [Apple Xcode](https://developer.apple.com/xcode/) for simulator/device SDKs; the page links the iOS/watchOS/tvOS BornEngine guides before asking the reader to install additional credentials or profiles.
- Android toolchains: [Android Studio installation](https://developer.android.com/studio/install), followed by the selected Perry/BornEngine Android target guide.
- Windows native toolchains: the [Perry installation guide](https://docs.perryts.com/getting-started/installation.html) for LLVM/Perry setup, with the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) page as the alternative documented by Perry.

Linux setup is shown directly for Debian/Ubuntu because the CLI already documents the required headers:

```sh
sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev
```

The page labels this as the minimum BornEngine Linux backend set and links to the troubleshooting page for additional distribution-specific packages rather than pretending one apt command covers every Linux distribution. Each platform subsection states whether the dependency is required for the host build, cross-compilation, or only a specific target.

The page ends with a short “If setup fails” path: run `bornengine doctor`, copy the first failing check, read the platform-specific troubleshooting note, and only then inspect Perry's target list with `perry compile --help`. This gives beginners a deterministic next step instead of a long undifferentiated dependency list.

## Information architecture and page design

### Homepage

The homepage is a dark, editorial introduction. Its header contains the BornEngine wordmark, `Docs`, `CLI`, `GitHub`, and a restrained `Get started` action.

The hero uses an asymmetrical two-column layout. The text explains that developers write games in TypeScript and target native platforms and Web/WASM. The visual side contains a lightweight SVG runtime diagram:

```text
TypeScript API → BornEngine runtime → wgpu renderer → platform targets
```

The diagram names real target families rather than showing decorative technology labels. A small playhead or signal pulse is the only looping animation.

Below the hero, the homepage has:

1. A compatibility rail for macOS, Windows, Linux, iOS, tvOS, watchOS, Android, and Web/WASM.
2. An editorial “empty folder to running game” section using verified CLI commands.
3. A compact function-based API example using current BornEngine exports.
4. Three or four capability bands linking to drawing, assets, scene/physics/VFX/world, and platform documentation.
5. A final route-oriented invitation to start, read the CLI reference, browse the API, or open GitHub.

The homepage does not use fake metrics, testimonials, testimonial avatars, review scores, or a large feature-card wall.

### Documentation shell

Documentation pages use a calm warm-paper surface and a three-part desktop shell:

1. A left sidebar around 250–280px wide with grouped navigation and a clear active state.
2. A central reading column with a maximum measure around 680–780px.
3. A right “On this page” rail for long documents.

Every page includes a skip link, global header, breadcrumbs, one `h1`, a one-sentence summary, article content, related links, and previous/next navigation when the section has an intentional sequence. An `Edit this page` link appears only when it resolves to the real repository file.

The mobile shell converts the sidebar to a disclosure/drawer with an accessible button. Tables and code blocks scroll horizontally; text does not shrink below a comfortable reading size.

### CLI documentation

Each CLI group page follows the same practical structure:

1. What the group or command does.
2. Synopsis.
3. Common examples.
4. Arguments and options.
5. Expected behavior and safety rules.
6. Related commands.
7. Troubleshooting notes where the real CLI has a meaningful failure mode.

Examples use `bornengine` exactly as the CLI exposes it. The docs explicitly explain that `create` is interactive, `new` is the non-interactive scaffold path, build outputs live under `.bornengine/builds/`, watch mode uses `.perry-dev/`, and the CLI does not silently substitute unsupported targets.

### API and guide documentation

API pages are organized by public module and explain the smallest useful mental model before showing signatures. Each page contains verified imports, a short example, key types/functions, ownership/lifetime notes where relevant, and links to deeper guides.

Physics, skeletal animation, world format, Web/WASM, Apple targets, and troubleshooting receive guide pages because they require more context than a flat API list. Internal renderer tickets are not promoted to the primary user navigation.

## Design system

Use these tokens as the baseline:

```css
--ink-950: #0A0D10;
--ink-900: #11161C;
--ink-800: #1A222B;
--paper-50: #F6F3EC;
--paper-100: #ECE8DE;
--slate-500: #6F7A84;
--slate-700: #3F4A54;
--line-dark: #303943;
--line-light: #D4D8D7;
--acid-400: #B8F23D;
--blue-500: #4B8DFF;
--coral-400: #FF755E;
```

`acid-400` is the BornEngine signal color for primary actions, active navigation, diagram highlights, and focus indicators. Blue is used for links. Coral is reserved for warnings or secondary emphasis. A single component does not use all accent colors at once.

Use a compact geometric display face, a readable humanist sans for body copy, and a strong monospace face for code. Prefer a self-hosted or system-backed stack so the first render does not depend on a font CDN. Avoid oversized display text, excessive pills, glassmorphism, deep shadows, and nested floating cards.

The global layout uses a 1240–1320px maximum width, 32–40px desktop outer padding, 24px grid gutters, an 8-column tablet layout, and a 4-column mobile layout with 18–20px outer padding.

The BornEngine mark is a flat geometric frame/playhead symbol with no baked-in text. The site renders the `BornEngine` wordmark as real HTML/SVG text so it stays sharp, searchable, and accessible. The PNG mark is used for social/repository contexts where a raster asset is useful, while favicon and header variants use lightweight SVG geometry derived from the same silhouette. The root README adds the mark near the project title and links it from the repository rather than embedding a remote image.

## Motion and interaction

Motion communicates frame sequencing, rendering, and navigation:

- The homepage runtime diagram has a restrained SVG playhead/signal pulse.
- Section reveals use a short opacity/translation transition only when the element enters the viewport.
- Links, buttons, active sidebar rules, and copy feedback use short state transitions.
- No full-screen parallax, particle fields, auto-rotating content, constant background movement, large 3D scenes, or bouncy spring effects.

`prefers-reduced-motion: reduce` disables looping and scroll-triggered animation while retaining essential state changes. CSS handles the default transitions; JavaScript only adds an IntersectionObserver and interaction state when available.

Interactive controls must remain useful with JavaScript disabled:

- Navigation is ordinary links.
- Code contents remain selectable.
- Search degrades to visible navigation and browser find.
- Copy buttons are progressively enhanced and show an `aria-live` success message.
- The mobile menu uses a semantic button and disclosure state, not hover-only behavior.

## Accessibility

The site uses semantic landmarks (`header`, `nav`, `main`, `aside`, `article`, `footer`), one clear `h1` per page, correct heading order, visible keyboard focus, `aria-current` for active routes, accessible names for icon-only controls, and a skip-to-content link. Colors never carry meaning alone. Code blocks, tables, and the three-column shell remain usable at narrow widths.

The contrast of the dark homepage and warm docs palette is checked during implementation. The acid focus treatment gets a dark outline or equivalent high-contrast boundary where it sits on light paper. Motion and sticky navigation are both reduced for small screens and reduced-motion users.

## SEO and metadata

Every page gets a unique title, description, canonical URL, Open Graph metadata, and Twitter/X card metadata from frontmatter and site config. The shared layout includes `lang="en"`, the configured site URL, and the repository base path.

The build emits:

- `sitemap.xml` through the Astro sitemap integration.
- `robots.txt` pointing crawlers to the sitemap.
- A branded SVG social preview asset referenced by Open Graph metadata.
- BreadcrumbList JSON-LD on docs pages.
- TechArticle JSON-LD on long technical guides when the page has enough authored article content.
- A custom 404 page with links back to docs and GitHub.

Structured data contains only claims present in the project documentation. No ratings, organization size, usage statistics, or product claims are fabricated.

## Validation and testing

The site package has a lockfile and exposes these checks:

- `npm test` runs Node's built-in test runner for command inventory, route metadata, required page contracts, and validator helpers.
- `npm run check` runs Astro's type/content checks and the static content validator.
- `npm run build` creates production output and runs the post-build Pagefind step.
- `npm run validate:dist` verifies required output routes, metadata, canonical URLs, sitemap/robots assets, internal links, and the 404 page.

The validation script fails on missing required CLI commands, duplicate routes, empty titles/descriptions, missing `h1` elements, missing Getting Started prerequisite sections, missing official installation links, unresolved local links, placeholder copy, or a build output that omits required SEO files. It ignores external links during CI so a third-party service being temporarily unavailable does not make the content contract fail; a separate documented link audit can be run when editing dependency URLs.

The final verification pass also checks the generated site with a local static server, tests keyboard paths for search/menu/copy controls, checks a narrow viewport, and confirms the pre-existing engine change in `native/shared/src/ffi.rs` was not modified by site work.

## GitHub Pages CI/CD

Add `.github/workflows/docs.yml` to the BornEngine repository. The workflow runs on pushes to `main` and pull requests when `webpage/**` or the workflow itself changes, and supports manual dispatch.

The workflow:

1. Checks out the repository.
2. Sets up the configured Node version.
3. Runs `npm ci` in `webpage/`.
4. Runs content and type validation.
5. Builds the production site and validates `dist/`.
6. Uploads `webpage/dist` with `actions/upload-pages-artifact`.
7. Deploys with `actions/deploy-pages` using `pages: write` and `id-token: write` permissions.

The deployment job uses a concurrency group so a newer `main` push supersedes an older pending deployment without interrupting the current one. The Astro `site` and `base` values are environment-aware: the default repository Pages path is used for GitHub Pages, while a future custom domain can set an empty base path without rewriting links.

The workflow does not deploy from a client-side preview or commit generated files to a branch. The generated `dist/` artifact is the only deployment payload.

## Non-goals

- A browser-based game editor or online code playground.
- Runtime API introspection from a live server.
- A CMS or web editor for documentation.
- Automatic synchronization with the CLI repository on every build.
- Portuguese translations in the first release.
- Versioned documentation navigation for historical engine releases.
- Rewriting unrelated engine files or the existing native CI workflows.

## Acceptance checklist

- [ ] `webpage/` contains a separate homepage and multi-page docs output.
- [ ] The visual system follows the ink/paper/acid design with editorial rules and no generic card wall.
- [ ] The BornEngine mark is present in the site and root README without hard-coded AI or generator attribution.
- [ ] The docs shell, search, copy controls, mobile menu, and reduced-motion behavior are accessible.
- [ ] CLI content covers all current command groups and exact command inventory.
- [ ] API, platform, guide, and troubleshooting content uses verified repository sources.
- [ ] Production output contains clean routes, metadata, sitemap, robots, social preview, and 404 assets.
- [ ] Node tests, Astro checks, production build, and distribution validation pass.
- [ ] GitHub Pages workflow uploads and deploys the production artifact.
- [ ] The pre-existing `native/shared/src/ffi.rs` modification remains untouched.
