# World2D v2 Compact Storage Implementation Plan

> Execute tasks in order. Checkboxes record implementation and verification progress.

**Goal:** Support a primary tileset plus supplementary sources and minimize World2D JSON with numeric tile codes, adaptive lossless grid codecs, omitted defaults, and safe v1 migration.

**Architecture:** Keep the existing expanded `World2DDocument` as the runtime/editor model and add a separate v2 storage adapter. A pure numeric-code module resolves source ranges, a pure grid-codec module selects the smallest representation, and the storage adapter restores defaults and validates all references. VS Code uses fast serialization during edits and a revision-aware worker for max compaction.

**Tech Stack:** Perry-compatible TypeScript, explicit JSON emission, Canvas/VS Code extension already present, Node worker_threads inside the extension only, existing Node tests and a Perry/native smoke check.

**Spec:** `docs/superpowers/specs/2026-10-06-world2d-compact-v2-design.md`.

**Status:** Approved; inline execution is underway. This covers the compact-storage portion of the combined map/animation plan; patterned bucket, ghost, icons, and composite animation frames remain pending in that plan.

## Workspace and constraints

- Continue in `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-visual-editor`, branch `work/gui-retained-controls`. Inspect current changes before editing.
- `tools/vscode/` currently contains existing untracked editor work. Preserve it and all prior animation/map functionality.
- The starting engine `WORLD2D_VERSION` was 1. Task 4 introduces compact storage v2 while retaining strict v1 reads.
- The extension imports `@bornengine/engine/world2d/editor`; the checked-out package lacks that pure subpath. Add it as part of this work rather than bundling native runtime imports into the extension.
- `tilesets[0]` is primary. IDs remain stable in memory; numeric intervals are regenerated from source order on save.
- Maximum cells per layer: 1.000.000. Decode exact dimensions, exact palette indices, canonical Base64, and bounded LZ output before constructing cell arrays.
- Compact mode emits minified JSON. Readable mode emits numeric Dense grid data and readable metadata.
- Preserve the manual JSON writer needed by Perry, precision, custom component JSON, unknown supported metadata, and additional declared assets.
- Tests have already been authorized. Add meaningful codec, migration, and revision-safety coverage; do not add tests that only mirror labels or markup.
- Do not implement product changes until the user approves this plan. Do not publish or install a format change before engine and extension compatibility checks pass.

## Review focus

- Reordering the primary source must recode from stable source IDs; test that placed main/extra tiles and flips survive the change.
- Reference ranges can exceed the number of used tiles. Test extra tiles behind a large main atlas, including a one-tile extra image and every flip mask.
- A tiny Sparse or LZ payload may claim a huge grid. Test invalid dimensions, run totals, gaps, palettes, backreferences, trailing bytes, and padding before allocation.
- Omitting defaults must preserve non-default names, zero opacity, hidden layers/objects, nonzero origins, custom components, and unused explicitly declared assets.
- Save/worker results can race with undo, source changes, or a text-editor edit. Test revision checks and ensure Optimize Map never saves stale data.

---

## File responsibilities

| File | Responsibility |
| --- | --- |
| `src/world2d/storageTypes.ts` (new) | v2 disk types and serialize options, separate from expanded runtime types |
| `src/world2d/tileCodes.ts` (new) | Stable source IDs ↔ compact numeric tile codes |
| `src/world2d/tileGridCodec.ts` (new) | Dense/RLE/Sparse and candidate selection |
| `src/world2d/tileGridBits.ts` (new) | Local palette, bit packing and canonical Base64 |
| `src/world2d/tileGridLz.ts` (new) | Bounded byte-LZ encode/decode |
| `src/world2d/storage.ts` (new) | v1/v2 normalization, storage defaults and asset derivation |
| `src/world2d/validateNormalized.ts` (new) | Strict semantic checks on expanded documents without storage imports |
| `src/world2d/saver.ts` | Canonical manual JSON emission and serialization API |
| `src/world2d/validate.ts`, `migrate.ts` | Validation/migration orchestration with no import cycle |
| `src/world2d/editor.ts` (new) | Pure exports for editor bundles, excluding runtime construction |
| `tools/vscode/bornengine-tools/src/maps/mapCodecWorker.ts` (new) | Max encoding away from the extension host's edit path |
| `tools/vscode/bornengine-tools/src/maps/world2dEditorProvider.ts` | Versioned worker cache, save integration and Optimize Map |

## Task 1: Define tile codes and primary/extra semantics

**Files:** new `src/world2d/storageTypes.ts`, `src/world2d/tileCodes.ts`; modify `src/world2d/types.ts`; new `tests/world2d-tile-codes.test.mjs`.

**Interfaces:**
- `World2DSerializeOptions = { mode?: 'compact' | 'readable'; effort?: 'fast' | 'max' }`.
- `createWorld2DTileCodebook(tilesets: World2DTilesetData[]): World2DTileCodebook` creates consecutive ranges from 1. The codebook exposes `encode(cell: WorldTileCell | null): number` and `decode(code: number): WorldTileCell | null`.
- Invalid codebook/codes throw an internal codec error carrying a diagnostic; public APIs catch it and return diagnostics.

- [x] Add failing tests for `[16,4]` tile counts: main tile 0 → `1`, extra tile 0 → `17`, extra flip X → `-137`, and `0` → null. Round-trip masks 0..7, large main ranges, last tile IDs, and swapped primary order.
- [x] Run `node --test tests/world2d-tile-codes.test.mjs`; confirm failure is the missing module/behavior.
- [x] Implement the range/mask contract from the spec. Reject non-safe integers, negative codes with mask 0, unknown source IDs, out-of-range tile IDs and overflow of `(g * 8 + mask)`.
- [x] Set current version to 2 only with the migration/validation changes in Task 4; keep this task's code independent of document migration.
- [x] Rerun the focused tests and inspect the diff. Commit the independently tested tile-code module with a technical message.

## Task 2: Implement adaptive numeric JSON grids

**Files:** new `src/world2d/tileGridCodec.ts`; new `tests/world2d-tile-grid.test.mjs`.

**Interfaces:**
- `EncodedWorld2DTileGrid` is the union of `number[]` and objects with `encoding: 'rle' | 'sparse' | 'bits' | 'lz'` as defined by the spec.
- `encodeWorld2DTileGrid(codes: number[], options?: World2DSerializeOptions): EncodedWorld2DTileGrid`.
- `decodeWorld2DTileGrid(input: unknown, cellCount: number): number[]`.
- `tileGridEncodedSize(grid: EncodedWorld2DTileGrid): number` measures its full minified ASCII JSON envelope; selection ties use Dense, RLE, Sparse, Bits, LZ.

- [x] Add failing tests for a constant grid selecting RLE, a sparse grid selecting Sparse, irregular values selecting Dense when smaller, runs crossing row boundaries, and candidate ties.
- [x] Add malformed-input cases for zero/negative counts, wrong totals, duplicate/out-of-bounds Sparse positions, unknown codecs and excessive dimensions.
- [x] Run `node --test tests/world2d-tile-grid.test.mjs` and observe the missing implementations fail.
- [x] Implement Dense/RLE/Sparse, base selection and exact-length decoding. Sparse values are flat `[gap, code]` pairs from previous position `-1`; omit `base` only when it is 0.
- [x] Rerun the focused suite; assert every decoded sequence equals its input and the selected envelope is no larger than each generated candidate. Commit this codec task.

## Task 3: Add bit packing and bounded LZ

**Files:** new `src/world2d/tileGridBits.ts`, `src/world2d/tileGridLz.ts`; extend `tileGridCodec.ts` and `tests/world2d-tile-grid.test.mjs`.

**Interfaces:**
- `packTileCodes(codes: number[]): { palette: number[]; bytes: number[] }`; palette order follows the spec.
- `unpackTileCodes(palette: number[], bytes: number[], cellCount: number): number[]`.
- `encodeBase64(bytes: number[]): string` and `decodeBase64(text: string, maxBytes: number): number[]`.
- `compressTileGridBytes(bytes: number[]): number[]` and `decompressTileGridBytes(bytes: number[], expectedByteCount: number): number[]` implement the spec's packet grammar.

- [x] Add failing byte-vector tests: palette `[0,1,2,3]` with indices `[0,1,2,3]` packs to `0xe4`, Base64 `5A==`. Add overlapping LZ copies and distances at the window boundary.
- [x] Add truncation, invalid Base64/padding, invalid palette indices, nonzero bit padding, zero distance, excessive output and trailing-byte cases. Use deterministic generated grids for lossless round trips, including primary/extra/flipped codes.
- [x] Run the focused suite and confirm the unimplemented binary codecs fail.
- [x] Implement pure TypeScript packing/Base64 and bounded LZ. LZ examines at most 64 recent three-byte-hash candidates per position, takes the longest match and nearest distance on ties, and emits references only with a size benefit.
- [x] Add Bits to fast candidates and LZ to max candidates. Compare complete envelopes including the palette and Base64 overhead; rerun all grid tests and commit.

## Task 4: Integrate v2 storage, defaults, migration and saver

**Files:** new `src/world2d/storage.ts`, `src/world2d/validateNormalized.ts`, `src/world2d/editor.ts`; modify `types.ts`, `validate.ts`, `migrate.ts`, `saver.ts`, `index.ts`, root `src/index.ts`/`package.json` exports; new `tests/world2d-storage.test.mjs`; extend `tests/game-runtime/world2d-format.ts`; add `tests/fixtures/world2d/compact-mixed.world2d.json`.

**Interfaces:**
- `normalizeWorld2DStorage(input: unknown): World2DMigrationResult` performs structural decoding/default restoration without calling the public validator.
- `validateNormalizedWorld2D(input: unknown): World2DValidationResult` in `validateNormalized.ts` owns semantic validation of the full model and accepts supported expanded v1/v2 models. The storage adapter strictly validates v1 before upgrading it; public validation/migration call the same stages without importing one another recursively.
- `serializeWorld2D(input: unknown, options?: World2DSerializeOptions): World2DSerializeResult`; defaults are compact/max.
- Normalized `World2DDocument` continues to contain complete assets, descriptor geometry, object geometry and dense `WorldTileCell | null` arrays. Expanded v2 programmatic input is accepted as well as canonical v2 disk input.

- [x] Add failing tests for strict v1 validation followed by v2 migration, every disk codec, compact/default restoration, extra assets, object transforms, file properties and custom component/metadata JSON.
- [x] Add a semantic-preservation test that changes the primary source, serializes and reloads, then compares all expanded cell fields and dimensions. Opening/migrating must not mutate the original input or rewrite a file.
- [x] Run `node --test tests/world2d-storage.test.mjs`; confirm current v1-only behavior fails the new contract.
- [x] Implement normalization, default/tuple restoration and inferred asset union. Validate dimensions and codec payloads before allocating dense cells. Reject conflicting compact and expanded fields; preserve separately mutable cell values.
- [x] Update validator and migrator to accept supported v1/v2 inputs, set `WORLD2D_VERSION = 2`, and preserve diagnostics. Keep runtime loader construction behind successful migration as it is today.
- [x] Implement compact and readable manual emitters, including omitted defaults and minified inline envelopes. Readable emits numeric Dense data, formatted by rows without changing its flat structure.
- [x] Add the pure `@bornengine/engine/world2d/editor` subpath and expose options/types through existing public exports. Rerun all three focused storage/code suites and the existing World2D format harness; commit the integrated contract.

## Task 5: Integrate main/extra UI and save compaction

**Files:** extension `src/maps/world2dEdits.ts`, `mapEditorHtml.ts`, `mapEditor.css`, `src/webview/mapEditor.ts`, `src/maps/world2dEditorProvider.ts`, new `src/maps/mapCodecWorker.ts`, `src/extension.ts`, extension package command contributions/build entry; extension tests `world2dPrimaryTileset.test.cjs`, `world2dMapSave.test.cjs` (new).

**Interfaces:**
- Add operation `{ type: 'setMainTileset'; tilesetId: string }`; move that descriptor to index 0 without changing cells or geometry.
- Worker requests/results carry the document URI, text version, generation and source text. Max JSON can replace a document only if all revision checks still match.
- Register `bornengineTools.optimizeWorld2D`; it awaits max encoding, applies it through VS Code history and saves, or reports a conflict/error.

- [ ] Add failing tests for primary switching with placed extras/flips, single-image extras, immutable edits, stale worker results after undo/text edits/source changes and Optimize Map failure.
- [ ] Run the focused extension tests and confirm the new behavior is absent.
- [ ] Add main/extra source indicators and a Set Main action to the existing tileset workflow. Reuse Add Tileset for supplemental atlases/unit images; support mixed sources on the same compatible grid.
- [ ] Make new documents use v2 via the shared saver. Edits use compact/fast, preserve ready/load behavior, and reset caches on external edits.
- [ ] Build a persistent worker for idle max encoding, debounced by 250 ms and retaining only the latest revision. Save uses a matching cached result or requests the current revision with a local 750 ms deadline; retain valid fast text on timeout. Never recompress during hover.
- [ ] Implement Optimize Map for guaranteed max-effort completion on the current revision. Check versions again before applying/saving; retain normal undo/redo and conflict handling.
- [ ] Run the extension's complete CJS suite once the focused cases pass; build the host, both webviews and worker using the actual package/build layout. Commit source changes only, preserving existing untracked work.

## Task 6: Document, measure and verify the handoff

**Files:** `webpage/src/content/docs/api/world2d.md`, `webpage/src/content/docs/guides/world-format.md`, extension README; new `tools/measure-world2d-storage.mjs`; fixtures/tests from preceding tasks; update the compact-storage links in the combined editor plan.

- [ ] Document primary source ordering, mixed tiles, numeric codes, disk defaults, codec shapes, compact/readable options, Optimize Map, migration and the requirement for an engine release supporting v2. Document fast-save fallback accurately.
- [ ] Measure complete serialized document bytes and line counts for 32×32 constant, 2×2 pattern, sparse-extra and varied-extra fixtures; require v2 compact bytes ≤20% of their legacy v1 bytes. Preserve a legacy-byte baseline using the current explicit v1 representation.
- [ ] Report encode/decode timings for 32×32, 256×256 and a 1.000.000-cell layer with bounded compression. Use timings to fix stalls, without flaky timing assertions in tests.
- [ ] Run focused codec/storage tests, extension tests, affected TypeScript/build checks, the existing World2D runtime harness and a Perry/native codec round trip on the available host. Run documentation build/checks after documentation edits.
- [ ] Review malformed-input handling, enum/codec names, range math, worker version guards, bundle source paths and generated artifacts. Record results and any unavailable platform checks.
- [ ] Keep engine and extension ready together. Publishing and local installation of v2 require the complete compatibility verification and the approved release scope.

## Approval and completion

Approval covers the primary/extras model, World2D v2 migration, minified default
JSON, optional opaque Bits/LZ payloads, adaptive codec selection and the execution
tasks above. The user can select readable numeric grids instead before execution.

Complete when the engine and editor round-trip old/new maps, primary/extras
behave as specified, smallest-envelope selection is demonstrated, benchmark
criteria pass, and current-version saves/Optimize Map cannot write stale data.
