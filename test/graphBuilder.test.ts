import test from "node:test";
import assert from "node:assert/strict";
import { buildConversationTrees } from "../src/graph/GraphBuilder";
import { ThreadRecord, TurnRecord } from "../src/graph/types";

test("Case A: linear history has three nodes and one head", () => {
  const tree = onlyTree([thread("A", "A", [turn("1"), turn("2"), turn("3")])]);
  assert.equal(tree.nodes.length, 3);
  assert.equal(edgeCount(tree.nodes), 2);
  assert.deepEqual(tree.nodes[2].headThreadIds, ["A"]);
});

test("Case B: one fork shares its two-node prefix", () => {
  const tree = onlyTree([
    thread("A", "A", [turn("1"), turn("2"), turn("3"), turn("4")]),
    thread("B", "A", [turn("1"), turn("2"), turn("5"), turn("6")], 2),
  ]);
  assert.equal(tree.nodes.length, 6);
  assert.equal(tree.nodes[1].childIds.length, 2);
  assert.deepEqual(headMap(tree.nodes), { "4": ["A"], "6": ["B"] });
});

test("Case C: nested fork merges only the shared nested prefix", () => {
  const tree = onlyTree([
    thread("A", "A", [turn("1"), turn("2"), turn("3")]),
    thread("B", "A", [turn("1"), turn("2"), turn("4"), turn("5")], 2),
    thread("C", "A", [turn("1"), turn("2"), turn("4"), turn("6")], 3),
  ]);
  assert.equal(tree.nodes.length, 6);
  const four = tree.nodes.find((node) => node.promptPreview === "4");
  assert.equal(four?.childIds.length, 2);
});

test("Case D: copied history with changed ids merges by content", () => {
  const tree = onlyTree([
    thread("A", "A", [turn("a1", "P1", "R1"), turn("a2", "P2", "R2")]),
    thread("B", "A", [turn("b1", "P1", "R1"), turn("b2", "P2", "R2"), turn("b3", "P3", "R3")], 2),
  ]);
  assert.equal(tree.nodes.length, 3);
  assert.equal(tree.nodes[0].sources.length, 2);
  assert.equal(tree.nodes[1].sources.length, 2);
});

test("Case E: equal turns after divergence remain separate", () => {
  const tree = onlyTree([
    thread("A", "A", [turn("a1", "P1"), turn("a2", "PA"), turn("a3", "SAME")]),
    thread("B", "A", [turn("b1", "P1"), turn("b2", "PB"), turn("b3", "SAME")], 2),
  ]);
  assert.equal(tree.nodes.filter((node) => node.promptPreview === "SAME").length, 2);
});

test("Case F: identical histories attach both heads to one node", () => {
  const tree = onlyTree([
    thread("A", "A", [turn("1"), turn("2"), turn("3")]),
    thread("B", "A", [turn("1"), turn("2"), turn("3")], 2),
  ]);
  assert.equal(tree.nodes.length, 3);
  assert.deepEqual(tree.nodes[2].headThreadIds, ["A", "B"]);
});

test("missing lineage metadata stays isolated and marked unavailable", () => {
  const isolated = thread("B", "thread:B", [turn("1")]);
  isolated.lineageMetadataAvailable = false;
  const trees = buildConversationTrees([thread("A", "A", [turn("1")]), isolated]);
  assert.equal(trees.length, 2);
  assert.equal(trees.find((tree) => tree.sessionId === "thread:B")?.lineageMetadataAvailable, false);
});

test("forkedFromId groups forks even when every sessionId is self", () => {
  const root = thread("root", "root", [turn("1"), turn("2")], 1);
  const archivedParent = thread("parent", "parent", [turn("1"), turn("2"), turn("3")], 2);
  archivedParent.forkedFromId = "root";
  archivedParent.archived = true;
  const child = thread("child", "child", [turn("1"), turn("2"), turn("3"), turn("4")], 3);
  child.forkedFromId = "parent";

  const trees = buildConversationTrees([root, child, archivedParent]);
  assert.equal(trees.length, 1);
  assert.equal(trees[0].sessionId, "root");
  assert.equal(trees[0].threads.length, 3);
  assert.equal(trees[0].nodes.length, 4);
});

test("conversation trees are ordered by newest update first", () => {
  const older = thread("older", "older", [turn("1")], 1);
  older.updatedAt = 100;
  const newer = thread("newer", "newer", [turn("2")], 2);
  newer.updatedAt = 200;
  assert.deepEqual(buildConversationTrees([older, newer]).map((tree) => tree.sessionId), ["newer", "older"]);
});

function onlyTree(threads: ThreadRecord[]) {
  const trees = buildConversationTrees(threads);
  assert.equal(trees.length, 1);
  return trees[0];
}

function thread(id: string, sessionId: string, turns: TurnRecord[], createdAt = 1): ThreadRecord {
  return {
    id,
    sessionId,
    createdAt,
    turns,
    lineageMetadataAvailable: true,
  };
}

function turn(id: string, prompt = id, answer = `reply:${prompt}`): TurnRecord {
  return {
    id,
    userText: prompt,
    promptPreview: prompt,
    assistantMessages: [{ text: answer, phase: "final_answer" }],
    rawItems: [],
  };
}

function edgeCount(nodes: Array<{ childIds: string[] }>): number {
  return nodes.reduce((count, node) => count + node.childIds.length, 0);
}

function headMap(nodes: Array<{ promptPreview: string; headThreadIds: string[] }>): Record<string, string[]> {
  return Object.fromEntries(nodes.filter((node) => node.headThreadIds.length > 0).map((node) => [node.promptPreview, node.headThreadIds]));
}
