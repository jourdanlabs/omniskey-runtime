import { resolve } from "node:path";
import { hashCanonical, shortHash } from "../audit/hash.js";
import { runtimeEnv } from "../omnis/envBoundary.js";
import type { VerifiedRuntimeDefinition } from "./definition.js";
import { runVerifiedAgentTurn } from "./runtime.js";
import type { VerifiedAgentTurnInput, VerifiedAgentTurnResult } from "./types.js";

export interface VerifiedRuntimeTelegramConfig {
  runtime: string;
  workspace_root: string;
  bot_token_configured: boolean;
  allowed_chat_ids: string[];
  default_provider: string;
  polling_interval_ms: number;
  audit_hash: string;
}

export interface VerifiedRuntimeTelegramDispatchResult {
  dispatch_id: string;
  runtime: string;
  workspace_root: string;
  chat_id: string;
  input_text: string;
  response_text: string;
  turn: VerifiedAgentTurnResult;
  sent: boolean;
  send_receipt_hash: string | null;
  audit_hash: string;
}

export interface VerifiedRuntimeTelegramPollResult {
  poll_id: string;
  runtime: string;
  workspace_root: string;
  update_count: number;
  handled_count: number;
  next_offset: number | null;
  dispatches: VerifiedRuntimeTelegramDispatchResult[];
  audit_hash: string;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: {
      id?: string | number;
    };
  };
}

export function getVerifiedRuntimeTelegramConfig(definition: VerifiedRuntimeDefinition, input: {
  workspaceRoot: string;
  env?: Record<string, string | undefined>;
}): VerifiedRuntimeTelegramConfig {
  const env = runtimeEnv(input.env);
  const withoutHash = {
    runtime: definition.runtime_id,
    workspace_root: resolve(input.workspaceRoot),
    bot_token_configured: Boolean(env[`${definition.env_prefix}_TELEGRAM_BOT_TOKEN`] || env.OMNIS_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN),
    allowed_chat_ids: csv(env[`${definition.env_prefix}_TELEGRAM_ALLOWED_CHAT_IDS`] ?? env.OMNIS_TELEGRAM_ALLOWED_CHAT_IDS),
    default_provider: env[`${definition.env_prefix}_PROVIDER`] ?? env.DEFAULT_PROVIDER ?? "openai",
    polling_interval_ms: positiveInteger(env[`${definition.env_prefix}_TELEGRAM_POLL_INTERVAL_MS`] ?? env.OMNIS_TELEGRAM_POLL_INTERVAL_MS, 2500)
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

export async function dispatchVerifiedRuntimeTelegramMessage(definition: VerifiedRuntimeDefinition, input: {
  workspaceRoot: string;
  chatId: string;
  text: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  sendReply?: boolean;
  turn?: Partial<VerifiedAgentTurnInput>;
}): Promise<VerifiedRuntimeTelegramDispatchResult> {
  const env = runtimeEnv(input.env);
  const config = getVerifiedRuntimeTelegramConfig(definition, {
    workspaceRoot: input.workspaceRoot,
    env
  });
  if (config.allowed_chat_ids.length > 0 && !config.allowed_chat_ids.includes(input.chatId)) {
    throw new Error(`telegram chat is not allowed: ${input.chatId}`);
  }
  const turn = await runVerifiedAgentTurn(definition, {
    message: input.text,
    workspaceRoot: input.workspaceRoot,
    env,
    persist: true,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.turn ?? {})
  });
  let send_receipt_hash: string | null = null;
  if (input.sendReply === true) {
    const botToken = telegramBotToken(definition, env);
    const receipt = await sendVerifiedRuntimeTelegramReply({
      botToken,
      chatId: input.chatId,
      text: turn.response_text,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    send_receipt_hash = receipt.audit_hash;
  }
  const withoutHash = {
    dispatch_id: `${definition.cli_name.replace(/-/g, "_")}_telegram_${shortHash({
      root: config.workspace_root,
      chat_id: input.chatId,
      text: input.text,
      turn: turn.audit_hash,
      sent: input.sendReply === true
    })}`,
    runtime: definition.runtime_id,
    workspace_root: config.workspace_root,
    chat_id: input.chatId,
    input_text: input.text,
    response_text: turn.response_text,
    turn,
    sent: input.sendReply === true,
    send_receipt_hash
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

export async function pollVerifiedRuntimeTelegram(definition: VerifiedRuntimeDefinition, input: {
  workspaceRoot: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  offset?: number;
  limit?: number;
  sendReply?: boolean;
}): Promise<VerifiedRuntimeTelegramPollResult> {
  const env = runtimeEnv(input.env);
  const config = getVerifiedRuntimeTelegramConfig(definition, {
    workspaceRoot: input.workspaceRoot,
    env
  });
  const botToken = telegramBotToken(definition, env);
  if (!botToken.trim()) {
    throw new Error("missing Telegram bot token");
  }
  const fetcher = input.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  params.set("timeout", "0");
  params.set("limit", String(input.limit ?? 10));
  if (input.offset !== undefined) {
    params.set("offset", String(input.offset));
  }
  const response = await fetcher(`https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`telegram getUpdates failed: ${response.status}`);
  }
  const body = JSON.parse(await response.text()) as { ok?: boolean; result?: TelegramUpdate[] };
  const updates = Array.isArray(body.result) ? body.result : [];
  const dispatches: VerifiedRuntimeTelegramDispatchResult[] = [];
  let nextOffset: number | null = input.offset ?? null;
  for (const update of updates) {
    if (typeof update.update_id === "number") {
      nextOffset = Math.max(nextOffset ?? 0, update.update_id + 1);
    }
    const text = update.message?.text;
    const chatId = update.message?.chat?.id;
    if (!text || chatId === undefined) {
      continue;
    }
    const chat = String(chatId);
    if (config.allowed_chat_ids.length > 0 && !config.allowed_chat_ids.includes(chat)) {
      continue;
    }
    dispatches.push(await dispatchVerifiedRuntimeTelegramMessage(definition, {
      workspaceRoot: input.workspaceRoot,
      chatId: chat,
      text,
      env,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      sendReply: input.sendReply ?? true
    }));
  }
  const withoutHash = {
    poll_id: `${definition.cli_name.replace(/-/g, "_")}_poll_${shortHash({
      root: config.workspace_root,
      update_count: updates.length,
      handled_count: dispatches.length,
      next_offset: nextOffset
    })}`,
    runtime: definition.runtime_id,
    workspace_root: config.workspace_root,
    update_count: updates.length,
    handled_count: dispatches.length,
    next_offset: nextOffset,
    dispatches
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

export async function sendVerifiedRuntimeTelegramReply(input: {
  botToken: string;
  chatId: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<{ status: "SENT"; response_hash: string; audit_hash: string }> {
  const token = input.botToken.trim();
  if (!token) {
    throw new Error("missing Telegram bot token");
  }
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true
    })
  });
  if (!response.ok) {
    throw new Error(`telegram send failed: ${response.status}`);
  }
  const body = await response.text();
  const withoutHash = {
    status: "SENT" as const,
    response_hash: hashCanonical(body)
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

function telegramBotToken(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>): string {
  return env[`${definition.env_prefix}_TELEGRAM_BOT_TOKEN`] ?? env.OMNIS_TELEGRAM_BOT_TOKEN ?? env.TELEGRAM_BOT_TOKEN ?? "";
}

function csv(value: string | undefined): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
