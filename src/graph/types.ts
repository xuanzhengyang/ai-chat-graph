export interface AssistantMessage {
  text: string;
  phase?: string;
}

export interface TurnRecord {
  id: string;
  userText: string;
  promptPreview: string;
  assistantMessages: AssistantMessage[];
  rawItems: unknown[];
  startedAt?: number;
  completedAt?: number;
}

export interface ThreadRecord {
  id: string;
  sessionId: string;
  forkedFromId?: string;
  cwd?: string;
  name?: string;
  preview?: string;
  createdAt?: number;
  updatedAt?: number;
  turns: TurnRecord[];
  lineageMetadataAvailable: boolean;
  archived?: boolean;
  lineageOnly?: boolean;
  loadError?: string;
}

export interface NodeSource {
  threadId: string;
  turnId: string;
}

export interface GraphNode {
  id: string;
  prompt: string;
  promptPreview: string;
  sources: NodeSource[];
  parentId?: string;
  childIds: string[];
  headThreadIds: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface ConversationTree {
  sessionId: string;
  title: string;
  rootThreadId?: string;
  threads: ThreadRecord[];
  nodes: GraphNode[];
  lineageMetadataAvailable: boolean;
  failedBranchCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface TurnDetail {
  userText: string;
  assistantMessages: AssistantMessage[];
  sharedBranchCount: number;
  startedAt?: number;
  completedAt?: number;
}

export interface LayoutNode {
  id: string;
  parentId?: string;
  promptPreview: string;
  headLabels: string[];
  x: number;
  y: number;
  row: number;
  lane: number;
  startedAt?: number;
}

export interface RenderTree {
  sessionId: string;
  title: string;
  nodes: LayoutNode[];
  width: number;
  height: number;
  rowHeight: number;
  lineageMetadataAvailable: boolean;
  failedBranchCount: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface TreeSummary {
  sessionId: string;
  title: string;
  branchCount: number;
  turnCount: number;
  failedBranchCount: number;
  createdAt?: number;
  updatedAt?: number;
}
