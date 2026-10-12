# Contributing

## Setup

```sh
npm install
npm run perry:setup
```

Node 22.18 or newer is required. `perry:setup` builds the Perry compiler from the commit in `perry.source.json`. It needs LLVM 22 and `LLVM_SYS_221_PREFIX`; see `.github/actions/setup-llvm22/action.yml`. Set `PERRY_BIN` to use an existing binary.

## Test tiers

- `npm run test:fast`: typecheck, lint, side-effect and JSDoc checks, unit tests, and tool tests. Run this before every push. It takes minutes and needs no native build.
- `npm run test:runtime`: compiled runtime tests. These link the native library, so build it first with `npm run native:build`.
- `npm test`: the full aggregate. CI runs it, and it takes about an hour. Use it when you change native code, the FFI, or the build tooling.

## Public API documentation

Every exported class, function, interface, and public member needs a JSDoc comment. `npm run check:jsdoc` fails on any that are missing. Mark internal glue with `@internal`.

## Publishing

Tags `v*` run the release workflow. It waits for the full `Tests` run on the tag commit, then builds the native libraries and publishes to npm.

To publish an npm version without rebuilding the native artifacts, dispatch the npm-only mode on an existing tag:

```sh
gh workflow run release.yml --repo RuanFernandes/BornEngine --ref main -f tag=vX.Y.Z -f npm_only=true
```

The tag must exist and `package.json` must already have the same version.
