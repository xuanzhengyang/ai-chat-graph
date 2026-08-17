import test from "node:test";
import assert from "node:assert/strict";
import { makePromptPreview, normalizeThread } from "../src/codex/normalize";

test("prompt preview collapses whitespace and truncates by Unicode character", () => {
  const source = `  ${"界".repeat(81)}\n test  `;
  assert.equal(makePromptPreview(source, "id"), `${"界".repeat(80)}…`);
});

test("normalizer extracts all user and assistant messages", () => {
  const thread = normalizeThread({
    id: "thread-a",
    sessionId: "tree-a",
    turns: [{
      id: "turn-a",
      startedAt: 1785077848,
      completedAt: 1785078550,
      items: [
        { type: "userMessage", content: [{ type: "text", text: "hello" }, { type: "localImage" }] },
        { type: "userMessage", content: [{ type: "text", text: "again" }] },
        { type: "agentMessage", text: "working", phase: "commentary" },
        { type: "agentMessage", text: "done", phase: "final_answer" },
        { type: "commandExecution", command: "ignored" },
      ],
    }],
  });
  assert.equal(thread?.turns[0].userText, "hello\n[local image]\nagain");
  assert.equal(thread?.turns[0].promptPreview, "hello again");
  assert.deepEqual(thread?.turns[0].assistantMessages, [
    { text: "working", phase: "commentary" },
    { text: "done", phase: "final_answer" },
  ]);
  assert.equal(thread?.turns[0].startedAt, 1785077848);
  assert.equal(thread?.turns[0].completedAt, 1785078550);
});

test("image-only turn gets a stable image preview", () => {
  const thread = normalizeThread({
    id: "thread-a",
    turns: [{ id: "turn-a", items: [{ type: "userMessage", content: [{ type: "image" }] }] }],
  });
  assert.equal(thread?.sessionId, "thread:thread-a");
  assert.equal(thread?.lineageMetadataAvailable, false);
  assert.equal(thread?.turns[0].promptPreview, "[Image input]");
});
