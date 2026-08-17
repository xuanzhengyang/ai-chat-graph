import { TurnRecord } from "./types";

export function areTurnsEquivalent(a: TurnRecord, b: TurnRecord): boolean {
  if (a.id === b.id) {
    return true;
  }
  return turnFingerprint(a) === turnFingerprint(b);
}

export function turnFingerprint(turn: TurnRecord): string {
  return JSON.stringify({
    userText: normalizeVisibleText(turn.userText),
    assistantMessages: turn.assistantMessages.map((message) => ({
      text: normalizeVisibleText(message.text),
      phase: message.phase ?? null,
    })),
  });
}

function normalizeVisibleText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").trim();
}
