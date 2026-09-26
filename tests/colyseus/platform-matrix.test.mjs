import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../../', import.meta.url);
const sdkWorkflow = await readFile(new URL('.github/workflows/build-colyseus-sdk.yml', repoRoot), 'utf8');
const testWorkflow = await readFile(new URL('.github/workflows/test.yml', repoRoot), 'utf8');
const androidManifest = await readFile(new URL('native/android/Cargo.toml', repoRoot), 'utf8');
const androidSmoke = await readFile(new URL('./android-smoke/run.mjs', import.meta.url), 'utf8');
const appleSmoke = await readFile(new URL('./apple-smoke/run.mjs', import.meta.url), 'utf8');

const targets = [
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-pc-windows-msvc',
  'aarch64-apple-ios',
  'aarch64-apple-ios-sim',
  'x86_64-apple-ios',
  'aarch64-linux-android',
  'x86_64-linux-android',
  'aarch64-apple-tvos',
  'aarch64-apple-tvos-sim',
  'aarch64-apple-visionos',
  'aarch64-apple-visionos-sim',
  'aarch64-apple-watchos',
  'aarch64-apple-watchos-sim',
];

test('every declared Colyseus native target has a build runner', () => {
  for (const target of targets) {
    assert.ok(sdkWorkflow.includes(`rust_target: ${target}`), `missing build runner for ${target}`);
  }
  assert.ok(sdkWorkflow.includes('AR_aarch64_linux_android='), 'Android ARM64 C builds must use the NDK archiver');
  assert.ok(sdkWorkflow.includes('AR_x86_64_linux_android='), 'Android x86_64 C builds must use the NDK archiver');
  assert.ok(sdkWorkflow.includes('CXX_aarch64_linux_android='), 'Android ARM64 C++ builds must use the NDK compiler');
  assert.ok(sdkWorkflow.includes('CXX_x86_64_linux_android='), 'Android x86_64 C++ builds must use the NDK compiler');
  assert.match(androidManifest, /^image\s*=\s*\{.*\}$/m, 'Android FFI macro expansion must resolve image as a direct dependency');
});

test('runtime smoke jobs cover every runtime-capable BornEngine platform', () => {
  const nativeStep = sdkWorkflow.match(/- name: Run native Colyseus runtime smoke([\s\S]*?)(?=\n      - name:|\n      - uses:)/)?.[1] ?? '';
  for (const [platform, target] of [
    ['Linux x86_64', 'x86_64-unknown-linux-gnu'],
    ['Linux ARM64', 'aarch64-unknown-linux-gnu'],
    ['Windows x86_64', 'x86_64-pc-windows-msvc'],
    ['macOS ARM64', 'aarch64-apple-darwin'],
  ]) {
    assert.ok(nativeStep.includes(target), `${platform} has no native runtime smoke`);
  }
  assert.ok(nativeStep.includes('run-native-smoke.mjs'), 'desktop CI must invoke the native harness');

  const androidStep = sdkWorkflow.match(/- name: Run Android emulator Colyseus runtime smoke([\s\S]*?)(?=\n      - name:|\n      - uses:)/)?.[1] ?? '';
  assert.ok(androidStep.includes('android-smoke/run.mjs'), 'Android emulator has no Colyseus runtime smoke');
  assert.ok(androidStep.includes('reactivecircus/android-emulator-runner'), 'Android smoke must execute on an emulator runner');

  const appleStep = sdkWorkflow.match(/- name: Run Apple simulator Colyseus runtime smoke([\s\S]*?)(?=\n      - name:|\n      - uses:)/)?.[1] ?? '';
  assert.ok(appleStep.includes('apple-smoke/run.mjs'), 'Apple targets have no simulator runtime harness');
  assert.ok(androidSmoke.includes('--ignored'), 'Android smoke must execute the ignored fixture integration test');
  assert.ok(appleSmoke.includes("'--ignored'"), 'Apple smoke must execute the ignored fixture integration test');
  assert.ok(appleSmoke.includes('WKCompanionAppBundleIdentifier'), 'watchOS simulator app must identify its companion app');
  assert.ok(appleSmoke.includes('WKApplication'), 'watchOS simulator app must use the single-target watchOS app marker');
  assert.ok(!appleSmoke.includes('<key>WKWatchKitApp</key>'), 'watchOS simulator app must not also declare the legacy WatchKit app marker');
  for (const [platform, target] of [
    ['iOS', 'aarch64-apple-ios-sim'],
    ['tvOS', 'aarch64-apple-tvos-sim'],
    ['visionOS', 'aarch64-apple-visionos-sim'],
    ['watchOS', 'aarch64-apple-watchos-sim'],
  ]) {
    assert.ok(appleStep.includes(target), `${platform} simulator has no Colyseus runtime smoke`);
  }

  assert.ok(testWorkflow.includes('wasm32-unknown-unknown'), 'WebAssembly Colyseus has no build coverage');
  assert.ok(testWorkflow.includes('web-bridge-smoke.mjs'), 'WebAssembly/browser has no Colyseus runtime smoke');
  assert.ok(testWorkflow.includes('COLYSEUS_BRIDGE_MODULE'), 'Web smoke must exercise the assembled SDK bundle');
});
