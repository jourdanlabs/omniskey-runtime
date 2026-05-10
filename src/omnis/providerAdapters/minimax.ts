import type { OmnisModelProviderCallResult } from "../../types.js";
import { hashCanonical, shortHash } from "../../audit/hash.js";

export interface MiniMaxChatInvocation {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export async function invokeMiniMaxChat(input: MiniMaxChatInvocation): Promise<OmnisModelProviderCallResult> {
  const key = input.apiKey.trim();
  if (!key) {
    throw new Error("missing MiniMax API key");
  }
  const endpoint = input.endpoint ?? "https://api.minimax.io/v1/chat/completions";
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user }
    ],
    max_tokens: input.maxOutputTokens ?? 900
  };
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { raw };
  }
  if (!response.ok) {
    throw new Error(`MiniMax provider call failed: ${response.status} ${summarizeProviderError(parsed)}`);
  }
  const output_text = extractOutputText(parsed).trim();
  if (!output_text) {
    throw new Error("MiniMax provider returned no text output");
  }
  const withoutHash = {
    provider_id: "minimax" as const,
    model: input.model,
    output_text,
    raw_response_hash: hashCanonical(parsed),
    request_id: requestId(parsed)
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

function extractOutputText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const choices = Array.isArray((value as Record<string, unknown>).choices)
    ? (value as Record<string, unknown>).choices as unknown[]
    : [];
  const chunks: string[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") {
      chunks.push(content);
    }
  }
  return chunks.join("\n").trim();
}

function requestId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : `minimax_${shortHash(value)}`;
}

function summarizeProviderError(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value);
  }
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return JSON.stringify(value).slice(0, 300);
}
