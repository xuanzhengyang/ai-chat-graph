import { optionalNumber, optionalString, isRecord } from "./protocol";
import { AssistantMessage, ThreadRecord, TurnRecord } from "../graph/types";

interface ExtractedUserText {
  detailText: string;
  textualText: string;
  hasImage: boolean;
}

export function unwrapThreadResponse(value: unknown): unknown {
  if (isRecord(value) && "thread" in value) {
    return value.thread;
  }
  return value;
}

export function normalizeThread(value: unknown): ThreadRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = optionalString(value.id);
  if (!id) {
    return undefined;
  }
  const rawSessionId = optionalString(value.sessionId);
  const turns = Array.isArray(value.turns)
    ? value.turns.map((turn, index) => normalizeTurn(turn, id, index)).filter(isTurnRecord)
    : [];

  return {
    id,
    sessionId: rawSessionId ?? `thread:${id}`,
    forkedFromId: optionalString(value.forkedFromId),
    cwd: optionalString(value.cwd),
    name: optionalString(value.name),
    preview: optionalString(value.preview),
    createdAt: optionalNumber(value.createdAt),
    updatedAt: optionalNumber(value.updatedAt),
    turns,
    lineageMetadataAvailable: rawSessionId !== undefined,
  };
}

export function mergeThreadMetadata(primary: unknown, fallback: unknown): unknown {
  const primaryRecord = isRecord(primary) ? primary : {};
  const fallbackRecord = isRecord(unwrapThreadResponse(fallback))
    ? unwrapThreadResponse(fallback) as Record<string, unknown>
    : {};
  const merged: Record<string, unknown> = { ...fallbackRecord };
  for (const [key, value] of Object.entries(primaryRecord)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  return merged;
}

export function makePromptPreview(text: string, fallback: string, hasImage = false): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return hasImage ? "[Image input]" : `[Turn ${shortId(fallback)}]`;
  }
  const characters = Array.from(normalized);
  return characters.length > 80 ? `${characters.slice(0, 80).join("")}…` : normalized;
}

function normalizeTurn(value: unknown, threadId: string, index: number): TurnRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = optionalString(value.id) ?? `${threadId}:turn:${index + 1}`;
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const userParts: ExtractedUserText[] = [];
  const assistantMessages: AssistantMessage[] = [];

  for (const item of rawItems) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.type === "userMessage") {
      userParts.push(extractUserMessage(item));
    } else if (item.type === "agentMessage") {
      const text = optionalString(item.text);
      if (text !== undefined) {
        assistantMessages.push({ text, phase: optionalString(item.phase) });
      }
    }
  }

  const userText = userParts.map((part) => part.detailText).filter(Boolean).join("\n");
  const textualText = userParts.map((part) => part.textualText).filter(Boolean).join("\n");
  const hasImage = userParts.some((part) => part.hasImage);
  return {
    id,
    userText,
    promptPreview: makePromptPreview(textualText, id, hasImage),
    assistantMessages,
    rawItems,
    startedAt: optionalNumber(value.startedAt),
    completedAt: optionalNumber(value.completedAt),
  };
}

function extractUserMessage(item: Record<string, unknown>): ExtractedUserText {
  const content = Array.isArray(item.content) ? item.content : [];
  const detailParts: string[] = [];
  const textParts: string[] = [];
  let hasImage = false;

  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }
    if (part.type === "text" && typeof part.text === "string") {
      detailParts.push(part.text);
      textParts.push(part.text);
    } else if (part.type === "image") {
      detailParts.push("[image]");
      hasImage = true;
    } else if (part.type === "localImage") {
      detailParts.push("[local image]");
      hasImage = true;
    }
  }

  if (content.length === 0 && typeof item.text === "string") {
    detailParts.push(item.text);
    textParts.push(item.text);
  }
  return {
    detailText: detailParts.join("\n"),
    textualText: textParts.join("\n"),
    hasImage,
  };
}

function isTurnRecord(value: TurnRecord | undefined): value is TurnRecord {
  return value !== undefined;
}

function shortId(id: string): string {
  return Array.from(id).slice(0, 8).join("");
}
