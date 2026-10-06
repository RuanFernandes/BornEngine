import type * as vscode from 'vscode';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildBlueprintEditorHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
  nonce: string,
): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${escapeAttribute(nonce)}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${escapeAttribute(styleUri.toString())}">
  <title>BornEngine Blueprint</title>
</head>
<body>
  <div id="blueprint-editor">
    <header class="editor-header">
      <div class="brand"><strong>BornEngineTools</strong><span class="badge">Blueprint</span><span id="blueprint-title">Blueprint</span></div>
      <div class="header-actions"><span id="save-status" class="muted" role="status" aria-live="polite">Loading…</span><button id="open-as-text" type="button">Open as Text</button></div>
    </header>
    <main class="editor-layout">
      <section class="panel fields-panel">
        <div class="section-heading"><div><h1>Blueprint</h1><p class="muted">Identity and values defined by the selected template.</p></div></div>
        <label class="identity-field">Name<input id="blueprint-name" type="text" autocomplete="off"></label>
        <label class="identity-field">Description<textarea id="blueprint-description" rows="2"></textarea></label>
        <h2>Blueprint Fields</h2>
        <div id="fields-list" class="fields-list"></div>
      </section>
      <section class="panel graph-panel">
        <div class="section-heading graph-heading">
          <div><h2>Execution Graph</h2><p class="muted">Events start the flow. Connect only declared execution pins.</p></div>
          <div class="button-row"><select id="event-catalog" aria-label="Declared events"></select><button id="add-event" type="button">+ Add Event</button><select id="node-catalog" aria-label="Declared actions and conditions"></select><button id="add-node" type="button">+ Add Node</button></div>
        </div>
        <div id="graph-viewport" class="graph-viewport">
          <div id="graph-canvas" class="graph-canvas"><svg id="graph-wires" class="graph-wires" aria-hidden="true"></svg><div id="graph-nodes" class="graph-nodes"></div></div>
        </div>
        <section class="connection-panel">
          <div class="section-heading"><div><h3>Connection</h3><p class="muted">Choose an output pin and an input pin to create a flow link.</p></div><button id="add-connection" type="button">Connect</button></div>
          <div class="connection-controls"><label>From<select id="connection-from"></select></label><label>To<select id="connection-to"></select></label></div>
          <div id="connections-list" class="connections-list"></div>
        </section>
      </section>
      <details class="panel json-panel" open><summary>JSON Preview</summary><textarea id="json-preview" readonly spellcheck="false" aria-label="Generated blueprint JSON"></textarea></details>
    </main>
    <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
    <section id="source-warning" class="source-warning" role="alert" hidden></section>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body>
</html>`;
}
