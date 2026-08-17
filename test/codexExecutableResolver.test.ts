import test from "node:test";
import assert from "node:assert/strict";
import { resolveCodexExecutable } from "../src/codex/CodexExecutableResolver";

function executableSet(...paths: string[]): (candidate: string) => Promise<boolean> {
  const available = new Set(paths);
  return async (candidate) => available.has(candidate);
}

test("configured executable has priority over PATH and openai.chatgpt", async () => {
  const resolution = await resolveCodexExecutable({
    configuredPath: "/configured/codex",
    env: { PATH: "/path/bin" },
    openaiExtensionPath: "/extensions/openai.chatgpt",
    platform: "linux",
    arch: "x64",
    isExecutable: executableSet(
      "/configured/codex",
      "/path/bin/codex",
      "/extensions/openai.chatgpt/bin/linux-x86_64/codex",
    ),
  });

  assert.deepEqual(resolution, { executable: "/configured/codex", source: "configuration" });
});

test("Extension Host PATH has priority over bundled Codex", async () => {
  const resolution = await resolveCodexExecutable({
    env: { PATH: "/first:/path/bin" },
    openaiExtensionPath: "/extensions/openai.chatgpt",
    platform: "linux",
    arch: "x64",
    isExecutable: executableSet(
      "/path/bin/codex",
      "/extensions/openai.chatgpt/bin/linux-x86_64/codex",
    ),
  });

  assert.deepEqual(resolution, { executable: "/path/bin/codex", source: "path" });
});

test("falls back to the platform-matched Codex bundled with openai.chatgpt", async () => {
  const bundled = "/extensions/openai.chatgpt/bin/linux-x86_64/codex";
  const resolution = await resolveCodexExecutable({
    env: { PATH: "/path/without/codex" },
    openaiExtensionPath: "/extensions/openai.chatgpt",
    platform: "linux",
    arch: "x64",
    isExecutable: executableSet(bundled),
  });

  assert.deepEqual(resolution, { executable: bundled, source: "openai.chatgpt" });
});

test("expands home, environment, workspace, and workspace-relative configured paths", async () => {
  const cases = [
    ["~/bin/codex", "/home/tester/bin/codex"],
    ["${env:CODEX_BIN}/codex", "/opt/codex/bin/codex"],
    ["${workspaceFolder}/tools/codex", "/workspace/project/tools/codex"],
    ["tools/codex", "/workspace/project/tools/codex"],
  ] as const;

  for (const [configuredPath, expected] of cases) {
    const resolution = await resolveCodexExecutable({
      configuredPath,
      env: { PATH: "", CODEX_BIN: "/opt/codex/bin" },
      homeDirectory: "/home/tester",
      workspaceFolder: "/workspace/project",
      platform: "linux",
      arch: "x64",
      isExecutable: executableSet(expected),
    });
    assert.deepEqual(resolution, { executable: expected, source: "configuration" });
  }
});

test("an invalid configured path falls through to PATH", async () => {
  const resolution = await resolveCodexExecutable({
    configuredPath: "/missing/codex",
    env: { PATH: "/path/bin" },
    platform: "linux",
    arch: "x64",
    isExecutable: executableSet("/path/bin/codex"),
  });

  assert.deepEqual(resolution, { executable: "/path/bin/codex", source: "path" });
});

test("failure explains every resolution stage and Remote SSH configuration", async () => {
  await assert.rejects(
    resolveCodexExecutable({
      configuredPath: "${env:MISSING}/codex",
      env: { PATH: "/one:/two" },
      openaiExtensionPath: "/extensions/openai.chatgpt",
      platform: "linux",
      arch: "x64",
      isExecutable: executableSet(),
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /aiChatGraph\.codexExecutable/u);
      assert.match(error.message, /MISSING/u);
      assert.match(error.message, /Extension Host PATH/u);
      assert.match(error.message, /openai\.chatgpt bundled Codex/u);
      assert.match(error.message, /Remote SSH/u);
      return true;
    },
  );
});
