---
title: Asset audit
description: Validate project asset references, media signatures, budgets, and package inventories.
section: CLI / Assets
order: 24
---

The BornEngine CLI can inspect project assets before a build and create a deterministic asset pack. Both commands use the same inventory: `assets/`, `public/`, and `static/` directories, plus assets referenced by supported `.world2d.json` documents.

```sh
bornengine assets validate
bornengine assets validate . --json
bornengine assets pack --output dist/game
```

Pass an optional project root after `validate` or `pack`. `pack` requires `--output <directory>`. `validate` also accepts `--json`, `--orphan-policy {ignore,warn,error}`, `--max-file-bytes`, `--max-total-bytes`, `--max-image-dimension`, and `--max-total-image-pixels`. Explicit limits override the matching project-manifest value; an omitted flag leaves the manifest setting in place. No size or image limit is enabled implicitly.

## Project manifest

An optional `bornengine.assets.json` in the project root lets a team state its dynamic asset paths and audit budget:

```json
{
  "version": 1,
  "dynamic_paths": ["assets/skins/player.png"],
  "ignored_paths": ["assets/generated/**"],
  "orphan_severity": "warning",
  "max_file_bytes": 10485760,
  "max_total_bytes": 104857600,
  "max_image_dimension": 4096,
  "max_total_image_pixels": 16777216
}
```

`dynamic_paths` contains exact existing project-relative files loaded through computed paths that static reference analysis cannot see. A missing declared file is an error. `ignored_paths` removes matches from orphan and budget diagnostics, but files remain in the inventory and pack; media signature checks still run. In ignore patterns, `*` matches inside one path component and `**` spans whole components. Absolute paths, traversal, duplicate entries, and other glob syntax are rejected.

`orphan_severity` accepts `ignore`, `warn`/`warning`, or `error`; the default is `warning`. Each limit is a positive integer: file and total limits are bytes, image dimension is pixels per side, and total image pixels sums width × height for supported, nonignored images.

## What validation checks

The CLI checks missing world references, unsafe paths, case mismatches, and symlinks that escape the project. It reads media headers without decoding complete assets and recognizes PNG, JPEG, GIF, BMP, WebP, WAV, MP3, Ogg, and FLAC. Invalid signatures and signature/extension mismatches are reported. Reference scanning understands supported `.world2d.json` declarations and `dynamic_paths`; it cannot prove whether an arbitrary TypeScript path is used at runtime. An orphan warning means that the validator found no known reference, not that the file is definitely unused.

Stable diagnostic codes are:

| Code | Meaning |
| --- | --- |
| `orphan_asset` | No supported static or declared dynamic reference was found. |
| `invalid_media_header` | A supported media extension has an invalid or unreadable header. |
| `extension_mismatch` | The media signature does not match the file extension. |
| `file_size_limit` | One nonignored file exceeds `max_file_bytes`. |
| `total_size_limit` | Combined nonignored files exceed `max_total_bytes`. |
| `image_dimension_limit` | A supported image exceeds the configured width or height. |
| `total_image_pixels_limit` | Combined supported image area exceeds the configured pixel budget. |
| `declared_dynamic_path_missing` | A `dynamic_paths` entry does not name an existing file with exact case. |

## Output and exit status

Human mode prints `Validated N project assets (B bytes)` to stdout and diagnostics to stderr. With `--json`, stdout contains exactly one newline-terminated report object and no human summary:

```json
{
  "format": "bornengine.asset_validation",
  "version": 1,
  "summary": { "files": 1, "bytes": 6 },
  "diagnostics": [
    {
      "code": "orphan_asset",
      "severity": "warning",
      "path": "assets/example.txt",
      "message": "asset has no known static or declared dynamic reference",
      "measured": null,
      "limit": null
    }
  ]
}
```

Diagnostics have a stable sort order: path, code, severity, message, measured value, then limit. Aggregate diagnostics use an empty path; unrelated `measured` and `limit` fields are `null`. Warnings alone exit `0`; any error diagnostic exits `1`. Invalid manifests, unsafe paths, missing world references, and other hard validation failures also exit `1` and do not produce a completed JSON report.

`assets pack` copies exact file bytes under project-relative paths and writes a sorted `bornengine-assets-v1` manifest with sizes and SHA-256 digests. Audit warnings do not change the default inventory. Build and run stop before packing if hard validation fails or the selected orphan policy/configured diagnostics contain errors. See the CLI repository's [asset-audit reference](https://github.com/RuanFernandes/bornengine-cli#asset-audit-configuration) for the full manifest and JSON contract.
