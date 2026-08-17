import { areTurnsEquivalent } from "./TurnEquivalence";
import { ConversationTree, GraphNode, ThreadRecord, TurnRecord } from "./types";

interface CanonicalEntry {
  node: GraphNode;
  representative: TurnRecord;
}

export function buildConversationTrees(threads: ThreadRecord[]): ConversationTree[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const groups = new Map<string, ThreadRecord[]>();
  for (const thread of threads) {
    const treeKey = resolveTreeKey(thread, byId);
    const existing = groups.get(treeKey);
    if (existing) {
      existing.push(thread);
    } else {
      groups.set(treeKey, [thread]);
    }
  }

  const trees = Array.from(groups.entries()).map(([sessionId, group]) => buildTree(sessionId, group));
  trees.sort((a, b) => compareOptionalNumbersDescending(a.updatedAt, b.updatedAt)
    || compareOptionalNumbersDescending(a.createdAt, b.createdAt)
    || a.sessionId.localeCompare(b.sessionId));
  return trees;
}

function buildTree(sessionId: string, inputThreads: ThreadRecord[]): ConversationTree {
  const threads = [...inputThreads].sort((a, b) => compareThreads(a, b, sessionId));
  const nodes: GraphNode[] = [];
  const canonical = new Map<string, CanonicalEntry>();
  const rootChildIds: string[] = [];
  let nextNodeId = 1;

  for (const thread of threads) {
    if (thread.loadError) {
      continue;
    }
    let childIds = rootChildIds;
    let currentId: string | undefined;

    for (const turn of thread.turns) {
      const matchedId = childIds.find((childId) => {
        const entry = canonical.get(childId);
        return entry ? areTurnsEquivalent(entry.representative, turn) : false;
      });

      if (matchedId) {
        const entry = canonical.get(matchedId)!;
        if (!entry.node.sources.some((source) => source.threadId === thread.id && source.turnId === turn.id)) {
          entry.node.sources.push({ threadId: thread.id, turnId: turn.id });
        }
        currentId = matchedId;
        childIds = entry.node.childIds;
        continue;
      }

      const id = `node:${nextNodeId++}`;
      const node: GraphNode = {
        id,
        prompt: turn.userText,
        promptPreview: turn.promptPreview,
        sources: [{ threadId: thread.id, turnId: turn.id }],
        ...(currentId ? { parentId: currentId } : {}),
        childIds: [],
        headThreadIds: [],
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
      };
      nodes.push(node);
      canonical.set(id, { node, representative: turn });
      childIds.push(id);
      currentId = id;
      childIds = node.childIds;
    }

    if (currentId) {
      canonical.get(currentId)!.node.headThreadIds.push(thread.id);
    }
  }

  const groupIds = new Set(threads.map((thread) => thread.id));
  const rootThread = threads.find((thread) => thread.id === sessionId)
    ?? threads.find((thread) => !thread.forkedFromId || !groupIds.has(thread.forkedFromId));
  const firstNode = rootChildIds.length > 0 ? canonical.get(rootChildIds[0])?.node : undefined;
  return {
    sessionId,
    title: chooseTitle(rootThread ?? threads[0], firstNode, sessionId),
    rootThreadId: rootThread?.id,
    threads,
    nodes,
    lineageMetadataAvailable: threads.every((thread) => thread.lineageMetadataAvailable),
    failedBranchCount: threads.filter((thread) => thread.loadError).length,
    createdAt: earliestCreatedAt(threads),
    updatedAt: latestUpdatedAt(threads),
  };
}

function resolveTreeKey(thread: ThreadRecord, byId: Map<string, ThreadRecord>): string {
  const visited = new Set<string>();
  let current = thread;
  while (true) {
    if (visited.has(current.id)) {
      return Array.from(visited).sort()[0];
    }
    visited.add(current.id);
    if (current.forkedFromId) {
      const parent = byId.get(current.forkedFromId);
      if (!parent) {
        return current.forkedFromId;
      }
      current = parent;
      continue;
    }
    return current.sessionId !== current.id ? current.sessionId : current.id;
  }
}

function compareThreads(a: ThreadRecord, b: ThreadRecord, sessionId: string): number {
  const aRoot = a.id === sessionId ? 0 : 1;
  const bRoot = b.id === sessionId ? 0 : 1;
  return aRoot - bRoot
    || compareOptionalNumbers(a.createdAt, b.createdAt)
    || a.id.localeCompare(b.id);
}

function chooseTitle(thread: ThreadRecord | undefined, firstNode: GraphNode | undefined, sessionId: string): string {
  return thread?.name?.trim()
    || thread?.preview?.trim()
    || firstNode?.promptPreview
    || shortId(sessionId);
}

function earliestCreatedAt(threads: ThreadRecord[]): number | undefined {
  const values = threads.map((thread) => thread.createdAt).filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function latestUpdatedAt(threads: ThreadRecord[]): number | undefined {
  const values = threads.map((thread) => thread.updatedAt).filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.max(...values) : undefined;
}

function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return a - b;
}

function compareOptionalNumbersDescending(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return b - a;
}

function shortId(value: string): string {
  const chars = Array.from(value);
  return chars.length > 12 ? `${chars.slice(0, 12).join("")}…` : value;
}
