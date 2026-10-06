import type * as vscode from 'vscode';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSpriteAnimationTemplateEditorHtml(
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
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${escapeAttribute(styleUri.toString())}">
  <title>BornEngine Sprite Animation Template</title>
</head><body>
  <div id="app">
    <header class="app-header">
      <div class="brand"><strong>BornEngineTools</strong><span>Animation Template</span><span id="document-name" class="document-name">New Template</span></div>
      <span id="save-status" class="muted" role="status" aria-live="polite"></span>
    </header>
    <div class="workspace">
      <aside class="sidebar" aria-label="Animation template settings">
        <section class="panel">
          <div class="panel-heading"><h2>Template</h2></div>
          <label class="field">Template ID<input id="template-id" type="text" autocomplete="off"></label>
          <label class="field">Display name<input id="template-name" type="text" autocomplete="off"></label>
          <label class="field">Description<input id="template-description" type="text" autocomplete="off"></label>
        </section>
        <section class="panel inputs-panel">
          <div class="panel-heading"><h2>Image Inputs</h2><button type="button" id="add-input">+ Input</button></div>
          <label class="field">Filter by tag<select id="input-tag-filter" aria-label="Filter inputs by tag"><option value="">All tags</option></select></label>
          <ol id="input-list" class="input-list" aria-label="Template image inputs"></ol>
          <p class="muted hint">IDs are chosen by you and connect textures to layers. Preview images stay temporary and are never written into this template.</p>
        </section>
        <section class="panel clip-panel">
          <div class="panel-heading"><h2>Clip</h2><div class="panel-actions"><button type="button" id="add-clip">+ Clip</button><button type="button" id="delete-clip">Remove</button></div></div>
          <label class="field">Animation<select id="clip-select" aria-label="Animation clip"></select></label>
          <label class="field">Clip name<input id="clip-name" type="text" autocomplete="off"></label>
          <div class="inspector-grid">
            <label>FPS<input id="clip-fps" type="number" min="0.01" step="any"></label>
            <label>Loop<select id="clip-loop"><option value="loop">Loop</option><option value="once">Once</option><option value="ping-pong">Ping-pong</option></select></label>
            <label>Canvas width<input id="canvas-width" type="number" min="1" step="1"></label>
            <label>Canvas height<input id="canvas-height" type="number" min="1" step="1"></label>
          </div>
        </section>
        <section class="panel frames-panel">
          <div class="panel-heading"><h2>Frames</h2><button type="button" id="add-frame">+ Frame</button></div>
          <ol id="frame-list" class="frame-list" aria-label="Animation frames"></ol>
          <label class="field">Frame duration (seconds)<input id="frame-duration" type="number" min="0.001" step="any" placeholder="Use clip FPS"></label>
          <label class="field">Markers (comma separated)<input id="frame-markers" type="text" autocomplete="off" placeholder="step, impact"></label>
          <div class="button-row"><button type="button" id="move-frame-up" title="Move frame up">↑</button><button type="button" id="move-frame-down" title="Move frame down">↓</button><button type="button" id="delete-frame">Remove frame</button></div>
        </section>
        <section class="panel layers-panel">
          <div class="panel-heading"><h2>Layers</h2><button type="button" id="add-layer">+ Layer</button></div>
          <ol id="layer-list" class="layer-list" aria-label="Selected frame layers"></ol>
          <label class="field">Image input<select id="layer-parameter" aria-label="Layer image input"></select></label>
          <label class="check-field"><input id="layer-visible" type="checkbox" checked> Visible</label>
          <div class="inspector-subheading">Source crop</div>
          <div class="inspector-grid compact-grid">
            <label>X<input id="layer-source-x" type="number" min="0" step="1"></label>
            <label>Y<input id="layer-source-y" type="number" min="0" step="1"></label>
            <label>Width<input id="layer-source-width" type="number" min="1" step="1"></label>
            <label>Height<input id="layer-source-height" type="number" min="1" step="1"></label>
          </div>
          <div class="inspector-subheading">Transform</div>
          <div class="inspector-grid compact-grid">
            <label>Offset X<input id="layer-offset-x" type="number" step="0.25"></label>
            <label>Offset Y<input id="layer-offset-y" type="number" step="0.25"></label>
            <label>Stretch X<input id="layer-stretch-x" type="number" step="0.05"></label>
            <label>Stretch Y<input id="layer-stretch-y" type="number" step="0.05"></label>
            <label>Zoom<input id="layer-zoom" type="number" min="0.01" step="0.05"></label>
            <label>Rotation °<input id="layer-rotation" type="number" step="1"></label>
            <label>Pivot X<input id="layer-pivot-x" type="number" min="0" max="1" step="0.05"></label>
            <label>Pivot Y<input id="layer-pivot-y" type="number" min="0" max="1" step="0.05"></label>
          </div>
          <p class="muted hint">Offsets use the clip canvas. Negative stretch mirrors the image; zoom stays positive and pivot uses values from 0 to 1.</p>
          <div class="button-row"><button type="button" id="move-layer-up">↑ Layer</button><button type="button" id="move-layer-down">↓ Layer</button><button type="button" id="delete-layer">Remove layer</button></div>
        </section>
      </aside>
      <main class="preview-workspace">
        <section class="preview-panel">
          <div class="panel-heading"><h2>Composite Preview</h2><span id="frame-label" class="muted">—</span></div>
          <div class="preview-layout">
            <canvas id="preview-canvas" width="480" height="360" aria-label="Layered animation preview"></canvas>
            <div class="playback-controls">
              <p class="muted hint">Frames share one timeline. Layers are drawn from bottom to top in the order shown on the left.</p>
              <div class="button-row"><button type="button" id="play-toggle">Play</button><button type="button" id="reset-preview">Reset</button></div>
              <label class="field">Frame<input id="frame-scrubber" type="range" min="0" max="0" value="0"></label>
            </div>
          </div>
        </section>
        <section class="atlas-panel">
          <div class="panel-heading"><h2>Crop Atlas</h2><span id="atlas-dimensions" class="muted"></span></div>
          <div class="atlas-tools">
            <label>Input<select id="atlas-parameter" aria-label="Image input to crop"></select></label>
            <label>Preview variant<select id="atlas-preview" aria-label="Preview image variant"></select></label>
            <button type="button" id="select-previews">Choose / Replace Preview Images</button>
            <label>Grid<input id="crop-grid-size" type="number" min="1" step="1" value="16"></label>
            <label class="check-field"><input id="snap-grid" type="checkbox" checked> Snap to grid</label>
            <button type="button" id="crop-mode">Crop layer</button>
            <span id="crop-hint" class="muted">Choose preview images for an input, then drag to add a crop layer.</span>
          </div>
          <div class="atlas-scroll"><canvas id="atlas-canvas" aria-label="Sprite atlas crop grid"></canvas></div>
        </section>
        <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      </main>
    </div>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body></html>`;
}
