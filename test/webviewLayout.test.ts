import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(__dirname, "../..");

test("Webview exposes an accessible draggable pane divider", () => {
  const html = readFileSync(join(projectRoot, "src/webview/html.ts"), "utf8");
  const script = readFileSync(join(projectRoot, "media/main.js"), "utf8");

  assert.match(html, /id="pane-resizer"[^>]+role="separator"/u);
  assert.match(script, /paneResizer\.addEventListener\("pointerdown"/u);
  assert.match(script, /paneResizer\.addEventListener\("keydown"/u);
  assert.match(script, /paneResizer\.addEventListener\("dblclick"/u);
  assert.match(script, /vscode\.setState\(/u);
});

test("Prompt timestamp is rendered below the Prompt text", () => {
  const script = readFileSync(join(projectRoot, "media/main.js"), "utf8");
  const start = script.indexOf('const promptStack = document.createElement("div")');
  const end = script.indexOf("node.headLabels.forEach", start);
  const promptRendering = script.slice(start, end);

  const promptPosition = promptRendering.indexOf("promptStack.appendChild(button)");
  const timePosition = promptRendering.indexOf("promptStack.appendChild(time)");
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(promptPosition >= 0 && promptPosition < timePosition);
});
