import { OMNIS_KEY_RUNTIME_DEFINITION } from "../verifiedRuntime/definition.js";
import { appendVerifiedRuntimeTurn, getVerifiedRuntimeStatus, initVerifiedRuntime, readVerifiedRuntimeTurns, renderVerifiedRuntimeTurnsMarkdown, type VerifiedRuntimeInitResult, type VerifiedRuntimeStatus, type VerifiedRuntimeTurnLogEntry } from "../verifiedRuntime/store.js";
import type { OmnisKeyRuntimeTurnResult } from "./runtime.js";

export type OmnisKeyRuntimeInitResult = VerifiedRuntimeInitResult;
export type OmnisKeyRuntimeStatus = VerifiedRuntimeStatus;
export type OmnisKeyRuntimeTurnLogEntry = VerifiedRuntimeTurnLogEntry;

export function initOmnisKeyRuntime(workspaceRoot: string, input?: { env?: Record<string, string | undefined> }): OmnisKeyRuntimeInitResult {
  return initVerifiedRuntime(OMNIS_KEY_RUNTIME_DEFINITION, workspaceRoot, input);
}

export function getOmnisKeyRuntimeStatus(workspaceRoot: string, input?: { env?: Record<string, string | undefined> }): OmnisKeyRuntimeStatus {
  return getVerifiedRuntimeStatus(OMNIS_KEY_RUNTIME_DEFINITION, workspaceRoot, input);
}

export function appendOmnisKeyRuntimeTurn(workspaceRoot: string, turn: OmnisKeyRuntimeTurnResult): OmnisKeyRuntimeTurnLogEntry {
  return appendVerifiedRuntimeTurn(OMNIS_KEY_RUNTIME_DEFINITION, workspaceRoot, turn);
}

export function readOmnisKeyRuntimeTurns(workspaceRoot: string): OmnisKeyRuntimeTurnLogEntry[] {
  return readVerifiedRuntimeTurns(OMNIS_KEY_RUNTIME_DEFINITION, workspaceRoot);
}

export function renderOmnisKeyRuntimeTurnsMarkdown(workspaceRoot: string): string {
  return renderVerifiedRuntimeTurnsMarkdown(OMNIS_KEY_RUNTIME_DEFINITION, workspaceRoot);
}
