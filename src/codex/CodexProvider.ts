import { isRecord, optionalString, ThreadListPage, ThreadListParams } from "./protocol";
import { mergeThreadMetadata, normalizeThread, unwrapThreadResponse } from "./normalize";
import { ThreadRecord } from "../graph/types";

interface CodexHistoryClient {
  listThreads(params: ThreadListParams): Promise<ThreadListPage>;
  readThread(threadId: string, includeTurns: boolean): Promise<unknown>;
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

export interface LoadResult {
  threads: ThreadRecord[];
  skippedSummaryCount: number;
}

export class CodexProvider {
  public constructor(private readonly client: CodexHistoryClient) {}

  public async loadWorkspace(
    cwd: string,
    onProgress?: (progress: LoadProgress) => void,
  ): Promise<LoadResult> {
    const summaries = await this.listAllThreads(cwd, false);
    let skippedSummaryCount = 0;
    const threads: ThreadRecord[] = [];
    for (let index = 0; index < summaries.length; index += 1) {
      const summary = summaries[index];
      const summaryRecord = isRecord(summary) ? summary : {};
      const threadId = optionalString(summaryRecord.id);
      if (!threadId) {
        skippedSummaryCount += 1;
        continue;
      }

      try {
        const response = await this.client.readThread(threadId, true);
        const complete = mergeThreadMetadata(unwrapThreadResponse(response), summary);
        const normalized = normalizeThread(complete);
        if (normalized) {
          normalized.archived = false;
          normalized.lineageOnly = false;
          threads.push(normalized);
        } else {
          skippedSummaryCount += 1;
        }
      } catch (error) {
        const normalized = normalizeThread(summary);
        if (normalized) {
          normalized.archived = false;
          normalized.lineageOnly = false;
          normalized.loadError = error instanceof Error ? error.message : String(error);
          threads.push(normalized);
        } else {
          skippedSummaryCount += 1;
        }
      }
      onProgress?.({ loaded: index + 1, total: summaries.length });
    }

    skippedSummaryCount += await this.loadMissingAncestors(cwd, threads);
    return { threads, skippedSummaryCount };
  }

  private async loadMissingAncestors(cwd: string, threads: ThreadRecord[]): Promise<number> {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const initialMissing = threads
      .map((thread) => thread.forkedFromId)
      .filter((id): id is string => id !== undefined && !byId.has(id));
    if (initialMissing.length === 0) {
      return 0;
    }

    const archivedSummaries = await this.listAllThreads(cwd, true);
    const archivedById = new Map<string, unknown>();
    for (const summary of archivedSummaries) {
      if (isRecord(summary)) {
        const id = optionalString(summary.id);
        if (id) {
          archivedById.set(id, summary);
        }
      }
    }

    const queue = [...initialMissing];
    const attempted = new Set<string>();
    let failed = 0;
    while (queue.length > 0) {
      const threadId = queue.shift()!;
      if (byId.has(threadId) || attempted.has(threadId)) {
        continue;
      }
      attempted.add(threadId);
      const summary = archivedById.get(threadId);
      try {
        const response = await this.client.readThread(threadId, true);
        const complete = mergeThreadMetadata(unwrapThreadResponse(response), summary);
        const normalized = normalizeThread(complete);
        const cwdProvedByList = summary !== undefined;
        if (!normalized || (normalized.cwd !== undefined && normalized.cwd !== cwd)
          || (normalized.cwd === undefined && !cwdProvedByList)) {
          failed += 1;
          continue;
        }
        normalized.archived = summary !== undefined;
        normalized.lineageOnly = true;
        byId.set(normalized.id, normalized);
        threads.push(normalized);
        if (normalized.forkedFromId && !byId.has(normalized.forkedFromId)) {
          queue.push(normalized.forkedFromId);
        }
      } catch {
        failed += 1;
      }
    }
    return failed;
  }

  private async listAllThreads(cwd: string, archived: boolean): Promise<unknown[]> {
    const all: unknown[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    do {
      const params: ThreadListParams = {
        cwd,
        archived,
        sourceKinds: ["cli", "vscode"],
        sortKey: "created_at",
        sortDirection: "asc",
        ...(cursor ? { cursor } : {}),
      };
      const rawPage = await this.client.listThreads(params);
      const page = normalizeListPage(rawPage);
      all.push(...page.data);
      cursor = page.nextCursor;
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new Error("thread/list returned a repeated pagination cursor.");
        }
        seenCursors.add(cursor);
      }
    } while (cursor);

    return all;
  }
}

function normalizeListPage(value: unknown): ThreadListPage {
  if (!isRecord(value)) {
    throw new Error("thread/list returned a non-object response.");
  }
  return {
    data: Array.isArray(value.data) ? value.data : [],
    nextCursor: optionalString(value.nextCursor),
  };
}
