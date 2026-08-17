import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as readline from "node:readline";
import {
  AllowedRequestMethod,
  DiagnosticLogger,
  isRecord,
  JsonRpcErrorShape,
  JsonRpcResponseShape,
  ThreadListPage,
  ThreadListParams,
} from "./protocol";

interface PendingRequest {
  method: AllowedRequestMethod;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private lineReader: readline.Interface | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private startPromise: Promise<void> | undefined;
  private stopping = false;
  private stderrTail: string[] = [];

  public constructor(private readonly logger: DiagnosticLogger) {}

  public async start(): Promise<void> {
    if (this.process) {
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startAndInitialize();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    this.lineReader?.close();
    this.lineReader = undefined;

    const process = this.process;
    this.process = undefined;
    if (process && !process.killed) {
      process.kill();
    }
    this.rejectPending(new Error("Codex app-server stopped."));
  }

  public async request<T>(method: AllowedRequestMethod, params: unknown): Promise<T> {
    const process = this.process;
    if (!process) {
      throw new Error("Codex app-server is not running.");
    }

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });

      process.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (error) => {
        if (!error) {
          return;
        }
        const pending = this.pending.get(id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(id);
          pending.reject(error);
        }
      });
    });
  }

  public listThreads(params: ThreadListParams): Promise<ThreadListPage> {
    return this.request<ThreadListPage>("thread/list", params);
  }

  public readThread(threadId: string, includeTurns: boolean): Promise<unknown> {
    return this.request<unknown>("thread/read", { threadId, includeTurns });
  }

  public recentStderr(): string {
    return this.stderrTail.join("\n");
  }

  private async startAndInitialize(): Promise<void> {
    this.stderrTail = [];
    this.stopping = false;
    const process = spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = process;

    this.lineReader = readline.createInterface({ input: process.stdout });
    this.lineReader.on("line", (line) => this.handleLine(line));
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", (chunk: string | Buffer) => {
      for (const line of String(chunk).split(/\r?\n/u).filter(Boolean)) {
        this.stderrTail.push(line);
        if (this.stderrTail.length > 30) {
          this.stderrTail.shift();
        }
        this.logger.appendLine(`[app-server stderr] ${line}`);
      }
    });
    process.on("error", (error: NodeJS.ErrnoException) => {
      const message = error.code === "ENOENT"
        ? "AI Chat Graph could not start Codex App Server. Command not found: codex. Verify that Codex CLI is installed and available in the current Extension Host PATH."
        : `Codex app-server process error: ${error.message}`;
      this.handleDisconnect(new Error(message));
    });
    process.on("exit", (code, signal) => {
      if (this.stopping) {
        return;
      }
      const suffix = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      this.handleDisconnect(new Error(`Codex app-server exited unexpectedly (${suffix}).`));
    });

    try {
      await this.request("initialize", {
        clientInfo: {
          name: "agentgraph",
          title: "AI Chat Graph",
          version: "0.1.4",
        },
      });
      this.sendInitialized();
      this.logger.appendLine("Codex app-server initialized.");
    } catch (error) {
      const stderr = this.recentStderr();
      if (stderr) {
        this.logger.appendLine(`Initialization stderr tail:\n${stderr}`);
      }
      await this.stop();
      throw error;
    }
  }

  private sendInitialized(): void {
    const process = this.process;
    if (!process) {
      throw new Error("Codex app-server disconnected before initialized notification.");
    }
    process.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line) as unknown;
    } catch {
      this.logger.appendLine(`Malformed app-server JSONL line: ${line.slice(0, 300)}`);
      return;
    }

    if (!isRecord(message)) {
      this.logger.appendLine("Ignoring non-object app-server JSONL message.");
      return;
    }

    if (!("id" in message)) {
      if (typeof message.method === "string") {
        this.logger.appendLine(`Ignoring app-server notification: ${message.method}`);
      }
      return;
    }

    const response = message as unknown as JsonRpcResponseShape;
    const id = typeof response.id === "number" ? response.id : Number(response.id);
    if (!Number.isInteger(id)) {
      this.logger.appendLine(`Ignoring response with unsupported id: ${String(response.id)}`);
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      this.logger.appendLine(`Ignoring response for unknown request id: ${id}`);
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(id);

    if (response.error) {
      pending.reject(this.makeRpcError(pending.method, response.error));
      return;
    }
    pending.resolve(response.result);
  }

  private makeRpcError(method: AllowedRequestMethod, error: JsonRpcErrorShape): Error {
    const code = error.code === undefined ? "unknown" : String(error.code);
    const message = error.message ?? "Unknown app-server error";
    return new Error(`${method} failed (${code}): ${message}`);
  }

  private handleDisconnect(error: Error): void {
    this.logger.appendLine(error.message);
    this.lineReader?.close();
    this.lineReader = undefined;
    this.process = undefined;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
