import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationTrees } from "../src/graph/GraphBuilder";
import { layoutConversationTree } from "../src/graph/Layout";
import { ThreadRecord } from "../src/graph/types";

test("layout is deterministic and primary branch stays in lane zero", () => {
  const threads: ThreadRecord[] = [
    makeThread("A", ["1", "2", "3"]),
    makeThread("B", ["1", "2", "4"], 2),
  ];
  threads[0].turns.forEach((turn, index) => { turn.startedAt = [100, 200, 400][index]; });
  threads[1].turns.forEach((turn, index) => { turn.startedAt = [100, 200, 300][index]; });
  const tree = buildConversationTrees(threads)[0];
  const first = layoutConversationTree(tree);
  const second = layoutConversationTree(tree);
  assert.deepEqual(first, second);
  assert.equal(first.rowHeight, 56);
  assert.equal(first.nodes[1].y - first.nodes[0].y, first.rowHeight);
  assert.equal(first.nodes[0].promptPreview, "3");
  assert.equal(first.nodes[1].promptPreview, "4");
  assert.equal(first.nodes[first.nodes.length - 1].promptPreview, "1");
  assert.deepEqual(first.nodes.filter((node) => ["node:1", "node:2", "node:3"].includes(node.id)).map((node) => node.lane), [0, 0, 0]);
  assert.equal(first.nodes.find((node) => node.promptPreview === "4")?.lane, 1);
  threads[1].archived = true;
  const archivedLayout = layoutConversationTree(buildConversationTrees(threads)[0]);
  assert.deepEqual(archivedLayout.nodes.find((node) => node.promptPreview === "4")?.headLabels, ["B [ARCHIVED]"]);
});

function makeThread(id: string, prompts: string[], createdAt = 1): ThreadRecord {
  return {
    id,
    sessionId: "A",
    createdAt,
    lineageMetadataAvailable: true,
    turns: prompts.map((prompt) => ({
      id: prompt,
      userText: prompt,
      promptPreview: prompt,
      assistantMessages: [{ text: `reply:${prompt}` }],
      rawItems: [],
    })),
  };
}
