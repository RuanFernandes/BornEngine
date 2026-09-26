import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = resolve(repoRoot, "tools/build-colyseus-sdk.sh");

test("SDK builder rejects a Rust target with no archive mapping", () => {
  const command = process.platform === "win32" ? "bash" : script;
  const args = process.platform === "win32" ? [script, "mips64-unknown-linux-gnuabi64"] : ["mips64-unknown-linux-gnuabi64"];
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.status, 2, result.stderr || result.error?.message);
  assert.match(result.stderr, /Unsupported Rust target/);
});

test("SDK builder carries the Windows ssize_t fix for the pinned Wslay source", () => {
  const sdkSource = resolve(repoRoot, "native/third_party/colyseus-sdk-src");
  const patchFile = resolve(repoRoot, "tools/patches/colyseus-native-sdk-windows-msvc.patch");
  const builder = readFileSync(script, "utf8");
  const patch = readFileSync(patchFile, "utf8");
  const result = spawnSync("git", ["-C", sdkSource, "apply", "--check", patchFile], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(patch, /ssize_t=intptr_t/);
  assert.match(builder, /git -C "\$SDK_SOURCE" apply/);
  assert.match(builder, /chmod u\+rw/);
});

test("SDK builder selects a compatible CPU for Apple Silicon iOS simulators", () => {
  const builder = readFileSync(script, "utf8");

  assert.match(builder, /ZIG_CPU=apple_m1/);
  assert.match(builder, /-Dcpu=\$ZIG_CPU/);
});

test("Windows SDK patch uses native locks and avoids Winsock 1", () => {
  const patchFile = resolve(repoRoot, "tools/patches/colyseus-native-sdk-windows-msvc.patch");
  const patch = readFileSync(patchFile, "utf8");

  assert.match(patch, /WIN32_LEAN_AND_MEAN/);
  assert.match(patch, /SRWLOCK/);
  assert.match(patch, /AcquireSRWLockExclusive/);
  assert.match(patch, /ReleaseSRWLockExclusive/);
  assert.match(patch, /-Wno-newline-eof/);
});

test("native SDK runner links the engine crate for every artifact target", () => {
  const workflowFile = resolve(repoRoot, ".github/workflows/build-colyseus-sdk.yml");
  const workflow = readFileSync(workflowFile, "utf8");

  for (const manifest of [
    "native/linux/Cargo.toml",
    "native/macos/Cargo.toml",
    "native/windows/Cargo.toml",
    "native/ios/Cargo.toml",
  ]) {
    assert.ok(workflow.includes(`cargo_manifest: ${manifest}`), `missing Cargo link check for ${manifest}`);
  }
  assert.match(workflow, /Install stable Rust toolchain/);
  assert.match(workflow, /Install nightly Rust toolchain/);
  assert.match(workflow, /Link engine static library against Colyseus SDK/);
  assert.match(workflow, /cargo build --release --manifest-path.*--no-default-features --features models3d,image-extras --target/);
  assert.doesNotMatch(workflow, /- name: Link engine static library against Colyseus SDK\n        shell: bash/);
});

test("iOS protocol registration uses an explicit Objective-C runtime declaration", () => {
  const iosSource = resolve(repoRoot, "native/ios/src/lib.rs");
  const source = readFileSync(iosSource, "utf8");

  assert.match(source, /extern "C"\s*\{\s*fn class_addProtocol\(cls: \*mut AnyClass, protocol: \*const c_void\) -> bool;/);
});
