import type { OmnisModelProviderCallResult, OmnisModelProviderId } from "../types.js";
import type { BifrostFluidContext, BifrostFluidMode, BifrostFluidVerificationResult } from "../bifrost/fluid.js";
import type { VerifiedRuntimeId } from "./definition.js";

export interface VerifiedAgentTurnInput {
  message: string;
  workspaceRoot?: string;
  providerId?: OmnisModelProviderId;
  model?: string;
  mode?: BifrostFluidMode;
  context?: BifrostFluidContext;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  maxRepairAttempts?: number;
  maxOutputTokens?: number;
  persist?: boolean;
}

export interface VerifiedAgentModelTarget {
  provider_id: OmnisModelProviderId;
  model: string;
  secret_ref: string;
  configured: boolean;
  audit_hash: string;
}

export interface VerifiedAgentTurnResult {
  turn_id: string;
  runtime: VerifiedRuntimeId;
  response_text: string;
  provider_target: VerifiedAgentModelTarget;
  provider_results: OmnisModelProviderCallResult[];
  verification: BifrostFluidVerificationResult;
  repaired: boolean;
  audit_hash: string;
}
