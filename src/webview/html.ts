import * as vscode from "vscode";

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "main.css"));
  const nonce = makeNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>AI Chat Graph</title>
</head>
<body>
  <header class="toolbar">
    <div class="identity">
      <strong>AI Chat Graph</strong>
      <span id="workspace" class="workspace"></span>
    </div>
    <div class="controls">
      <label for="tree-selector">Conversation</label>
      <select id="tree-selector" disabled></select>
      <button id="refresh" type="button">Refresh</button>
    </div>
  </header>
  <div id="status" class="status" role="status"></div>
  <main id="content" class="content">
    <section class="graph-pane" aria-label="Prompt Graph">
      <h2>Prompt Graph</h2>
      <div id="graph-note" class="graph-note"></div>
      <div id="graph-scroll" class="graph-scroll">
        <div id="graph-stage" class="graph-stage"></div>
      </div>
    </section>
    <div id="pane-resizer" class="pane-resizer" role="separator" aria-label="Resize Prompt Graph and Turn Detail" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" aria-valuenow="58" tabindex="0"></div>
    <section class="detail-pane" aria-label="Turn Detail">
      <h2>Turn Detail</h2>
      <div id="detail" class="detail empty">Select a prompt to inspect the complete turn.</div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
