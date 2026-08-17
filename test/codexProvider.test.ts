import test from "node:test";
import assert from "node:assert/strict";
import { CodexProvider } from "../src/codex/CodexProvider";
import { ThreadListPage, ThreadListParams } from "../src/codex/protocol";

test("provider follows an archived fork parent without loading unrelated archives", async () => {
  const root = rawThread("root", undefined, 1, 2);
  const parent = rawThread("parent", "root", 1, 3);
  const child = rawThread("child", "parent", 1, 4);
  const unrelated = rawThread("unrelated-archive", undefined, 10, 1);
  const reads = new Map([root, parent, child, unrelated].map((thread) => [thread.id, { thread }]));
  const client = {
    async listThreads(params: ThreadListParams): Promise<ThreadListPage> {
      return { data: params.archived ? [parent, unrelated] : [root, child] };
    },
    async readThread(threadId: string): Promise<unknown> {
      const response = reads.get(threadId);
      if (!response) {
        throw new Error(`missing fixture ${threadId}`);
      }
      return response;
    },
  };

  const result = await new CodexProvider(client).loadWorkspace("/workspace");
  assert.deepEqual(result.threads.map((thread) => thread.id), ["root", "child", "parent"]);
  const loadedParent = result.threads.find((thread) => thread.id === "parent");
  assert.equal(loadedParent?.archived, true);
  assert.equal(loadedParent?.lineageOnly, true);
  assert.equal(result.threads.some((thread) => thread.id === "unrelated-archive"), false);
});

function rawThread(id: string, forkedFromId: string | undefined, createdAt: number, turnCount: number) {
  return {
    id,
    sessionId: id,
    forkedFromId: forkedFromId ?? null,
    cwd: "/workspace",
    name: id,
    preview: id,
    createdAt,
    updatedAt: createdAt + turnCount,
    turns: Array.from({ length: turnCount }, (_, index) => ({
      id: `turn-${index + 1}`,
      startedAt: 1_700_000_000 + index,
      completedAt: 1_700_000_001 + index,
      items: [
        { type: "userMessage", content: [{ type: "text", text: `prompt-${index + 1}` }] },
        { type: "agentMessage", text: `answer-${index + 1}`, phase: "final_answer" },
      ],
    })),
  };
}
