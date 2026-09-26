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
