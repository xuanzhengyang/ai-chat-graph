export type AllowedRequestMethod = "initialize" | "thread/list" | "thread/read";

export interface JsonRpcErrorShape {
  code?: number;
  message?: string;
  data?: unknown;
}

export interface JsonRpcResponseShape {
  id: number | string;
  result?: unknown;
  error?: JsonRpcErrorShape;
}

export interface ThreadListParams {
  cwd: string;
  archived: boolean;
  sourceKinds: ["cli", "vscode"];
  sortKey: "created_at";
  sortDirection: "asc";
  cursor?: string;
}

export interface ThreadListPage {
  data: unknown[];
  nextCursor?: string;
}

export interface DiagnosticLogger {
  appendLine(message: string): void;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
