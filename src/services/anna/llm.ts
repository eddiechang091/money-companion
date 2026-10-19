import { connectAnna } from "./runtime";
import type { AnnaClient } from "./runtime";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface LlmResult {
  text: string;
  raw: unknown;
}

export class LlmUnavailableError extends Error {
  constructor(message = "Lucky Cat is taking a tiny break") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export interface LlmService {
  readonly available: boolean;
  complete(request: LlmRequest): Promise<LlmResult>;
}

function unwrapResult(result: unknown): unknown {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if ("result" in record) return record.result;
    if ("data" in record) return record.data;
    if ("value" in record) return record.value;
  }
  return result;
}

function extractText(response: unknown): string {
  const value = unwrapResult(response);
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;

  // Handle content-block format: {type:"text", text:"..."} (top-level or nested)
  if (record.type === "text" && typeof record.text === "string") {
    return record.text;
  }

  const keys = ["text", "content", "message", "output"];
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string") return candidate;
    // Handle nested content block: {content: {type:"text", text:"..."}}
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if (nested.type === "text" && typeof nested.text === "string") return nested.text;
      if (typeof nested.text === "string") return nested.text;
    }
  }
  return "";
}

// Phase 1: interface + Anna Host API wrapper only.
// AI behavior (prompts, context, chat) arrives in a later phase.
export async function getLlmService(): Promise<LlmService> {
  const runtime = await connectAnna();
  const client: AnnaClient | null = runtime.client;
  const available =
    runtime.state === "connected" && !!client && !!client.llm && typeof client.llm.complete === "function";
  return {
    available,
    async complete(request: LlmRequest): Promise<LlmResult> {
      if (!available || !client || !client.llm || !client.llm.complete) {
        throw new LlmUnavailableError();
      }
      const response = await client.llm.complete({
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        response_format: request.json ? { type: "json_object" } : undefined,
      });
      return { text: extractText(response), raw: response };
    },
  };
}