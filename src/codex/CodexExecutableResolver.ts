import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";

export type CodexExecutableSource = "configuration" | "path" | "openai.chatgpt";

export interface CodexExecutableResolution {
  executable: string;
  source: CodexExecutableSource;
}

export interface CodexExecutableResolverOptions {
  configuredPath?: string;
  workspaceFolder?: string;
  openaiExtensionPath?: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  isExecutable?: (candidate: string) => Promise<boolean>;
}

export async function resolveCodexExecutable(
  options: CodexExecutableResolverOptions = {},
): Promise<CodexExecutableResolution> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const canExecute = options.isExecutable ?? ((candidate) => isExecutableFile(candidate, platform));
  const failures: string[] = [];
  const configuredPath = options.configuredPath?.trim();

  if (configuredPath) {
    try {
      const expanded = expandConfiguredPath(configuredPath, options, env);
      const candidate = isCommandName(expanded)
        ? await findOnPath(expanded, env, platform, canExecute)
        : path.resolve(options.workspaceFolder ?? process.cwd(), expanded);
      if (candidate && await canExecute(candidate)) {
        return { executable: candidate, source: "configuration" };
      }
      failures.push(
        `aiChatGraph.codexExecutable resolved from "${configuredPath}"${candidate ? ` to "${candidate}"` : ""}, but no executable file was found.`,
      );
    } catch (error) {
      failures.push(`aiChatGraph.codexExecutable: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    failures.push("aiChatGraph.codexExecutable is not configured.");
  }

  const pathCandidate = await findOnPath("codex", env, platform, canExecute);
  if (pathCandidate) {
    return { executable: pathCandidate, source: "path" };
  }
  const pathEntryCount = pathEntries(env, platform).filter(Boolean).length;
  failures.push(`Extension Host PATH contains ${pathEntryCount} entr${pathEntryCount === 1 ? "y" : "ies"}, but none provides codex.`);

  if (options.openaiExtensionPath) {
    const bundledCandidate = path.join(
      options.openaiExtensionPath,
      "bin",
      `${platform}-${normalizeArchitecture(options.arch ?? process.arch)}`,
      platform === "win32" ? "codex.exe" : "codex",
    );
    if (await canExecute(bundledCandidate)) {
      return { executable: bundledCandidate, source: "openai.chatgpt" };
    }
    failures.push(`openai.chatgpt bundled Codex was not executable at "${bundledCandidate}".`);
  } else {
    failures.push("openai.chatgpt bundled Codex is unavailable because the extension is not installed in this Extension Host.");
  }

  throw new Error([
    "AI Chat Graph could not locate a Codex CLI executable.",
    "Resolution attempts (highest priority first):",
    ...failures.map((failure, index) => `${index + 1}. ${failure}`),
    "Set aiChatGraph.codexExecutable on the machine running the Extension Host.",
    "For Remote SSH, configure it in the remote window. Example settings.json:",
    `"aiChatGraph.codexExecutable": "/home/you/.local/bin/codex"`,
  ].join("\n"));
}

function expandConfiguredPath(
  value: string,
  options: CodexExecutableResolverOptions,
  env: NodeJS.ProcessEnv,
): string {
  const missing: string[] = [];
  let expanded = value.replace(/\$\{env:([^}]+)\}/gu, (_match, name: string) => {
    const replacement = getEnvironmentValue(env, name);
    if (replacement === undefined) {
      missing.push(name);
      return "";
    }
    return replacement;
  });
  if (missing.length > 0) {
    throw new Error(`environment variable${missing.length === 1 ? "" : "s"} ${missing.map((name) => `"${name}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`);
  }

  if (expanded.includes("${workspaceFolder}")) {
    if (!options.workspaceFolder) {
      throw new Error("${workspaceFolder} was used, but no workspace folder is open.");
    }
    expanded = expanded.replace(/\$\{workspaceFolder\}/gu, options.workspaceFolder);
  }
  if (expanded === "~") {
    return options.homeDirectory ?? homedir();
  }
  if (expanded.startsWith(`~${path.sep}`)) {
    return path.join(options.homeDirectory ?? homedir(), expanded.slice(2));
  }
  return expanded;
}

async function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  canExecute: (candidate: string) => Promise<boolean>,
): Promise<string | undefined> {
  const names = executableNames(command, env, platform);
  for (const directory of pathEntries(env, platform)) {
    if (!directory) {
      continue;
    }
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (await canExecute(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function executableNames(command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== "win32" || path.extname(command)) {
    return [command];
  }
  return (getEnvironmentValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean)
    .map((extension) => `${command}${extension.startsWith(".") ? extension : `.${extension}`}`);
}

function pathEntries(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  return (getEnvironmentValue(env, "PATH") ?? "").split(platform === "win32" ? ";" : ":");
}

function getEnvironmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  return key ? env[key] : undefined;
}

function isCommandName(value: string): boolean {
  return !path.isAbsolute(value) && !/[\\/]/u.test(value);
}

function normalizeArchitecture(arch: string): string {
  return arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : arch;
}

async function isExecutableFile(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) {
      return false;
    }
    await access(candidate, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
