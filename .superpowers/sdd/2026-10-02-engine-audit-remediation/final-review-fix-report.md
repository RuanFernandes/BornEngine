# Final review fix report

Base: `a7aef5badcd30958092dfb134a492040bf5ae2bf`.

## Changes

- `Room._checkRequestTimeouts` snapshots pending request objects and confirms each is still pending before cancellation and settlement. This keeps synchronous disposal and nested polling from invalidating the outer loop's indices.
- The source runtime harness covers two pending requests for each reentrant path. It checks one timeout for the newer request, one disposal or timeout error for the older request, and one cancellation per request. It is included in `npm run test:runtime`.
- The native Perry/Colyseus game smoke exercises both paths through the public callback API and native game polling. Its success marker now requires a clean `Game.error`, so a game-loop exception after a callback cannot produce a passing marker.
- Malformed Perry string fixtures keep their claimed byte lengths within their allocations and violate only the capacity invariant. The decoder's safety contract explicitly requires header alignment; the fabricated unaligned address is tested through a safe address-check helper.

## Verification

| Command | Result |
| --- | --- |
| `node --disable-warning=ExperimentalWarning tests/game-runtime/colyseus-timeout-harness.cjs` before the timeout fix | Failed with `TypeError: Cannot read properties of undefined (reading 'deadline')` in `Room._checkRequestTimeouts`, confirming the reported reproduction. |
| `node --disable-warning=ExperimentalWarning tests/game-runtime/colyseus-timeout-harness.cjs` after the fix | Passed both reentrant cases. |
| `timeout 60s npm run test:runtime` | Passed all five runtime harnesses, including the new Colyseus regression. |
| `timeout 300s env CARGO_BUILD_JOBS=1 cargo test --release string_header -- --test-threads=1` from `native/shared` | Passed 9 string-header tests. Existing unrelated `unused_mut` warnings appeared. |
| `timeout 120s env CARGO_BUILD_JOBS=1 cargo test --release malformed_persisted_string_does_not_replace_file -- --test-threads=1` from `native/shared` | Passed the persistence regression. The same unrelated warnings appeared. |
| `timeout 420s env PATH=/home/nullborne/.npm/_npx/95d89b54fef45a02/node_modules/.bin:$PATH PERRY_RUNTIME_DIR=/tmp/bornengine-audit-perry/runtime PERRY_ALLOW_PERRY_FEATURES=1 CARGO_BUILD_JOBS=1 perry compile main.ts --target linux --no-cache -o colyseus-smoke` from `examples/colyseus-smoke` | Passed with Perry `0.5.1520`; produced the native Linux executable. |
| `timeout 50s env BLOOM_HEADLESS=1 WGPU_BACKEND=vulkan VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json npm run test:colyseus` from `examples/colyseus-smoke` | Passed; emitted `COLYSEUS_NATIVE_SMOKE_PASSED`. The fixture runner stopped its server. |
| `git diff --check` | Passed. |

The local display was available at `:0`, so the native smoke ran with the hidden X11 window and lavapipe Vulkan. `xvfb-run` was unavailable locally; CI uses it. `cargo fmt --check --manifest-path native/shared/Cargo.toml` reported extensive pre-existing formatting differences across unrelated Rust files, so no repository-wide formatting was applied. The focused fix did not indicate a need to repeat the shared release suite; its pre-fix run passed 198 tests with one ignored.

Package version remains `0.13.0`. Pages and npm release sequencing was not changed. No test server or client process was left running.
