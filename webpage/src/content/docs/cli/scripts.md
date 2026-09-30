---
title: Script packages
description: Validate and deterministically package self-contained JavaScript behaviors for BornEngine.
section: CLI / Scripts
order: 29
---

The `script` command checks BornEngine JavaScript behavior packages and stages their declared entry for distribution. It validates package metadata and paths without running guest code.

## Package manifest

Create `bornengine.script.json` in the package directory:

```json
{
  "format": "bornengine-script-v1",
  "apiVersion": 1,
  "entry": "scripts/player.js",
  "permissions": ["log", "self.read", "self.transform.write"]
}
```

`entry` must point to a regular UTF-8 `.js` or `.mjs` file inside the package, no larger than 1 MiB. The manifest is limited to 64 KiB. `permissions` must be a sorted, unique list drawn from `log`, `self.particles.emit`, `self.read`, and `self.transform.write`.

## Validate and pack

Run the commands from the directory containing the manifest:

```sh
bornengine script check
bornengine script check --manifest config/bornengine.script.json
bornengine script pack --output dist/scripts/player
bornengine script pack --manifest config/bornengine.script.json --output dist/scripts/player
```

`check` validates the manifest, permissions, entry path, and JavaScript syntax without executing it. It rejects static imports, module re-exports, and dynamic imports because v1 has no module loader. Source nesting is limited to 128 levels before parsing. `pack` applies the same validation and copies the declared entry, manifest, and `.bornengine-pack.json` ownership marker into a dedicated output directory. The marker records hashes of the package files. The marker and any previous packed manifest are also limited to 64 KiB. Repeated packs produce the same three files and the summary counts all three. The command replaces an existing directory only when the marker proves its contents are unchanged and CLI-owned; it refuses separately authored packages, changed files, symbolic links, and untracked content.

The v1 runtime accepts JavaScript source text in `ScriptComponent`; it does not resolve files from the packaged directory. A host must load or embed the `.js` entry itself and pass its contents to the component. See the [embedded scripting API](../../api/scripting/) and [scripted actor example](https://github.com/RuanFernandes/BornEngine/tree/main/examples/scripted-actor).
