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
      <div class="header-status"><span id="notice" class="notice" role="status" aria-live="polite"></span><span class="shortcut-hint muted">Space play · ←/→ frame · W A S D direction</span><span id="save-status" class="save-status muted" role="status" aria-live="polite"></span></div>
    </header>
    <div class="workspace">
      <aside class="sidebar sidebar-left" aria-label="Clips and inputs">
        <section class="panel">
          <div class="panel-heading"><h2>Clips</h2><button type="button" id="add-clip" class="small-button">+ New clip</button></div>
          <ul id="clip-list" class="clip-list" aria-label="Animation clips"></ul>
        </section>
        <section class="panel">
          <div class="panel-heading"><h2>Clip settings</h2><button type="button" id="delete-clip" class="small-button danger-button">Delete clip</button></div>
          <label class="field">Name<input id="clip-name" type="text" autocomplete="off" spellcheck="false"></label>
          <div class="inspector-grid">
            <label>FPS<input id="clip-fps" type="number" min="0.01" step="any"></label>
            <label>Loop<select id="clip-loop"><option value="loop">Loop</option><option value="once">Once</option><option value="ping-pong">Ping-pong</option></select></label>
            <label>Canvas width<input id="canvas-width" type="number" min="1" step="1"></label>
            <label>Canvas height<input id="canvas-height" type="number" min="1" step="1"></label>
          </div>
          <label class="toggle-field"><input id="clip-directional" type="checkbox"><span><strong>4 directions</strong><small>Separate frames for up, left, down and right. The engine picks them with <code>animator.setDir(0–3)</code>.</small></span></label>
        </section>
        <section class="panel">
          <div class="panel-heading"><h2>Image inputs</h2><button type="button" id="add-input" class="small-button">+ New input</button></div>
          <label class="field">Filter by tag<select id="input-tag-filter" aria-label="Filter inputs by tag"><option value="">All tags</option></select></label>
          <ul id="input-list" class="input-list" aria-label="Template image inputs"></ul>
          <div id="input-editor" class="input-editor">
            <div class="inspector-grid">
              <label>ID<input id="input-id" type="text" autocomplete="off" spellcheck="false"></label>
              <label>Label<input id="input-label" type="text" autocomplete="off"></label>
            </div>
            <label class="field">Tags (comma separated)<input id="input-tags" type="text" autocomplete="off" placeholder="character, effects"></label>
            <label class="check-field"><input id="input-required" type="checkbox"> Required when binding</label>
            <div class="button-row">
              <button type="button" id="move-input-up" class="secondary-button" title="Move input up">↑</button>
              <button type="button" id="move-input-down" class="secondary-button" title="Move input down">↓</button>
              <button type="button" id="delete-input" class="danger-button">Remove</button>
            </div>
          </div>
          <p class="hint">Inputs are named image slots. Each layer crops one input; the game binds real textures to them. Preview images are only for this editor and are never saved.</p>
        </section>
        <details class="panel section-details template-details">
          <summary>Template info</summary>
          <label class="field">Template ID<input id="template-id" type="text" autocomplete="off" spellcheck="false"></label>
          <label class="field">Display name<input id="template-name" type="text" autocomplete="off"></label>
          <label class="field">Description<input id="template-description" type="text" autocomplete="off"></label>
        </details>
      </aside>
      <main class="main-column">
        <section class="stage-panel">
          <div class="stage-toolbar">
            <div id="direction-pad" class="direction-pad" role="group" aria-label="Preview direction">
              <button type="button" class="dir-button dir-up" data-direction="up" title="Up · dir 0 (W)">↑</button>
              <button type="button" class="dir-button dir-left" data-direction="left" title="Left · dir 1 (A)">←</button>
              <span id="direction-label" class="dir-center">↓</span>
              <button type="button" class="dir-button dir-right" data-direction="right" title="Right · dir 3 (D)">→</button>
              <button type="button" class="dir-button dir-down" data-direction="down" title="Down · dir 2 (S)">↓</button>
            </div>
            <div class="stage-info">
              <strong id="stage-title">No clip selected</strong>
              <span id="frame-label" class="muted">—</span>
              <div id="direction-tools" class="direction-tools">
                <label>Copy this direction to<select id="copy-direction-target" aria-label="Copy target direction"></select></label>
                <label class="check-field"><input id="copy-direction-mirror" type="checkbox"> Mirror</label>
                <button type="button" id="copy-direction" class="small-button secondary-button">Copy</button>
              </div>
            </div>
          </div>
          <div class="stage">
            <canvas id="preview-canvas" width="480" height="360" aria-label="Layered animation preview"></canvas>
            <p id="preview-empty" class="stage-empty" hidden></p>
          </div>
          <div class="transport">
            <button type="button" id="reset-preview" class="icon-button" title="First frame (Home)">⏮</button>
            <button type="button" id="prev-frame" class="icon-button" title="Previous frame (←)">◀</button>
            <button type="button" id="play-toggle" class="play-button" title="Play / pause (Space)">▶ Play</button>
            <button type="button" id="next-frame" class="icon-button" title="Next frame (→)">▶</button>
            <input id="frame-scrubber" type="range" min="0" max="0" value="0" aria-label="Frame">
          </div>
          <p class="hint stage-hint">Drag a layer to move it, its handles to resize, the top handle to rotate. Layers draw bottom to top in the order listed on the right.</p>
        </section>
        <section class="timeline-panel">
          <div class="panel-heading"><h2>Frames <span id="timeline-direction" class="badge"></span></h2><button type="button" id="add-frame" class="small-button" title="Adds a copy of the selected frame">+ Add frame</button></div>
          <ol id="frame-list" class="timeline" aria-label="Animation frames"></ol>
          <p class="hint">Drag frames to reorder them. Drag on the atlas below to crop art into the selected frame.</p>
        </section>
        <section class="atlas-panel">
          <div class="panel-heading"><h2>Crop atlas</h2><span id="atlas-dimensions" class="muted"></span></div>
          <div class="atlas-tools">
            <label>Input<select id="atlas-parameter" aria-label="Image input to crop"></select></label>
            <label>Preview image<select id="atlas-preview" aria-label="Preview image"></select></label>
            <button type="button" id="select-previews" class="secondary-button">Choose preview images…</button>
            <label>Dragging<select id="crop-action" aria-label="What a crop drag does"><option value="add-layer">Adds a layer to the frame</option><option value="replace-layer">Replaces the selected layer crop</option><option value="add-frame">Adds a new frame</option></select></label>
            <label>Grid<input id="crop-grid-size" type="number" min="1" step="1" value="16"></label>
            <label class="check-field"><input id="snap-grid" type="checkbox" checked> Snap</label>
            <span id="crop-hint" class="muted"></span>
          </div>
          <div class="atlas-scroll"><canvas id="atlas-canvas" aria-label="Sprite atlas crop grid"></canvas></div>
        </section>
        <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      </main>
      <aside class="sidebar sidebar-right" aria-label="Frame and layer settings">
        <section class="panel">
          <div class="panel-heading"><h2>Frame</h2><span id="frame-index-label" class="badge"></span></div>
          <label class="field">Duration (seconds)<input id="frame-duration" type="number" min="0.001" step="any" placeholder="Uses clip FPS"></label>
          <label class="field">Markers (comma separated)<input id="frame-markers" type="text" autocomplete="off" placeholder="step, impact"></label>
          <div class="button-row">
            <button type="button" id="move-frame-up" class="secondary-button" title="Move earlier">◀ Earlier</button>
            <button type="button" id="move-frame-down" class="secondary-button" title="Move later">Later ▶</button>
          </div>
          <div class="button-row"><button type="button" id="delete-frame" class="danger-button" title="Remove frame (Delete)">Remove frame</button></div>
        </section>
        <section class="panel">
          <div class="panel-heading"><h2>Layers</h2><button type="button" id="add-layer" class="small-button" title="Adds a layer using the atlas input">+ Layer</button></div>
          <ol id="layer-list" class="layer-list" aria-label="Selected frame layers"></ol>
          <div id="layer-fields">
            <label class="field">Image input<select id="layer-parameter" aria-label="Layer image input"></select></label>
            <label class="check-field"><input id="layer-visible" type="checkbox" checked> Visible</label>
            <div class="button-row">
              <button type="button" id="move-layer-up" class="secondary-button" title="Draw earlier (further back)">↓ Back</button>
              <button type="button" id="move-layer-down" class="secondary-button" title="Draw later (further front)">↑ Front</button>
              <button type="button" id="delete-layer" class="danger-button">Remove</button>
            </div>
            <details class="section-details" open>
              <summary>Source crop</summary>
              <div class="inspector-grid">
                <label>X<input id="layer-source-x" type="number" min="0" step="1"></label>
                <label>Y<input id="layer-source-y" type="number" min="0" step="1"></label>
                <label>Width<input id="layer-source-width" type="number" min="1" step="1"></label>
                <label>Height<input id="layer-source-height" type="number" min="1" step="1"></label>
              </div>
            </details>
            <details class="section-details">
              <summary>Transform</summary>
              <div class="inspector-grid">
                <label>Offset X<input id="layer-offset-x" type="number" step="0.25"></label>
                <label>Offset Y<input id="layer-offset-y" type="number" step="0.25"></label>
                <label>Stretch X<input id="layer-stretch-x" type="number" step="0.05"></label>
                <label>Stretch Y<input id="layer-stretch-y" type="number" step="0.05"></label>
                <label>Zoom<input id="layer-zoom" type="number" min="0.01" step="0.05"></label>
                <label>Rotation °<input id="layer-rotation" type="number" step="1"></label>
                <label>Pivot X<input id="layer-pivot-x" type="number" min="0" max="1" step="0.05"></label>
                <label>Pivot Y<input id="layer-pivot-y" type="number" min="0" max="1" step="0.05"></label>
              </div>
              <p class="hint">Offsets use canvas pixels. Negative stretch mirrors; pivot uses 0–1 of the crop.</p>
            </details>
          </div>
        </section>
      </aside>
    </div>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body></html>`;
}
