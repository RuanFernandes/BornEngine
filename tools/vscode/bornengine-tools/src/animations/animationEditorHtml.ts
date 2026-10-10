import type * as vscode from 'vscode';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAnimationEditorHtml(
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
  <title>BornEngine Sprite Animation</title>
</head>
<body>
  <div id="app">
    <header class="app-header">
      <div class="brand"><strong>BornEngineTools</strong><span>2D Animation</span><span id="document-name" class="document-name">Sprite Animation</span></div>
      <div class="header-status"><span id="notice" class="notice" role="status" aria-live="polite"></span><span class="shortcut-hint muted">Space play · ←/→ frame · W A S D direction</span><span id="save-status" class="save-status muted" role="status" aria-live="polite"></span></div>
    </header>
    <div class="workspace">
      <aside class="sidebar sidebar-left" aria-label="Clips">
        <section class="panel">
          <div class="panel-heading"><h2>Clips</h2><button type="button" id="add-clip" class="small-button">+ New clip</button></div>
          <ul id="clip-list" class="clip-list" aria-label="Animation clips"></ul>
          <p id="empty-note" class="empty-note muted">Create a clip to start previewing this sprite sheet.</p>
          <p id="loading-note" class="empty-note muted" hidden>Checking sprite sheet dimensions…</p>
        </section>
        <section id="clip-inspector" class="panel">
          <div class="panel-heading"><h2>Clip settings</h2><button type="button" id="delete-clip" class="small-button danger-button">Delete clip</button></div>
          <label class="field">Name<input id="clip-name" type="text" autocomplete="off" spellcheck="false"></label>
          <div class="inspector-grid">
            <label>FPS<input id="clip-fps" type="number" min="0.01" step="any"></label>
            <label>Loop<select id="clip-loop"><option value="loop">Loop</option><option value="once">Once</option><option value="ping-pong">Ping-pong</option></select></label>
            <label>Canvas width<input id="canvas-width" type="number" min="1" step="1"></label>
            <label>Canvas height<input id="canvas-height" type="number" min="1" step="1"></label>
          </div>
          <label class="toggle-field"><input id="clip-directional" type="checkbox"><span><strong>4 directions</strong><small>Separate frames for up, left, down and right. The engine picks them with <code>animator.setDir(0–3)</code>.</small></span></label>
          <div id="sheet-source" class="sheet-source">
            <div class="subheading">Sprite sheet rows</div>
            <label class="field">Animation group<select id="group-select" aria-label="Animation group"></select></label>
            <label class="field">Row<select id="direction-select" aria-label="Sprite sheet row"></select></label>
            <p class="hint">Frames come straight from the sheet metadata. Editing a frame turns this clip into custom frames.</p>
          </div>
          <p id="source-label" class="hint source-label"></p>
        </section>
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
            <canvas id="preview-canvas" width="320" height="320" aria-label="Current sprite frame"></canvas>
            <p id="preview-empty" class="stage-empty" hidden></p>
          </div>
          <div class="transport">
            <button type="button" id="reset-preview" class="icon-button" title="First frame (Home)">⏮</button>
            <button type="button" id="prev-frame" class="icon-button" title="Previous frame (←)">◀</button>
            <button type="button" id="play-toggle" class="play-button" title="Play / pause (Space)">▶ Play</button>
            <button type="button" id="next-frame" class="icon-button" title="Next frame (→)">▶</button>
            <input id="frame-scrubber" type="range" min="0" max="0" value="0" aria-label="Frame">
          </div>
          <p class="hint stage-hint">Drag the sprite in the preview to move its offset.</p>
        </section>
        <section class="timeline-panel">
          <div class="panel-heading"><h2>Frames <span id="timeline-direction" class="badge"></span></h2><button type="button" id="add-frames" class="small-button">+ Add images</button></div>
          <ol id="frame-list" class="timeline" aria-label="Animation frame sequence"></ol>
          <p class="hint">Drag frames to reorder them. Drag on the sheet below to crop a new frame.</p>
        </section>
        <section class="atlas-panel">
          <div class="panel-heading"><h2>Sprite sheet</h2><span id="atlas-dimensions" class="muted"></span></div>
          <div class="atlas-tools">
            <label>Image<select id="atlas-image" aria-label="Crop source image"></select></label>
            <label>Dragging<select id="crop-action" aria-label="What a crop drag does"><option value="add">Adds a new frame</option><option value="replace">Replaces the selected frame</option></select></label>
            <label>Grid<input id="crop-grid-size" type="number" min="1" step="1" value="16"></label>
            <label class="check-field"><input id="snap-grid" type="checkbox" checked> Snap</label>
            <span id="crop-hint" class="muted"></span>
          </div>
          <div class="atlas-scroll"><canvas id="atlas-canvas" aria-label="Sprite sheet frame grid"></canvas></div>
        </section>
        <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      </main>
      <aside class="sidebar sidebar-right" aria-label="Frame settings">
        <section class="panel frame-inspector">
          <div class="panel-heading"><h2>Frame</h2><span id="frame-index-label" class="badge"></span></div>
          <p id="frame-empty" class="empty-note muted">Select a frame in the timeline.</p>
          <div id="frame-fields">
            <label class="field">Name<input id="frame-name" type="text" autocomplete="off" spellcheck="false"></label>
            <label class="field">Duration (seconds)<input id="frame-duration" type="number" min="0.01" step="0.01" placeholder="Uses clip FPS"></label>
            <div class="button-row">
              <button type="button" id="move-frame-up" class="secondary-button" title="Move earlier">◀ Earlier</button>
              <button type="button" id="move-frame-down" class="secondary-button" title="Move later">Later ▶</button>
            </div>
            <div class="button-row">
              <button type="button" id="duplicate-frame" class="secondary-button">Duplicate</button>
              <button type="button" id="delete-frame" class="danger-button" title="Remove frame (Delete)">Remove</button>
            </div>
            <details class="section-details" open>
              <summary>Transform</summary>
              <div class="details-actions"><button type="button" id="reset-frame-transform" class="link-button">Reset transform</button></div>
              <div class="inspector-grid">
                <label>Offset X<input id="frame-offset-x" type="number" step="0.5"></label>
                <label>Offset Y<input id="frame-offset-y" type="number" step="0.5"></label>
                <label>Stretch X<input id="frame-stretch-x" type="number" min="-10" max="10" step="0.05"></label>
                <label>Stretch Y<input id="frame-stretch-y" type="number" min="-10" max="10" step="0.05"></label>
                <label>Pivot X<input id="frame-pivot-x" type="number" min="0" max="1" step="0.05"></label>
                <label>Pivot Y<input id="frame-pivot-y" type="number" min="0" max="1" step="0.05"></label>
              </div>
              <label class="field slider-field">Rotation (°)<span class="slider-row"><input id="frame-rotation-range" type="range" min="-180" max="180" step="1"><input id="frame-rotation" type="number" step="1"></span></label>
              <label class="field slider-field">Zoom<span class="slider-row"><input id="frame-zoom-range" type="range" min="0.1" max="4" step="0.05"><input id="frame-zoom" type="number" min="0.01" step="0.05"></span></label>
              <p class="hint">Negative stretch mirrors the frame. Pivot uses 0–1 of the frame size.</p>
            </details>
          </div>
        </section>
      </aside>
    </div>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${script}"></script>
</body>
</html>`;
}
