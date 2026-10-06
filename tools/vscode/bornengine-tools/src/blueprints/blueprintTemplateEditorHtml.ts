import type * as vscode from 'vscode';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildBlueprintTemplateEditorHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
  nonce: string,
): string {
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${escapeAttribute(nonce)}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${escapeAttribute(styleUri.toString())}">
  <title>BornEngine Blueprint Template</title>
</head>
<body>
  <div id="template-editor">
    <header class="editor-header">
      <div><strong>BornEngineTools</strong><span class="header-subtitle">Blueprint Template</span><span id="template-title">New Template</span></div>
      <span id="save-status" class="muted" role="status" aria-live="polite"></span>
    </header>
    <main class="editor-content">
      <section class="panel identity-panel">
        <div class="section-heading"><div><h1>Template</h1><p class="muted">A reusable form and a catalog of allowed game operations.</p></div></div>
        <div class="identity-grid">
          <label>Template ID<input id="template-id" type="text" data-path='["id"]' autocomplete="off"><span class="id-feedback" aria-live="polite"></span></label>
          <label>Display name<input id="template-name" type="text" data-path='["name"]' autocomplete="off"></label>
          <label>Revision<input id="template-revision" type="number" min="1" step="1" data-path='["revision"]'></label>
          <label>Description<input id="template-description" type="text" data-path='["description"]' autocomplete="off"></label>
        </div>
        <p class="muted schema-note">Schema version is independent from template revision. Operation IDs are handled by your game code.</p>
      </section>

      <section class="panel">
        <div class="section-heading"><div><h2>Fields</h2><p class="muted">Values available on every blueprint made from this template.</p></div><button id="add-field" type="button" data-action="add-field" data-list='["fields"]'>+ Add Field</button></div>
        <p class="muted">Field types include nested object properties and array item schemas.</p>
        <div id="fields-list" class="definition-list" aria-label="Template fields"></div>
      </section>

      <section class="panel">
        <div class="section-heading"><div><h2>Events</h2><p class="muted">Events start an execution graph and expose an output pin.</p></div><button type="button" data-action="add-event">+ Add Event</button></div>
        <div id="events-list" class="definition-list" aria-label="Template events"></div>
      </section>

      <section class="panel">
        <div class="section-heading"><div><h2>Actions and Conditions</h2><p class="muted">Nodes map to operation IDs implemented by the game.</p></div><div class="button-row"><button type="button" data-action="add-node" data-category="action">+ Action</button><button type="button" data-action="add-node" data-category="condition">+ Condition</button></div></div>
        <p class="muted">Execution inputs are incoming pins; execution outputs are outgoing pins. Conditions expose true and false outputs.</p>
        <div id="nodes-list" class="definition-list" aria-label="Template node catalog"></div>
      </section>

      <section id="diagnostics" class="diagnostics" role="status" aria-live="polite" hidden></section>
      <section id="source-warning" class="source-warning" role="alert" hidden></section>
    </main>
  </div>
  <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri.toString())}"></script>
</body>
</html>`;
}
