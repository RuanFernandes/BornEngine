# Task 6: Multiplayer server Node requirement

Base commit: `483f4902580bb3eb77e273d80a3d4d80b2387921`

## Files changed

- `tests/colyseus/server/package.json`
- `tests/colyseus/server/package-lock.json`
- `tests/colyseus/README.md`
- `examples/multiplayer-arena/server/package.json`
- `examples/multiplayer-arena/server/package-lock.json`
- `examples/multiplayer-arena/README.md`
- `examples/multiplayer-chat/server/package.json`
- `examples/multiplayer-chat/server/package-lock.json`
- `examples/multiplayer-chat/README.md`

All three server manifests and lockfile root records now declare `engines.node: ">=22"`. The three guides state Node.js 22 or newer. Each lockfile changed only in its root engine metadata; no dependency versions changed.

## Validation

Environment: Node `v26.9.0`; npm `11.19.1`. Commands below ran sequentially. All commands exited 0.

From each respective server directory, `npm install --package-lock-only --ignore-scripts --offline` returned:

```text
up to date, audited 173 packages in 142ms

41 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

That output is from `tests/colyseus/server`; arena returned the same lines with `161ms`, and chat returned the same lines with `142ms`.

### Colyseus integration fixture

Command, from `tests/colyseus/server`: `npm ci`

```text
npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

added 172 packages, and audited 173 packages in 6s

41 packages are looking for funding
  run `npm fund` for details

16 vulnerabilities (13 low, 3 moderate)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   msgpackr-extract@3.0.4 (install: node-gyp-build-optional-packages)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

Command, from repository root: `node tests/colyseus/run-server-smoke.mjs`

```text
Colyseus server protocol smoke test passed
```

### Multiplayer arena

Command, from `examples/multiplayer-arena/server`: `npm ci`

```text
npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

added 172 packages, and audited 173 packages in 6s

41 packages are looking for funding
  run `npm fund` for details

16 vulnerabilities (13 low, 3 moderate)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   msgpackr-extract@3.0.4 (install: node-gyp-build-optional-packages)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

Command, from `examples/multiplayer-arena/server`: `npm test`

```text
> bornengine-multiplayer-arena-server@1.0.0 test
> npm run check && tsx test/contract-test.ts

> bornengine-multiplayer-arena-server@1.0.0 check
> tsc --noEmit

Multiplayer arena two-client contract passed
```

### Multiplayer chat

Command, from `examples/multiplayer-chat/server`: `npm ci`

```text
npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

added 172 packages, and audited 173 packages in 6s

41 packages are looking for funding
  run `npm fund` for details

16 vulnerabilities (13 low, 3 moderate)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   msgpackr-extract@3.0.4 (install: node-gyp-build-optional-packages)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

Command, from `examples/multiplayer-chat/server`: `npm test`

```text
> bornengine-multiplayer-chat-server@1.0.0 test
> npm run check && tsx test/contract-test.ts

> bornengine-multiplayer-chat-server@1.0.0 check
> tsc --noEmit

Multiplayer chat two-client contract passed
```

`git diff --check` exited 0. `ss -ltn '( sport = :2567 or sport = :2568 or sport = :2569 )'` showed no listeners after testing.

## Remaining concerns

- The declared minimum Node 22 was not exercised directly; validation used Node 26.9.0.
- Clean installs report 16 existing audit findings per fixture (13 low, 3 moderate), plus a `uuid@8.3.2` deprecation warning and install script warnings. Resolving these requires separate dependency review.
