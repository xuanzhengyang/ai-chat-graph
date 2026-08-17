import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Turn Detail renders User Prompt first and Assistant messages oldest to newest", () => {
  const source = readFileSync(join(__dirname, "../../media/main.js"), "utf8");
  const start = source.indexOf("function renderDetail(turn)");
  const end = source.indexOf("function appendMessage", start);
  const renderDetail = source.slice(start, end);

  const userPosition = renderDetail.indexOf('appendMessage("USER PROMPT"');
  const assistantPosition = renderDetail.indexOf("turn.assistantMessages.forEach");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(userPosition >= 0 && userPosition < assistantPosition);
  assert.doesNotMatch(renderDetail, /assistantMessages\.slice\(\)\.reverse\(\)/u);
});
