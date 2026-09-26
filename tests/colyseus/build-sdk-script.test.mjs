import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = resolve(repoRoot, "tools/build-colyseus-sdk.sh");

test("SDK builder rejects a Rust target with no archive mapping", () => {
  const command = process.platform === "win32" ? "bash" : script;
  const args = process.platform === "win32" ? [script, "mips64-unknown-linux-gnuabi64"] : ["mips64-unknown-linux-gnuabi64"];
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.status, 2, result.stderr || result.error?.message);
  assert.match(result.stderr, /Unsupported Rust target/);
});
