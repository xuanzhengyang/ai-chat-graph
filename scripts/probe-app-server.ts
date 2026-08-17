import * as path from "node:path";
import { CodexAppServerClient } from "../src/codex/AppServerClient";
import { CodexProvider } from "../src/codex/CodexProvider";
import { isRecord, optionalString } from "../src/codex/protocol";
import { unwrapThreadResponse } from "../src/codex/normalize";

async function main(): Promise<void> {
  const workspace = process.argv[2];
  if (!workspace || !path.isAbsolute(workspace)) {
    throw new Error("Usage: npm run probe -- /absolute/workspace/path");
  }

  const logger = { appendLine: (message: string) => process.stderr.write(`${message}\n`) };
  const client = new CodexAppServerClient(logger);
  try {
    await client.start();
    const firstPage = await client.listThreads({
      cwd: workspace,
      archived: false,
      sourceKinds: ["cli", "vscode"],
      sortKey: "created_at",
      sortDirection: "asc",
    });
    const summaries = Array.isArray(firstPage.data) ? firstPage.data.filter(isRecord) : [];
    let readMetadataCount = 0;
    for (const summary of summaries) {
      const id = optionalString(summary.id);
      if (!id) {
        continue;
      }
      const read = unwrapThreadResponse(await client.readThread(id, false));
      if (isRecord(read) && optionalString(read.sessionId)) {
        readMetadataCount += 1;
      }
    }
    const provider = new CodexProvider(client);
    const result = await provider.loadWorkspace(workspace);
    process.stdout.write(`workspace: ${workspace}\n`);
    process.stdout.write(`threads: ${result.threads.length}\n`);
    process.stdout.write(`skipped summaries: ${result.skippedSummaryCount}\n\n`);
    process.stdout.write("protocol observations (first list page):\n");
    process.stdout.write(`  summaries: ${summaries.length}\n`);
    process.stdout.write(`  list sessionId available: ${summaries.filter((item) => optionalString(item.sessionId)).length}/${summaries.length}\n`);
    process.stdout.write(`  list forkedFromId available: ${summaries.filter((item) => optionalString(item.forkedFromId)).length}/${summaries.length}\n`);
    process.stdout.write(`  read(includeTurns=false) sessionId available: ${readMetadataCount}/${summaries.length}\n`);
    process.stdout.write(`  nextCursor: ${firstPage.nextCursor ?? "<none>"}\n\n`);
    for (const thread of result.threads) {
      process.stdout.write("thread:\n");
      process.stdout.write(`  id: ${thread.id}\n`);
      process.stdout.write(`  sessionId: ${thread.sessionId}\n`);
      process.stdout.write(`  forkedFromId: ${thread.forkedFromId ?? "<unavailable>"}\n`);
      process.stdout.write(`  name: ${thread.name ?? "<unnamed>"}\n`);
      process.stdout.write(`  createdAt: ${thread.createdAt ?? "<unavailable>"}\n`);
      process.stdout.write(`  updatedAt: ${thread.updatedAt ?? "<unavailable>"}\n`);
      process.stdout.write(`  archived lineage ancestor: ${thread.archived === true ? "yes" : "no"}\n`);
      process.stdout.write(`  lineage metadata: ${thread.lineageMetadataAvailable ? "available" : "unavailable"}\n`);
      if (thread.loadError) {
        process.stdout.write(`  load error: ${thread.loadError}\n`);
      }
      process.stdout.write("  turns:\n");
      for (const turn of thread.turns) {
        process.stdout.write(`    - id: ${turn.id}\n`);
        process.stdout.write(`      prompt: ${JSON.stringify(turn.promptPreview)}\n`);
        process.stdout.write(`      assistant messages: ${turn.assistantMessages.length}\n`);
        process.stdout.write(`      startedAt: ${turn.startedAt ?? "<unavailable>"}\n`);
        process.stdout.write(`      completedAt: ${turn.completedAt ?? "<unavailable>"}\n`);
      }
      process.stdout.write("\n");
    }

    const forkTrees = new Map<string, number>();
    for (const thread of result.threads) {
      forkTrees.set(thread.sessionId, (forkTrees.get(thread.sessionId) ?? 0) + 1);
    }
    const persistedForkTreeCount = Array.from(forkTrees.values()).filter((count) => count > 1).length;
    process.stdout.write(`persisted fork trees observable: ${persistedForkTreeCount}\n`);
    if (persistedForkTreeCount === 0) {
      process.stdout.write("copied-history turn id behavior: not observable in this workspace\n");
    }
  } finally {
    await client.stop();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
