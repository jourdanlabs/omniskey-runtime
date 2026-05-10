import type { OmnisModelProviderCallResult } from "../../types.js";
import { hashCanonical, shortHash } from "../../audit/hash.js";

export interface OpenAIResponseInvocation {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export async function invokeOpenAIResponse(input: OpenAIResponseInvocation): Promise<OmnisModelProviderCallResult> {
  const key = input.apiKey.trim();
  if (!key) {
    throw new Error("missing OpenAI API key");
  }
  const endpoint = input.endpoint ?? "https://api.openai.com/v1/responses";
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    model: input.model,
    input: [
      { role: "system", content: input.system },
      { role: "user", content: input.user }
    ],
    max_output_tokens: input.maxOutputTokens ?? 900
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
    throw new Error(`OpenAI provider call failed: ${response.status} ${summarizeProviderError(parsed)}`);
  }
  const output_text = extractOutputText(parsed).trim();
  if (!output_text) {
    throw new Error("OpenAI provider returned no text output");
  }
  const withoutHash = {
    provider_id: "openai" as const,
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
  const record = value as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") {
        chunks.push(partRecord.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function requestId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : `openai_${shortHash(value)}`;
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
