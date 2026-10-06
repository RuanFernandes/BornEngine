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
      <span id="save-status" class="muted" role="status" aria-live="polite"></span>
    </header>
    <div class="workspace">
      <aside class="sidebar" aria-label="Animation settings">
        <section class="panel">
          <div class="panel-heading"><h2>Clip</h2></div>
          <label class="field">Animation<select id="clip-select" aria-label="Animation clip"></select></label>
          <div class="button-row"><button type="button" id="add-clip">+ Add Clip</button><button type="button" id="delete-clip">Delete</button></div>
        </section>
        <section id="clip-inspector" class="panel inspector-panel">
          <div class="panel-heading"><h2>Playback</h2></div>
          <label class="field">Clip name<input id="clip-name" type="text" autocomplete="off"></label>
          <label class="field">Animation group<select id="group-select" aria-label="Animation group"></select></label>
          <div class="inspector-grid">
            <label>FPS<input id="clip-fps" type="number" min="0.01" step="any"></label>
            <label>Loop<select id="clip-loop"><option value="loop">Loop</option><option value="once">Once</option><option value="ping-pong">Ping-pong</option></select></label>
          </div>
          <div class="inspector-grid canvas-size-grid">
            <label>Output width<input id="canvas-width" type="number" min="1" step="1"></label>
            <label>Output height<input id="canvas-height" type="number" min="1" step="1"></label>
          </div>
          <label class="field">Direction<select id="direction-select" aria-label="Preview direction"></select></label>
          <p id="source-label" class="muted source-label"></p>
        </section>
        <section class="panel frames-panel">
          <div class="panel-heading"><h2>Animation Frames</h2><button type="button" id="add-frames">+ Add Images</button></div>
          <p class="muted frames-help">Choose multiple images to create a sequence. You can crop frames from any image below.</p>
          <ol id="frame-list" class="frame-list" aria-label="Animation frame sequence"></ol>
          <div class="frame-inspector">
            <label class="field">Frame name<input id="frame-name" type="text" autocomplete="off"></label>
            <label class="field">Duration in seconds<input id="frame-duration" type="number" min="0.01" step="0.01" placeholder="Use clip FPS"></label>
            <div class="transform-heading"><strong>Frame transform</strong><button type="button" id="reset-frame-transform">Reset</button></div>
            <div class="inspector-grid">
              <label>Offset X<input id="frame-offset-x" type="number" step="0.5"></label>
              <label>Offset Y<input id="frame-offset-y" type="number" step="0.5"></label>
              <label>Stretch X <span>(negative mirrors)</span><input id="frame-stretch-x" type="number" min="-10" max="10" step="0.05"></label>
              <label>Stretch Y <span>(negative mirrors)</span><input id="frame-stretch-y" type="number" min="-10" max="10" step="0.05"></label>
              <label>Pivot X (0–1)<input id="frame-pivot-x" type="number" min="0" max="1" step="0.05"></label>
              <label>Pivot Y (0–1)<input id="frame-pivot-y" type="number" min="0" max="1" step="0.05"></label>
            </div>
            <label class="field rotation-field">Rotation / angle <span>(degrees)</span><input id="frame-rotation-range" type="range" min="-180" max="180" step="1"><input id="frame-rotation" type="number" step="1"></label>
            <label class="field zoom-field">Frame zoom<input id="frame-zoom-range" type="range" min="0.1" max="4" step="0.05"><input id="frame-zoom" type="number" min="0.01" step="0.05"></label>
            <div class="button-row"><button type="button" id="move-frame-up" title="Move frame up">↑</button><button type="button" id="move-frame-down" title="Move frame down">↓</button><button type="button" id="delete-frame">Remove</button></div>
          </div>
        </section>
        <section class="panel help-panel">
          <p id="empty-note" class="muted">Create a clip to start previewing this sprite sheet.</p>
          <p id="loading-note" class="muted" hidden>Checking sprite sheet dimensions…</p>
        </section>
      </aside>
      <main class="preview-workspace">
        <section class="preview-panel">
          <div class="panel-heading"><h2>Frame Preview</h2><span id="frame-label" class="muted">—</span></div>
          <div class="preview-layout">
            <canvas id="preview-canvas" width="320" height="320" aria-label="Current sprite frame"></canvas>
            <div class="playback-controls">
              <p class="preview-hint muted">Drag the image to change its offset. Adjust stretch, pivot and rotation in the frame settings.</p>
              <div class="button-row"><button type="button" id="play-toggle">Play</button><button type="button" id="reset-preview">Reset</button></div>
              <label class="scrubber-label">Frame<input id="frame-scrubber" type="range" min="0" max="0" value="0"></label>
            </div>
          </div>
        </section>
        <section class="atlas-panel">
          <div class="panel-heading"><h2>Sprite Sheet</h2><span id="atlas-dimensions" class="muted"></span></div>
          <div class="atlas-tools">
            <label>Image<select id="atlas-image" aria-label="Crop source image"></select></label>
            <label>Grid<input id="crop-grid-size" type="number" min="1" step="1" value="16"></label>
            <label class="check-field"><input id="snap-grid" type="checkbox" checked> Snap to grid</label>
            <button type="button" id="crop-mode">Crop frames</button>
            <span id="crop-hint" class="muted">Select an image, then drag to crop a frame.</span>
          </div>
          <div class="atlas-scroll"><canvas id="atlas-canvas" aria-label="Sprite sheet frame grid"></canvas></div>
        </section>
        <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      </main>
    </div>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${script}"></script>
</body>
</html>`;
}
