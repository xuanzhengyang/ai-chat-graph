import { ConversationTree, LayoutNode, RenderTree } from "./types";

const ROW_HEIGHT = 56;
const LANE_WIDTH = 18;
const GRAPH_LEFT = 18;

export function layoutConversationTree(tree: ConversationTree): RenderTree {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const threadById = new Map(tree.threads.map((thread) => [thread.id, thread]));
  const roots = tree.nodes.filter((node) => !node.parentId);
  const output: LayoutNode[] = [];
  let row = 0;
  let nextLane = roots.length > 0 ? 1 : 0;

  const visit = (id: string, lane: number): void => {
    const node = byId.get(id);
    if (!node) {
      return;
    }
    output.push({
      id: node.id,
      parentId: node.parentId,
      promptPreview: node.promptPreview,
      headLabels: node.headThreadIds.map((threadId) => {
        const thread = threadById.get(threadId);
        return makeHeadLabel(thread?.name, threadId, thread?.archived === true);
      }),
      x: GRAPH_LEFT + lane * LANE_WIDTH,
      y: row * ROW_HEIGHT + ROW_HEIGHT / 2,
      row,
      lane,
      startedAt: node.startedAt,
    });
    row += 1;

    node.childIds.forEach((childId, index) => {
      if (index === 0) {
        visit(childId, lane);
      } else {
        const childLane = nextLane++;
        visit(childId, childLane);
      }
    });
  };

  roots.forEach((root, index) => {
    const lane = index === 0 ? 0 : nextLane++;
    visit(root.id, lane);
  });

  output.sort((a, b) => {
    if (a.startedAt !== undefined && b.startedAt !== undefined) {
      return b.startedAt - a.startedAt || b.row - a.row;
    }
    if (a.startedAt !== undefined) {
      return -1;
    }
    if (b.startedAt !== undefined) {
      return 1;
    }
    return b.row - a.row;
  });
  output.forEach((node, index) => {
    node.row = index;
    node.y = index * ROW_HEIGHT + ROW_HEIGHT / 2;
  });

  const maxLane = output.reduce((maximum, node) => Math.max(maximum, node.lane), 0);
  return {
    sessionId: tree.sessionId,
    title: tree.title,
    nodes: output,
    width: GRAPH_LEFT * 2 + (maxLane + 1) * LANE_WIDTH,
    height: Math.max(ROW_HEIGHT, output.length * ROW_HEIGHT),
    rowHeight: ROW_HEIGHT,
    lineageMetadataAvailable: tree.lineageMetadataAvailable,
    failedBranchCount: tree.failedBranchCount,
    createdAt: tree.createdAt,
    updatedAt: tree.updatedAt,
  };
}

function makeHeadLabel(name: string | undefined, threadId: string, archived: boolean): string {
  const trimmed = name?.trim();
  const base = trimmed || shortThreadId(threadId);
  return archived ? `${base} [ARCHIVED]` : base;
}

function shortThreadId(threadId: string): string {
  const chars = Array.from(threadId);
  return chars.length > 8 ? `${chars.slice(0, 8).join("")}…` : threadId;
}
