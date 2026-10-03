# Task 7: Trim unused Colyseus server integrations

Base commit: `7dbf3a5942ed093a2d675d8a80a8292a20783d83`.

## Changes

Each maintained server now declares `@colyseus/core: ^0.18.18` and `@colyseus/ws-transport: ^0.18.4` in place of `colyseus: ^0.18.9`. Its `defineRoom` and `defineServer` imports now come from `@colyseus/core`. The existing `@colyseus/tools: ^0.18.7`, `@colyseus/schema: ^5.0.35`, test SDK `0.18.4`, and Node `>=22` requirement remain. Room implementations and server behavior were not changed.

Changed files:

- `tests/colyseus/server/package.json`
- `tests/colyseus/server/package-lock.json`
- `tests/colyseus/server/src/app.config.ts`
- `examples/multiplayer-arena/server/package.json`
- `examples/multiplayer-arena/server/package-lock.json`
- `examples/multiplayer-arena/server/src/app.config.ts`
- `examples/multiplayer-chat/server/package.json`
- `examples/multiplayer-chat/server/package-lock.json`
- `examples/multiplayer-chat/server/src/app.config.ts`
- `.superpowers/sdd/2026-10-02-engine-audit-remediation/task-7-report.md`

The regenerated lockfiles resolve `@colyseus/core@0.18.18` and `@colyseus/ws-transport@0.18.4`. `npm ls` in each server shows the tools and SDK sharing those versions. Lockfile search and `npm ls` show no installed `colyseus`, `@colyseus/auth`, `@colyseus/monitor`, `@colyseus/playground`, `@colyseus/redis-driver`, or `@colyseus/redis-presence`. Those packages have no remaining dependency paths. The OAuth/UUID chain previously pulled by the umbrella package is absent from the resulting lockfiles.

## Validation

Environment: Node `v26.9.0`, npm `11.19.1`. Commands below ran one fixture at a time. Each package directory was the working directory for its npm commands.

| Fixture | Command | Result |
| --- | --- | --- |
| Protocol | `npm install --package-lock-only --ignore-scripts --no-fund` | Exit 0; audited 117 packages; 0 vulnerabilities. |
| Protocol | `npm ci --no-fund` | Exit 0; added 116 packages; audited 117; 0 vulnerabilities. |
| Protocol | `npm audit --json` and `npm audit --omit=dev --json` | Both exit 0; 0 total vulnerabilities, including 0 at every severity. Remaining alert count: 0; dependency paths: none. |
| Protocol | `node tests/colyseus/run-server-smoke.mjs` from repository root | Exit 0; `Colyseus server protocol smoke test passed`. |
| Arena | `npm install --package-lock-only --ignore-scripts --no-fund` | Exit 0; audited 117 packages; 0 vulnerabilities. |
| Arena | `npm ci --no-fund` | Exit 0; added 116 packages; audited 117; 0 vulnerabilities. |
| Arena | `npm audit --json` and `npm audit --omit=dev --json` | Both exit 0; 0 total vulnerabilities, including 0 at every severity. Remaining alert count: 0; dependency paths: none. |
| Arena | `npm test` | Exit 0; `tsc --noEmit` and `Multiplayer arena two-client contract passed`. |
| Chat | `npm install --package-lock-only --ignore-scripts --no-fund` | Exit 0; audited 117 packages; 0 vulnerabilities. |
| Chat | `npm ci --no-fund` | Exit 0; added 116 packages; audited 117; 0 vulnerabilities. |
| Chat | `npm audit --json` and `npm audit --omit=dev --json` | Both exit 0; 0 total vulnerabilities, including 0 at every severity. Remaining alert count: 0; dependency paths: none. |
| Chat | `npm test` | Exit 0; `tsc --noEmit` and `Multiplayer chat two-client contract passed`. |

Each `npm ci` emitted the same npm `install-scripts` warning: `esbuild@0.28.2` postinstall and `msgpackr-extract@3.0.4` optional install are not covered by `allowScripts`. Both contract tests and the protocol smoke test passed with this policy. The shell emitted a separate Starship `TERM=dumb` prompt warning on commands; it did not affect exit codes.

`git diff --check` exited 0. After the contracts, `ss -ltnp` showed no listener on the protocol test port 2567; a process listing found no fixture `node` or `tsx` server process. The arena and chat contracts allocate dynamic ports and shut down their child servers. No GUI client was run.

## Remaining concerns

No audit advisories remain in these three fixtures. npm's `allowScripts` warning remains for the two packages listed above; it did not affect the validation runs.
