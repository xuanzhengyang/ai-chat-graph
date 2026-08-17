import test from "node:test";
import assert from "node:assert/strict";
import { areTurnsEquivalent } from "../src/graph/TurnEquivalence";
import { TurnRecord } from "../src/graph/types";

test("same turn id is always equivalent", () => {
  assert.equal(areTurnsEquivalent(turn("same", "A", "reply A"), turn("same", "B", "reply B")), true);
});

test("copied turns with new ids merge by stable visible content", () => {
  assert.equal(
    areTurnsEquivalent(turn("a1", "Prompt", "Answer", "final_answer"), turn("b1", "Prompt", "Answer", "final_answer")),
    true,
  );
});

test("assistant phase participates in fallback equivalence", () => {
  assert.equal(
    areTurnsEquivalent(turn("a1", "Prompt", "Answer", "commentary"), turn("b1", "Prompt", "Answer", "final_answer")),
    false,
  );
});

function turn(id: string, userText: string, assistantText: string, phase?: string): TurnRecord {
  return {
    id,
    userText,
    promptPreview: userText,
    assistantMessages: [{ text: assistantText, phase }],
    rawItems: [],
  };
}
