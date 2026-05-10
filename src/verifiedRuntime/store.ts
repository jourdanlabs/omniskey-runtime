import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson } from "../audit/canonicalize.js";
import { hashCanonical, shortHash } from "../audit/hash.js";
import { runtimeEnv } from "../omnis/envBoundary.js";
import { currentOmnisTimestamp } from "../omnis/paths.js";
import { isMiniMaxOAuthConfigured } from "./auth.js";
import type { VerifiedRuntimeDefinition, VerifiedRuntimeId } from "./definition.js";
import type { VerifiedAgentTurnResult } from "./types.js";

export interface VerifiedRuntimeInitResult {
  runtime: VerifiedRuntimeId;
  workspace_root: string;
  runtime_dir: string;
  env_example_path: string;
  turn_log_path: string;
  created: boolean;
  audit_hash: string;
}

export interface VerifiedRuntimeStatus {
  runtime: VerifiedRuntimeId;
  workspace_root: string;
  runtime_dir: string;
  initialized: boolean;
  env_example_path: string;
  turn_log_path: string;
  turn_count: number;
  configured_provider: {
    provider_id: string;
    model: string;
    configured: boolean;
    secret_ref: string;
  };
  telegram_configured: boolean;
  audit_hash: string;
}

export interface VerifiedRuntimeTurnLogEntry {
  entry_id: string;
  runtime: VerifiedRuntimeId;
  timestamp: string;
  turn_id: string;
  response_hash: string;
  provider_id: string;
  model: string;
  repaired: boolean;
  verification_status: string;
  audit_hash: string;
}

export function initVerifiedRuntime(definition: VerifiedRuntimeDefinition, workspaceRoot: string, input?: {
  env?: Record<string, string | undefined>;
}): VerifiedRuntimeInitResult {
  const root = resolve(workspaceRoot);
  const dir = verifiedRuntimeDir(definition, root);
  const existed = existsSync(dir);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(verifiedRuntimeEnvExamplePath(definition, root))) {
    writeFileSync(verifiedRuntimeEnvExamplePath(definition, root), envExample(definition), "utf8");
  }
  if (!existsSync(verifiedRuntimeTurnLogPath(definition, root))) {
    writeFileSync(verifiedRuntimeTurnLogPath(definition, root), "", "utf8");
  }
  const withoutHash = {
    runtime: definition.runtime_id,
    workspace_root: root,
    runtime_dir: dir,
    env_example_path: verifiedRuntimeEnvExamplePath(definition, root),
    turn_log_path: verifiedRuntimeTurnLogPath(definition, root),
    created: !existed
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical({ ...withoutHash, env: input?.env ? "provided" : "process" })
  };
}

export function getVerifiedRuntimeStatus(definition: VerifiedRuntimeDefinition, workspaceRoot: string, input?: {
  env?: Record<string, string | undefined>;
}): VerifiedRuntimeStatus {
  const root = resolve(workspaceRoot);
  const dir = verifiedRuntimeDir(definition, root);
  const env = runtimeEnv(input?.env);
  const target = resolveStatusTarget(definition, env);
  const turnLog = readVerifiedRuntimeTurns(definition, root);
  const withoutHash = {
    runtime: definition.runtime_id,
    workspace_root: root,
    runtime_dir: dir,
    initialized: existsSync(dir),
    env_example_path: verifiedRuntimeEnvExamplePath(definition, root),
    turn_log_path: verifiedRuntimeTurnLogPath(definition, root),
    turn_count: turnLog.length,
    configured_provider: {
      provider_id: target.provider_id,
      model: target.model,
      configured: target.configured,
      secret_ref: target.secret_ref
    },
    telegram_configured: Boolean(env[`${definition.env_prefix}_TELEGRAM_BOT_TOKEN`] || env.OMNIS_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN)
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

export function appendVerifiedRuntimeTurn(
  definition: VerifiedRuntimeDefinition,
  workspaceRoot: string,
  turn: VerifiedAgentTurnResult
): VerifiedRuntimeTurnLogEntry {
  initVerifiedRuntime(definition, workspaceRoot);
  const withoutHash = {
    entry_id: `${definition.cli_name.replace(/-/g, "_")}_log_${shortHash({
      turn_id: turn.turn_id,
      response: turn.response_text,
      provider: turn.provider_target.audit_hash
    })}`,
    runtime: definition.runtime_id,
    timestamp: currentOmnisTimestamp(),
    turn_id: turn.turn_id,
    response_hash: hashCanonical(turn.response_text),
    provider_id: turn.provider_target.provider_id,
    model: turn.provider_target.model,
    repaired: turn.repaired,
    verification_status: turn.verification.status
  };
  const entry = {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
  appendFileSync(verifiedRuntimeTurnLogPath(definition, workspaceRoot), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function readVerifiedRuntimeTurns(definition: VerifiedRuntimeDefinition, workspaceRoot: string): VerifiedRuntimeTurnLogEntry[] {
  const path = verifiedRuntimeTurnLogPath(definition, workspaceRoot);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as VerifiedRuntimeTurnLogEntry);
}

export function renderVerifiedRuntimeTurnsMarkdown(definition: VerifiedRuntimeDefinition, workspaceRoot: string): string {
  const turns = readVerifiedRuntimeTurns(definition, workspaceRoot);
  return [
    `# ${definition.display_name} Turn Log`,
    "",
    `Workspace: \`${resolve(workspaceRoot)}\``,
    "",
    turns.length === 0
      ? "No turns recorded yet."
      : turns.map((turn) => `- ${turn.timestamp} ${turn.provider_id}/${turn.model} ${turn.verification_status} repaired=${turn.repaired} hash=${turn.audit_hash.slice(0, 12)}`).join("\n"),
    "",
    `\`\`\`json\n${canonicalJson({ runtime: definition.runtime_id, turn_count: turns.length, audit_hash: hashCanonical(turns) })}\n\`\`\``,
    ""
  ].join("\n");
}

export function verifiedRuntimeDir(definition: VerifiedRuntimeDefinition, workspaceRoot: string): string {
  return join(resolve(workspaceRoot), definition.runtime_dir);
}

export function verifiedRuntimeTurnLogPath(definition: VerifiedRuntimeDefinition, workspaceRoot: string): string {
  return join(verifiedRuntimeDir(definition, workspaceRoot), definition.turn_log_name);
}

export function verifiedRuntimeEnvExamplePath(definition: VerifiedRuntimeDefinition, workspaceRoot: string): string {
  return join(verifiedRuntimeDir(definition, workspaceRoot), definition.env_example_name);
}

function envExample(definition: VerifiedRuntimeDefinition): string {
  return [
    `# ${definition.display_name} local environment template.`,
    `# Copy to ${definition.runtime_dir}/${definition.env_example_name.replace(".example", "")} and fill one provider.`,
    `${definition.env_prefix}_PROVIDER=openai`,
    `${definition.env_prefix}_MODEL=${definition.default_openai_model}`,
    `${definition.env_prefix}_MAX_REPAIR_ATTEMPTS=1`,
    `${definition.env_prefix}_MAX_OUTPUT_TOKENS=900`,
    "OMNIS_OPENAI_API_KEY=",
    "OPENAI_API_KEY=",
    "OMNIS_KIMI_API_KEY=",
    "KIMI_API_KEY=",
    "MOONSHOT_API_KEY=",
    "OMNIS_MINIMAX_API_KEY=",
    "MINIMAX_API_KEY=",
    "# MiniMax OAuth is also supported with:",
    `# ${definition.cli_name} auth login minimax`,
    `${definition.env_prefix}_TELEGRAM_BOT_TOKEN=`,
    `${definition.env_prefix}_TELEGRAM_ALLOWED_CHAT_IDS=`,
    `${definition.env_prefix}_TELEGRAM_POLL_INTERVAL_MS=2500`,
    ""
  ].join("\n");
}

function resolveStatusTarget(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>): {
  provider_id: string;
  model: string;
  configured: boolean;
  secret_ref: string;
} {
  const provider_id = env[`${definition.env_prefix}_PROVIDER`] ?? (env.OMNIS_OPENAI_API_KEY || env.OPENAI_API_KEY ? "openai" : env.OMNIS_KIMI_API_KEY || env.KIMI_API_KEY || env.MOONSHOT_API_KEY ? "kimi" : env.OMNIS_MINIMAX_API_KEY || env.MINIMAX_API_KEY || isMiniMaxOAuthConfigured(definition, env) ? "minimax" : "openai");
  if (provider_id === "kimi") {
    return {
      provider_id,
      model: env[`${definition.env_prefix}_MODEL`] ?? env.KIMI_MODEL ?? env.OMNIS_KIMI_MODEL ?? definition.default_kimi_model,
      configured: Boolean(env.OMNIS_KIMI_API_KEY || env.KIMI_API_KEY || env.MOONSHOT_API_KEY),
      secret_ref: "OMNIS_KIMI_API_KEY"
    };
  }
  if (provider_id === "minimax") {
    const oauthConfigured = isMiniMaxOAuthConfigured(definition, env);
    return {
      provider_id,
      model: env[`${definition.env_prefix}_MODEL`] ?? env.MINIMAX_MODEL ?? env.OMNIS_MINIMAX_MODEL ?? definition.default_minimax_model,
      configured: Boolean(env.OMNIS_MINIMAX_API_KEY || env.MINIMAX_API_KEY || oauthConfigured),
      secret_ref: oauthConfigured && !env.OMNIS_MINIMAX_API_KEY && !env.MINIMAX_API_KEY ? "MINIMAX_OAUTH_PROFILE" : "OMNIS_MINIMAX_API_KEY"
    };
  }
  return {
    provider_id: "openai",
    model: env[`${definition.env_prefix}_MODEL`] ?? env.OPENAI_MODEL ?? env.OMNIS_OPENAI_MODEL ?? definition.default_openai_model,
    configured: Boolean(env.OMNIS_OPENAI_API_KEY || env.OPENAI_API_KEY),
    secret_ref: "OMNIS_OPENAI_API_KEY"
  };
}
