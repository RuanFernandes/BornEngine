'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractRustFns } = require('./ffi-parser');

test('recognizes safe and unsafe native FFI exports with the same ABI', () => {
  const source = `
    pub extern "C" fn bloom_plain(value: f64) {}
    pub unsafe extern "C" fn bloom_string(path: *const u8, options: Option<(u8, u8)>) {}
    pub unsafe extern "C" fn bloom_multiline(
      first: *const u8,
      second: Vec<(u8, u8)>,
    ) {}
  `;
  assert.deepEqual([...extractRustFns(source)], [
    ['bloom_plain', 1],
    ['bloom_string', 2],
    ['bloom_multiline', 2],
  ]);
});
