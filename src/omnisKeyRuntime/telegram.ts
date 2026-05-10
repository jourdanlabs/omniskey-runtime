import { OMNIS_KEY_RUNTIME_DEFINITION } from "../verifiedRuntime/definition.js";
import { dispatchVerifiedRuntimeTelegramMessage, getVerifiedRuntimeTelegramConfig, pollVerifiedRuntimeTelegram, sendVerifiedRuntimeTelegramReply, type VerifiedRuntimeTelegramConfig, type VerifiedRuntimeTelegramDispatchResult, type VerifiedRuntimeTelegramPollResult } from "../verifiedRuntime/telegram.js";
import type { OmnisKeyRuntimeTurnInput } from "./runtime.js";

export type OmnisKeyRuntimeTelegramConfig = VerifiedRuntimeTelegramConfig;
export type OmnisKeyRuntimeTelegramDispatchResult = VerifiedRuntimeTelegramDispatchResult;
export type OmnisKeyRuntimeTelegramPollResult = VerifiedRuntimeTelegramPollResult;

export function getOmnisKeyRuntimeTelegramConfig(input: {
  workspaceRoot: string;
  env?: Record<string, string | undefined>;
}): OmnisKeyRuntimeTelegramConfig {
  return getVerifiedRuntimeTelegramConfig(OMNIS_KEY_RUNTIME_DEFINITION, input);
}

export async function dispatchOmnisKeyRuntimeTelegramMessage(input: {
  workspaceRoot: string;
  chatId: string;
  text: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  sendReply?: boolean;
  turn?: Partial<OmnisKeyRuntimeTurnInput>;
}): Promise<OmnisKeyRuntimeTelegramDispatchResult> {
  return dispatchVerifiedRuntimeTelegramMessage(OMNIS_KEY_RUNTIME_DEFINITION, input);
}

export async function pollOmnisKeyRuntimeTelegram(input: {
  workspaceRoot: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  offset?: number;
  limit?: number;
  sendReply?: boolean;
}): Promise<OmnisKeyRuntimeTelegramPollResult> {
  return pollVerifiedRuntimeTelegram(OMNIS_KEY_RUNTIME_DEFINITION, input);
}

export const sendOmnisKeyRuntimeTelegramReply = sendVerifiedRuntimeTelegramReply;
