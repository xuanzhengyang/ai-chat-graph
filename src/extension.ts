import * as vscode from "vscode";
import { CodexAppServerClient } from "./codex/AppServerClient";
import { AgentGraphPanel } from "./webview/AgentGraphPanel";

let appServerClient: CodexAppServerClient | undefined;
let currentPanel: AgentGraphPanel | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("AI Chat Graph");
  appServerClient = new CodexAppServerClient(outputChannel);

  const open = async (): Promise<void> => {
    const workspaceFolder = resolveWorkspaceRoot();
    if (!workspaceFolder) {
      await vscode.window.showErrorMessage("AI Chat Graph requires an opened workspace folder.");
      return;
    }

    if (currentPanel) {
      currentPanel.reveal();
      await currentPanel.setWorkspaceAndRefresh(workspaceFolder);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "agentGraph",
      "AI Chat Graph",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    currentPanel = new AgentGraphPanel(
      panel,
      context.extensionUri,
      workspaceFolder,
      appServerClient!,
      outputChannel!,
      () => { currentPanel = undefined; },
    );
  };

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand("agentGraph.open", open),
    vscode.commands.registerCommand("agentGraph.refresh", async () => {
      if (!currentPanel) {
        await open();
      } else {
        await currentPanel.refresh();
      }
    }),
  );
}

export async function deactivate(): Promise<void> {
  await appServerClient?.stop();
  appServerClient = undefined;
  currentPanel = undefined;
  outputChannel = undefined;
}

export function resolveWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (activeFolder) {
      return activeFolder;
    }
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders.length === 1 ? folders[0] : folders[0];
}
