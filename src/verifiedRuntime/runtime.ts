import type { OmnisModelProviderCallResult, OmnisModelProviderId } from "../types.js";
import { hashCanonical, shortHash } from "../audit/hash.js";
import { buildFluidRepairPrompt, verifyFluidAgentResponse } from "../bifrost/fluid.js";
import { invokeKimiChat } from "../omnis/providerAdapters/kimi.js";
import { invokeMiniMaxChat } from "../omnis/providerAdapters/minimax.js";
import { invokeOpenAIResponse } from "../omnis/providerAdapters/openai.js";
import type { VerifiedRuntimeDefinition, VerifiedRuntimeId } from "./definition.js";
import { runtimeEnv } from "../omnis/envBoundary.js";
import { appendVerifiedRuntimeTurn } from "./store.js";
import type { VerifiedAgentModelTarget, VerifiedAgentTurnInput, VerifiedAgentTurnResult } from "./types.js";
export type { VerifiedAgentModelTarget, VerifiedAgentTurnInput, VerifiedAgentTurnResult } from "./types.js";

export async function runVerifiedAgentTurn(
  definition: VerifiedRuntimeDefinition,
  input: VerifiedAgentTurnInput
): Promise<VerifiedAgentTurnResult> {
  const env = runtimeEnv(input.env);
  const target = resolveVerifiedModelTarget(definition, {
    env,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.model ? { model: input.model } : {})
  });
  if (!target.configured) {
    throw new Error(`${definition.display_name} provider is not configured. Set ${target.secret_ref} or choose another provider.`);
  }
  const maxOutputTokens = input.maxOutputTokens ?? positiveInteger(env[`${definition.env_prefix}_MAX_OUTPUT_TOKENS`], 900);
  const maxRepairAttempts = input.maxRepairAttempts ?? positiveInteger(env[`${definition.env_prefix}_MAX_REPAIR_ATTEMPTS`], 1);
  const providerResults: OmnisModelProviderCallResult[] = [];
  const draft = await invokeVerifiedModel({
    target,
    apiKey: apiKeyForTarget(target, env),
    system: definition.system_prompt,
    user: input.message,
    maxOutputTokens,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
  providerResults.push(draft);
  let verification = verifyFluidAgentResponse({
    userMessage: input.message,
    draftResponse: draft.output_text,
    mode: input.mode ?? "silent",
    runtime: definition.runtime_id,
    ...(input.context ? { context: input.context } : {})
  });
  if (verification.blockers.length > 0 && maxRepairAttempts > 0) {
    const repair = await invokeVerifiedModel({
      target,
      apiKey: apiKeyForTarget(target, env),
      system: definition.repair_system_prompt,
      user: buildFluidRepairPrompt({
        userMessage: input.message,
        failedDraft: draft.output_text,
        blockers: verification.blockers,
        ...(input.context ? { context: input.context } : {})
      }),
      maxOutputTokens,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
    providerResults.push(repair);
    const repairedVerification = verifyFluidAgentResponse({
      userMessage: input.message,
      draftResponse: repair.output_text,
      mode: input.mode ?? "silent",
      runtime: definition.runtime_id,
      repairAttempt: true,
      ...(input.context ? { context: input.context } : {})
    });
    verification = repairedVerification.blockers.length <= verification.blockers.length
      ? repairedVerification
      : verification;
  }
  const withoutHash = {
    turn_id: `${definition.cli_name.replace(/-/g, "_")}_turn_${shortHash({
      message: input.message,
      target: target.audit_hash,
      provider_results: providerResults.map((result) => result.audit_hash),
      verification: verification.audit.audit_hash
    })}`,
    runtime: definition.runtime_id,
    response_text: verification.response,
    provider_target: target,
    provider_results: providerResults,
    verification,
    repaired: verification.repaired
  };
  const result = {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
  if (input.persist === true) {
    appendVerifiedRuntimeTurn(definition, input.workspaceRoot ?? ".", result);
  }
  return result;
}

export function resolveVerifiedModelTarget(
  definition: VerifiedRuntimeDefinition,
  input: {
    env?: Record<string, string | undefined>;
    providerId?: OmnisModelProviderId;
    model?: string;
  }
): VerifiedAgentModelTarget {
  const env = runtimeEnv(input.env);
  const provider_id = normalizeProvider(input.providerId ?? env[`${definition.env_prefix}_PROVIDER`] ?? env.DEFAULT_PROVIDER ?? firstConfiguredProvider(env));
  const model = input.model ?? env[`${definition.env_prefix}_MODEL`] ?? defaultModel(definition, provider_id, env);
  const secret_ref = secretRef(provider_id);
  const withoutHash = {
    provider_id,
    model,
    secret_ref,
    configured: Boolean(env[secret_ref] || fallbackSecret(provider_id, env))
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

async function invokeVerifiedModel(input: {
  target: VerifiedAgentModelTarget;
  apiKey: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
}): Promise<OmnisModelProviderCallResult> {
  if (input.target.provider_id === "kimi") {
    return invokeKimiChat({
      apiKey: input.apiKey,
      model: input.target.model,
      system: input.system,
      user: input.user,
      maxOutputTokens: input.maxOutputTokens,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
  }
  if (input.target.provider_id === "minimax") {
    return invokeMiniMaxChat({
      apiKey: input.apiKey,
      model: input.target.model,
      system: input.system,
      user: input.user,
      maxOutputTokens: input.maxOutputTokens,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
    });
  }
  return invokeOpenAIResponse({
    apiKey: input.apiKey,
    model: input.target.model,
    system: input.system,
    user: input.user,
    maxOutputTokens: input.maxOutputTokens,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
}

function normalizeProvider(value: string): OmnisModelProviderId {
  const normalized = value.trim().toLowerCase();
  if (normalized === "kimi" || normalized === "minimax" || normalized === "openai") {
    return normalized;
  }
  return "openai";
}

function firstConfiguredProvider(env: Record<string, string | undefined>): OmnisModelProviderId {
  if (env.OMNIS_OPENAI_API_KEY || env.OPENAI_API_KEY) return "openai";
  if (env.OMNIS_KIMI_API_KEY || env.KIMI_API_KEY || env.MOONSHOT_API_KEY) return "kimi";
  if (env.OMNIS_MINIMAX_API_KEY || env.MINIMAX_API_KEY) return "minimax";
  return "openai";
}

function defaultModel(definition: VerifiedRuntimeDefinition, providerId: OmnisModelProviderId, env: Record<string, string | undefined>): string {
  if (providerId === "kimi") {
    return env.KIMI_MODEL ?? env.OMNIS_KIMI_MODEL ?? definition.default_kimi_model;
  }
  if (providerId === "minimax") {
    return env.MINIMAX_MODEL ?? env.OMNIS_MINIMAX_MODEL ?? definition.default_minimax_model;
  }
  return env.OPENAI_MODEL ?? env.OMNIS_OPENAI_MODEL ?? definition.default_openai_model;
}

function secretRef(providerId: OmnisModelProviderId): string {
  if (providerId === "kimi") return "OMNIS_KIMI_API_KEY";
  if (providerId === "minimax") return "OMNIS_MINIMAX_API_KEY";
  return "OMNIS_OPENAI_API_KEY";
}

function fallbackSecret(providerId: OmnisModelProviderId, env: Record<string, string | undefined>): string {
  if (providerId === "kimi") return env.KIMI_API_KEY ?? env.MOONSHOT_API_KEY ?? "";
  if (providerId === "minimax") return env.MINIMAX_API_KEY ?? "";
  return env.OPENAI_API_KEY ?? "";
}

function apiKeyForTarget(target: VerifiedAgentModelTarget, env: Record<string, string | undefined>): string {
  return env[target.secret_ref] ?? fallbackSecret(target.provider_id, env);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
