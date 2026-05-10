import { OMNIS_KEY_RUNTIME_DEFINITION } from "../verifiedRuntime/definition.js";
import { resolveVerifiedModelTarget, runVerifiedAgentTurn, type VerifiedAgentModelTarget, type VerifiedAgentTurnInput, type VerifiedAgentTurnResult } from "../verifiedRuntime/runtime.js";

export type OmnisKeyRuntimeTurnInput = VerifiedAgentTurnInput;
export type OmnisKeyRuntimeModelTarget = VerifiedAgentModelTarget;
export type OmnisKeyRuntimeTurnResult = VerifiedAgentTurnResult;

export function resolveOmnisKeyRuntimeModelTarget(input: Parameters<typeof resolveVerifiedModelTarget>[1]): OmnisKeyRuntimeModelTarget {
  return resolveVerifiedModelTarget(OMNIS_KEY_RUNTIME_DEFINITION, input);
}

export async function runOmnisKeyRuntimeTurn(input: OmnisKeyRuntimeTurnInput): Promise<OmnisKeyRuntimeTurnResult> {
  return runVerifiedAgentTurn(OMNIS_KEY_RUNTIME_DEFINITION, input);
}
