// Hand-written no-op stub for a bloom_* FFI function that the engine's
// TypeScript (src/core/index.ts) `declare function`s but that is absent from
// the package.json `perry.nativeLibrary.functions` manifest — so gen_stubs.js
// (which reads the manifest) cannot generate it.
//
// The watchOS backend does not implement this material-parameter call, but
// Perry still emits its wrapper symbol from the TypeScript declaration, so the
// native symbol must resolve at link time.
//
// The signature mirrors its `declare function` line in core/index.ts:
//   - `number` params  -> f64 (Perry passes these in float registers)
//   - the `any` pointer -> i64 (a pointer carried in an integer register)
//   - `string` returns  -> i64 (a pointer carried in an integer register)
//
// If this function is added to the manifest, delete this file and let
// gen_stubs.js generate them instead.
#![allow(unused_variables, non_snake_case)]

#[no_mangle]
pub extern "C" fn bloom_set_material_params(_handle: f64, _params_ptr: i64, _count: f64) {}
