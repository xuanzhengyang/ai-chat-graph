import * as vscode from "vscode";
import { CodexAppServerClient } from "../codex/AppServerClient";
import { CodexProvider } from "../codex/CodexProvider";
import { buildConversationTrees } from "../graph/GraphBuilder";
import { layoutConversationTree } from "../graph/Layout";
import { ConversationTree, RenderTree, TreeSummary, TurnDetail } from "../graph/types";
import { getWebviewHtml } from "./html";

type WebviewRequest =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "selectTree"; sessionId: string }
  | { type: "selectNode"; nodeId: string };

interface StateMessage {
  type: "state";
  workspacePath: string;
  trees: TreeSummary[];
  selectedTree?: RenderTree;
  selectedNodeId?: string;
}

export class AgentGraphPanel {
  private workspaceFolder: vscode.WorkspaceFolder;
  private trees: ConversationTree[] = [];
  private selectedSessionId: string | undefined;
  private selectedNodeId: string | undefined;
  private loadGeneration = 0;
  private disposed = false;

  public constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    private readonly client: CodexAppServerClient,
    private readonly output: vscode.OutputChannel,
    private readonly onDispose: () => void,
  ) {
    this.workspaceFolder = workspaceFolder;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
    };
    panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage((message: unknown) => this.handleRequest(message));
    panel.onDidDispose(() => {
      this.disposed = true;
      this.onDispose();
    });
  }

  public reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Active);
  }

  public async setWorkspaceAndRefresh(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    this.workspaceFolder = workspaceFolder;
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    const generation = ++this.loadGeneration;
    const cwd = this.workspaceFolder.uri.fsPath;
    await this.post({ type: "loading", message: "Starting Codex App Server…" });

    try {
      await this.client.start();
      await this.post({ type: "loading", message: "Loading Codex conversations…" });
      const provider = new CodexProvider(this.client);
      const result = await provider.loadWorkspace(cwd, ({ loaded, total }) => {
        void this.post({ type: "loading", message: `Loading conversation branches ${loaded} / ${total}…` });
      });
      if (generation !== this.loadGeneration || this.disposed) {
        return;
      }

      this.trees = buildConversationTrees(result.threads);
      if (!this.selectedSessionId || !this.trees.some((tree) => tree.sessionId === this.selectedSessionId)) {
        this.selectedSessionId = this.trees[0]?.sessionId;
        this.selectedNodeId = undefined;
      }
      this.output.appendLine(
        `Loaded workspace ${cwd}: ${result.threads.length} branches, ${this.trees.length} conversation trees, ${result.skippedSummaryCount} skipped summaries.`,
      );
      await this.postState();
    } catch (error) {
      if (generation !== this.loadGeneration || this.disposed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Load failed: ${message}`);
      await this.post({
        type: "error",
        message: message.includes("Command not found: codex")
          ? message
          : "Failed to load Codex conversations.",
        detail: message.includes("Command not found: codex") ? undefined : message,
      });
    }
  }

  private async handleRequest(value: unknown): Promise<void> {
    if (!isWebviewRequest(value)) {
      this.output.appendLine("Ignoring malformed AI Chat Graph webview request.");
      return;
    }
    switch (value.type) {
      case "ready":
      case "refresh":
        await this.refresh();
        break;
      case "selectTree":
        if (this.trees.some((tree) => tree.sessionId === value.sessionId)) {
          this.selectedSessionId = value.sessionId;
          this.selectedNodeId = undefined;
          await this.postState();
        }
        break;
      case "selectNode":
        this.selectedNodeId = value.nodeId;
        await this.postTurnDetail(value.nodeId);
        break;
    }
  }

  private async postState(): Promise<void> {
    const tree = this.selectedTree();
    const renderTree = tree ? layoutConversationTree(tree) : undefined;
    if (tree && !tree.nodes.some((node) => node.id === this.selectedNodeId)) {
      this.selectedNodeId = renderTree?.nodes[0]?.id;
    }
    const message: StateMessage = {
      type: "state",
      workspacePath: this.workspaceFolder.uri.fsPath,
      trees: this.trees.map((item) => ({
        sessionId: item.sessionId,
        title: item.title,
        branchCount: item.threads.length,
        turnCount: item.nodes.length,
        failedBranchCount: item.failedBranchCount,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      selectedTree: renderTree,
      selectedNodeId: this.selectedNodeId,
    };
    await this.post(message);
    if (this.selectedNodeId) {
      await this.postTurnDetail(this.selectedNodeId);
    }
  }

  private async postTurnDetail(nodeId: string): Promise<void> {
    const tree = this.selectedTree();
    const node = tree?.nodes.find((item) => item.id === nodeId);
    const source = node?.sources[0];
    if (!tree || !node || !source) {
      return;
    }
    const thread = tree.threads.find((item) => item.id === source.threadId);
    const turn = thread?.turns.find((item) => item.id === source.turnId);
    if (!turn) {
      return;
    }
    const detail: TurnDetail = {
      userText: turn.userText,
      assistantMessages: turn.assistantMessages,
      sharedBranchCount: new Set(node.sources.map((item) => item.threadId)).size,
      startedAt: turn.startedAt,
      completedAt: turn.completedAt,
    };
    await this.post({ type: "turnDetail", nodeId, detail });
  }

  private selectedTree(): ConversationTree | undefined {
    return this.trees.find((tree) => tree.sessionId === this.selectedSessionId);
  }

  private async post(message: object): Promise<void> {
    if (!this.disposed) {
      await this.panel.webview.postMessage(message);
    }
  }
}

function isWebviewRequest(value: unknown): value is WebviewRequest {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const request = value as Record<string, unknown>;
  if (request.type === "ready" || request.type === "refresh") {
    return true;
  }
  if (request.type === "selectTree") {
    return typeof request.sessionId === "string";
  }
  if (request.type === "selectNode") {
    return typeof request.nodeId === "string";
  }
  return false;
}
