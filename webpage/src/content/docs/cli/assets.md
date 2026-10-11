---
title: Asset audit
description: Validate asset references, file formats, and size budgets, and copy assets with a checksum manifest.
section: CLI
order: 24
---

Two commands look at your project's assets. `assets validate` checks references, file formats, and size limits. `assets pack` copies the assets to a folder and writes a manifest with a SHA-256 checksum for each file. `build` and `run` use the same code: they validate first and then pack the assets next to the executable.

```sh
bornengine assets validate
bornengine assets validate . --json
bornengine assets pack --output dist/game
```

Both commands take an optional project folder. Without it they use the current folder. They do not search upward for the project root.

## What counts as an asset

The audit works on one list of files, the inventory:

- Every file under `assets/`, `public/`, and `static/` in the project root.
- Every file named in the `assets` array of a `bornengine.world2d` document of version 1. The CLI finds these documents by their `.world2d.json` file name anywhere in the project, except in top-level `.git`, `.bornengine`, `.perry-dev`, `node_modules`, `target`, `dist`, and `.cache` folders.

Symbolic links are followed when they stay inside the project. A link that leads outside the project is an error.

The audit reads only version 1 world documents. A `.world2d.json` document that declares the `bornengine.world2d` format with another version stops the command with `unsupported world format version`. A `.world2d.json` file with another format value is ignored, and one that is not valid JSON also stops the command. This limit applies to `build` and `run` too, because they validate first. See [World format](../../guides/world-format/) and [Import maps](../import/).

## References and orphans

An asset is referenced when a world document lists it or when you declare it in `dynamic_paths` in the project manifest. The audit does not read your TypeScript. A texture that your code loads with `game.assets.loadTexture('assets/player.png')` has no known reference, so the audit reports an `orphan_asset` warning for it unless you declare the path.

An orphan warning therefore means "no known reference", not "unused". Only files under `assets/`, `public/`, and `static/` can be orphans. To remove the warnings, declare the paths your code loads in `dynamic_paths`, list generated folders in `ignored_paths`, or set `orphan_severity` to `ignore`.

## The project manifest

An optional file named `bornengine.assets.json` in the project root states the dynamic paths and the budgets of your project:

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

| Field | Meaning |
| --- | --- |
| `version` | Must be `1`. |
| `dynamic_paths` | Exact files that your code loads through computed paths. Each one must exist with exactly the letter case on disk. |
| `ignored_paths` | Patterns for files that are left out of the orphan check and the size and pixel budgets. |
| `orphan_severity` | `ignore`, `warn` (or `warning`), or `error`. The default is `warning`. |
| `max_file_bytes` | The largest size of one file, in bytes. |
| `max_total_bytes` | The largest combined size of all files, in bytes. |
| `max_image_dimension` | The largest width or height of one image, in pixels. |
| `max_total_image_pixels` | The largest combined image area, as width times height summed over all images. |

The rules for the manifest:

- Every limit is a positive integer. No limit is set unless you set one.
- The file may contain only the fields above. Any other field is rejected.
- Paths use forward slashes and are relative to the project root. Absolute paths, `.` and `..` segments, backslashes, colons, and duplicate entries are rejected.
- In `ignored_paths`, `*` matches characters inside one path segment, and `**` as a whole segment matches any number of segments. The characters `?`, `[`, `]`, `{`, and `}` are rejected.
- A dynamic path only marks a file as referenced. It does not add the file to the inventory, so keep these files under `assets/`, `public/`, or `static/`.
- Ignored files stay in the inventory, are copied by `assets pack`, and still get the format checks.

The options of `assets validate` override the manifest for one run: `--orphan-policy` takes `ignore`, `warn`, or `error`, and `--max-file-bytes`, `--max-total-bytes`, `--max-image-dimension`, and `--max-total-image-pixels` take positive integers. An option you leave out keeps the manifest value. `build` and `run` have no such options and always use the manifest.

## What validation checks

- **References.** Every path in a world document must be a safe relative path to an existing file inside the project, with the same letter case as on disk, even on a file system that ignores case. A path that fails these tests stops the command with an error and no report.
- **File formats.** The audit reads the start of each file and checks its signature. It recognizes PNG, JPEG, GIF, BMP, WebP, WAV, MP3, Ogg, and FLAC. It does not decode the files. It takes image sizes from the headers of PNG, JPEG, GIF, BMP, and WebP files.
- **Budgets.** The limits from the manifest or the options, applied to every file that is not ignored.

These are the diagnostic codes:

| Code | Severity | Meaning |
| --- | --- | --- |
| `orphan_asset` | warning, or error with the `error` policy | No world document or `dynamic_paths` entry references the file. |
| `invalid_media_header` | warning | A file with a media extension has a header that is invalid or unreadable. |
| `extension_mismatch` | warning | The signature of the file does not match its extension. |
| `file_size_limit` | error | One file is larger than `max_file_bytes`. |
| `total_size_limit` | error | The files together are larger than `max_total_bytes`. |
| `image_dimension_limit` | error | One image is wider or taller than `max_image_dimension`. |
| `total_image_pixels_limit` | error | The images together have more pixels than `max_total_image_pixels`. |
| `declared_dynamic_path_missing` | error | A `dynamic_paths` entry names a file that does not exist. |

A `dynamic_paths` entry whose letter case differs from the file on disk is not this diagnostic. It stops the command with an error.

## Read the results

By default, `assets validate` prints one line per diagnostic to standard error, and a summary line to standard output:

```text
warning orphan_asset assets/unused.png: asset has no known static or declared dynamic reference
error file_size_limit assets/music/theme.wav: asset exceeds file byte limit
Validated 14 project assets (5242880 bytes)
```

The summary counts every file in the inventory, including ignored files. With `--json`, standard output holds exactly one compact JSON object and a newline, and nothing is printed to standard error:

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

Diagnostics are sorted by path. Diagnostics about the whole project, `total_size_limit` and `total_image_pixels_limit`, have an empty path and come first. For the same path, they follow the order of the table above. `measured` and `limit` are bytes for the size codes, the larger side in pixels for `image_dimension_limit`, and pixels for `total_image_pixels_limit`. They are `null` for other codes.

The exit status is `0` when the report holds no errors, even if it holds warnings. It is `1` when any diagnostic has the severity `error`. Invalid manifests, unsafe or mismatched paths, missing world references, and unreadable files are hard failures. They print `Error:` and exit with `1`, and a hard failure never produces a JSON report. In a continuous integration job, run `bornengine assets validate --json > asset-report.json` and fail the job on a non-zero status.

## Validation in builds

`build`, `run`, and `dev --watch` validate the project with the manifest before they compile. An error diagnostic stops the command with `asset validation failed`, followed by the code, the path, and the message. A hard failure stops it with its own error message. Warnings are not printed, so run `assets validate` to see them. `check` does not validate assets.

## Pack assets

```sh
bornengine assets pack --output dist/game
```

`pack` copies every file of the inventory into the output folder. It keeps the project-relative paths, so `assets/player.png` ends up at `dist/game/assets/player.png`. It also writes `assets.manifest.json`, with the files sorted by path:

```json
{
  "format": "bornengine-assets-v1",
  "files": [
    {
      "path": "assets/player.png",
      "sha256": "<64 hexadecimal characters>",
      "size": 1024
    }
  ]
}
```

`pack` does not apply the budgets from the manifest. Run `assets validate` first, or rely on `build`, which does. The output rules protect your files:

- The output folder cannot be inside `assets/`, `public/`, or `static/`, and its path cannot contain a symbolic link.
- Files from an earlier pack are replaced, and files that the earlier manifest lists but the project no longer has are removed. Other files in the folder are left alone.
- If a file that the earlier manifest does not list already exists at a target path, `pack` stops with `refusing to replace untracked output file`.
- `pack` stages the new copy first. If publishing fails, it restores the previous output.

## Next steps

- [Build and run](../build/) shows where the packed assets end up.
- [Import maps](../import/) creates world documents from Tiled maps.
- [World format](../../guides/world-format/) describes the `bornengine.world2d` documents the audit reads.
- [Assets](../../concepts/assets/) explains how a running game loads assets.
