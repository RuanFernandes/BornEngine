# BornEngineTools

BornEngineTools provides visual editors for BornEngine World2D maps, 2D sprite animations, and JSON blueprints inside VS Code.

## World2D maps

- Run **BornEngineTools: New World2D Map** from the Command Palette, or open an existing `.world2d.json` file.
- Add tile or object layers, then paint, erase, select, fill, or place objects on the map canvas.
- Under **Tile Sources**, the first source is the main tileset. Use **Add Extra** for another atlas or an image containing a single tile. Set a selected extra source as main with **Set Main**; placed tiles keep their source IDs and flips.
- Sources used together in a tile layer should use the same cell dimensions as that layer's grid. Image files stay external and are referenced by workspace-relative paths.
- The editor writes compact World2D version 2 data. Older version-1 maps remain readable and are upgraded when saved. Projects loading saved version-2 maps need an engine release that supports the version-2 storage format.
- Edits use fast compact serialization. When the map is idle, a background worker prepares maximum-effort output. A normal save uses the matching result when ready; otherwise it waits up to 750 ms and saves a valid fast result. Run **BornEngineTools: Optimize World2D Map** to wait for maximum compaction of the current revision.
- Save, undo, and redo use VS Code's normal document history. Stale background results are discarded if the map changes.

Invalid JSON or schema data stays unchanged and appears in the Problems panel. Missing or out-of-workspace images are reported as diagnostics.

## 2D sprite animations

- Run **BornEngineTools: New Sprite Animation** from the Command Palette and choose an image or character metadata file from the workspace.
- The editor creates a `.spriteanim.json` companion beside the selected source by default. Paths are stored relative to the workspace or metadata file as appropriate.
- Add a clip, set its name, FPS, and loop mode (`loop`, `once`, or `ping-pong`), then use Play, Pause, Reset, and the frame slider to inspect it.
- Build a sequence from multiple images or crop frames from a sprite sheet. A frame can also contain multiple ordered image layers. Adjust each layer's offset, stretch, zoom, rotation, visibility, and pivot independently.
- Source metadata and images remain unchanged. Animation settings use VS Code's normal save, undo, and redo history.

## JSON blueprints

- Choose **Create Blueprint Template** to describe typed fields, events, and the action/condition nodes allowed in a graph. Shared templates live under `.bornengine/blueprint-templates/`.
- Choose **Create Blueprint** to select a template, fill in its fields, and assemble a graph from its declared operations and execution pins.
- Save blueprints under the game's `assets/blueprints/` or a detected linked server's `blueprints/` folder. Server detection requires a valid `bornengine.server.json` marker that points back to the BornEngine project.
- Blueprint files store normal versioned JSON and exact template revisions. Keep the matching template data with a server deployment so game-owned code can map `operationId` values to explicit handlers.
- The extension validates and edits project files; the running game owns execution. The editor is not required at runtime and does not edit live servers or publish remote files.

See the [JSON blueprints guide](https://ruanfernandes.github.io/BornEngine/docs/guides/blueprints/) for the data contract and server example.

## Development

From this directory:

```sh
npm install
npm test
npm run typecheck
npm run build
npm run package
```

## CI and publishing

Pull requests that change this extension and pushes to `main` run its tests and build, then attach an installable VSIX to the workflow run. The VSIX is a build artifact; CI does not publish it from a pull request or a branch push.

To publish a release, update the extension version and lockfile together from this directory (for example, `npm version 0.1.1 --no-git-tag-version`), commit and merge that change to `main`, then push the matching tag `bornengine-tools-v0.1.1`. The tag version must exactly match `package.json`. The workflow publishes only to the Visual Studio Code Marketplace; it does not publish the engine's npm packages.

Marketplace publishing uses GitHub Actions OIDC through `vsce`, so no long-lived publishing token is stored as a GitHub secret. Before the first release, configure a [trusted publishing policy](https://github.com/microsoft/vscode-vsce#trusted-publishing) in the Visual Studio Marketplace for the `RuanFernandes/BornEngine` repository and `.github/workflows/bornengine-tools.yml`. The Marketplace publisher in `package.json` must also be authorized to publish the extension.
