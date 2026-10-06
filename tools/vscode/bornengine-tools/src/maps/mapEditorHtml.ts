import type * as vscode from 'vscode';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildMapEditorHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
  nonce: string,
): string {
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${escapeAttribute(nonce)}'`,
  ].join('; ');
  const script = escapeAttribute(scriptUri.toString());
  const stylesheet = escapeAttribute(styleUri.toString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${stylesheet}">
  <title>BornEngine World2D Map</title>
</head>
<body>
  <div id="app">
    <header class="app-header">
      <div class="brand"><strong>BornEngineTools</strong><span>World2D</span><span id="document-name" class="document-name">Map</span></div>
      <div class="toolbar" role="toolbar" aria-label="Map tools">
        <button type="button" data-tool="select" title="Select and transform objects">Select</button>
        <button type="button" data-tool="paint" title="Paint tiles">Paint</button>
        <button type="button" data-tool="bucket" title="Fill a connected region with the selected tile">Bucket</button>
        <button type="button" data-tool="erase" title="Erase tiles">Erase</button>
        <button type="button" data-tool="placeObject" title="Place an object">Object</button>
        <button type="button" id="zoom-out" title="Zoom out">−</button>
        <button type="button" id="zoom-label" title="Reset zoom">100%</button>
        <button type="button" id="zoom-in" title="Zoom in">+</button>
        <span class="toolbar-spacer"></span>
      </div>
    </header>
    <section class="workspace">
      <aside class="sidebar" aria-label="Map layers and tiles">
        <section class="panel">
          <div class="panel-heading"><h2>Layers</h2><span id="layer-count" class="muted"></span></div>
          <div class="button-row layer-actions">
            <button type="button" id="add-tile-layer">+ Tile</button>
            <button type="button" id="add-object-layer">+ Objects</button>
          </div>
          <div id="layer-list" class="layer-list"></div>
          <div class="button-row">
            <button type="button" id="move-layer-up" title="Move layer up">↑</button>
            <button type="button" id="move-layer-down" title="Move layer down">↓</button>
          </div>
        </section>
        <section class="panel layer-inspector-panel">
          <div class="panel-heading"><h2>Layer Inspector</h2></div>
          <p id="layer-inspector-empty" class="muted empty-note">Select a layer to edit its settings.</p>
          <div id="layer-inspector-fields" hidden>
            <label class="inspector-field">Name<input id="layer-name" type="text"></label>
            <label class="checkbox-field"><input id="layer-visible" type="checkbox"> Visible</label>
            <label class="inspector-field">Opacity<input id="layer-opacity" type="number" min="0" max="1" step="0.05"></label>
            <div class="inspector-grid">
              <label>Offset X<input id="layer-offset-x" type="number" step="any"></label>
              <label>Offset Y<input id="layer-offset-y" type="number" step="any"></label>
              <label>Parallax X<input id="layer-parallax-x" type="number" step="any"></label>
              <label>Parallax Y<input id="layer-parallax-y" type="number" step="any"></label>
            </div>
            <div id="tile-layer-fields">
              <div class="panel-heading"><h2>Tile Grid</h2></div>
              <div class="inspector-grid">
                <label>Columns<input id="layer-width" type="number" min="1" step="1"></label>
                <label>Rows<input id="layer-height" type="number" min="1" step="1"></label>
                <label>Cell Width<input id="layer-tile-width" type="number" min="1" step="any"></label>
                <label>Cell Height<input id="layer-tile-height" type="number" min="1" step="any"></label>
              </div>
            </div>
            <button type="button" id="apply-layer-settings">Apply Layer Settings</button>
          </div>
        </section>
        <section class="panel inspector-panel">
          <div class="panel-heading"><h2>Object Inspector</h2></div>
          <p id="inspector-empty" class="muted empty-note">Select or place an object to edit it.</p>
          <div id="inspector-fields" hidden>
            <label class="inspector-field">Name<input id="object-name" type="text"></label>
            <label class="inspector-field">Type<input id="object-type" type="text"></label>
            <div class="inspector-grid">
              <label>X<input id="object-x" type="number" step="any"></label>
              <label>Y<input id="object-y" type="number" step="any"></label>
              <label>Rotation<input id="object-rotation" type="number" step="any"></label>
              <label>Width<input id="object-width" type="number" min="0" step="any"></label>
              <label>Height<input id="object-height" type="number" min="0" step="any"></label>
              <label>Origin X<input id="object-origin-x" type="number" min="0" max="1" step="any"></label>
              <label>Origin Y<input id="object-origin-y" type="number" min="0" max="1" step="any"></label>
            </div>
            <label class="inspector-field">Tags, comma separated<input id="object-tags" type="text"></label>
            <label class="checkbox-field"><input id="object-visible" type="checkbox"> Visible</label>
            <details open>
              <summary>Typed Properties</summary>
              <div id="property-list" class="inspector-list"></div>
              <div class="property-add-row">
                <input id="new-property-name" type="text" aria-label="Property name" placeholder="name">
                <select id="new-property-type" aria-label="Property type">
                  <option value="string">String</option><option value="int">Int</option><option value="float">Float</option>
                  <option value="bool">Bool</option><option value="color">Color</option><option value="file">File</option>
                </select>
                <input id="new-property-value" type="text" aria-label="Property value" placeholder="value">
                <button type="button" id="add-property" title="Add typed property">+</button>
              </div>
            </details>
            <details open>
              <summary>Components</summary>
              <div id="component-list" class="inspector-list"></div>
              <div class="button-row">
                <button type="button" id="add-sprite-component">+ SpriteRenderer</button>
                <button type="button" id="add-physics-component">+ PhysicsBody2D</button>
              </div>
            </details>
          </div>
        </section>
        <section class="panel palette-panel">
          <div class="panel-heading"><h2>Tile Sources</h2><button type="button" id="add-tileset" title="Add an extra atlas or single-image source">+ Add Extra</button></div>
          <select id="tileset-select" aria-label="Active tileset"></select>
          <div class="button-row tileset-actions"><span id="tileset-role" class="muted">Main source</span><button type="button" id="set-main-tileset">Set Main</button></div>
          <div class="tileset-image-viewport">
            <canvas id="tileset-canvas" aria-label="Select one or more tiles from the tileset" hidden></canvas>
          </div>
          <p id="tile-selection-label" class="tile-selection-label muted">No tile selected</p>
          <p id="palette-empty" class="muted empty-note">Add a tileset to choose tiles.</p>
        </section>
        <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      </aside>
      <main class="viewport-shell">
        <canvas id="map-canvas" aria-label="World2D map canvas"></canvas>
        <div id="empty-state" class="empty-state">Open or create a World2D map to begin.</div>
        <footer class="viewport-status"><span id="active-layer-label">No layer selected</span><span>Wheel: zoom · Middle drag: pan</span></footer>
      </main>
    </section>
    <dialog id="tileset-dialog">
      <form id="tileset-form">
        <header class="dialog-header"><h2>Add Extra Tile Source</h2><button type="button" id="close-tileset-dialog" aria-label="Close">×</button></header>
        <p id="tileset-source" class="muted">Choose an image from this workspace.</p>
        <img id="tileset-preview" alt="Tileset image preview" hidden>
        <p id="tileset-image-size" class="muted"></p>
        <div class="dimension-grid">
          <label>Cell width<input id="tile-width" type="number" min="1" value="16" required></label>
          <label>Cell height<input id="tile-height" type="number" min="1" value="16" required></label>
          <label>Margin X<input id="margin-x" type="number" min="0" value="0" required></label>
          <label>Margin Y<input id="margin-y" type="number" min="0" value="0" required></label>
          <label>Spacing X<input id="spacing-x" type="number" min="0" value="0" required></label>
          <label>Spacing Y<input id="spacing-y" type="number" min="0" value="0" required></label>
        </div>
        <p id="tileset-derived" class="muted">Columns and tile count are calculated from the image dimensions.</p>
        <p id="tileset-error" class="error-message" role="alert"></p>
        <div class="dialog-actions"><button type="button" id="choose-tileset-image">Choose Image</button><button type="submit" id="confirm-tileset" disabled>Add Extra Source</button></div>
      </form>
    </dialog>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${script}"></script>
</body>
</html>`;
}
