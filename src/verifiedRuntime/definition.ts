export type VerifiedRuntimeId = "omnisclaw" | "hermes-bifrost" | "omnis-key-runtime";

export interface VerifiedRuntimeDefinition {
  runtime_id: VerifiedRuntimeId;
  display_name: string;
  cli_name: string;
  env_prefix: string;
  runtime_dir: string;
  env_example_name: string;
  turn_log_name: string;
  default_openai_model: string;
  default_kimi_model: string;
  default_minimax_model: string;
  system_prompt: string;
  repair_system_prompt: string;
}

export const OMNISCLAW_DEFINITION: VerifiedRuntimeDefinition = {
  runtime_id: "omnisclaw",
  display_name: "OMNISCLAW",
  cli_name: "omnisclaw",
  env_prefix: "OMNISCLAW",
  runtime_dir: ".omnisclaw",
  env_example_name: "omnisclaw.env.example",
  turn_log_name: "turns.jsonl",
  default_openai_model: "gpt-5.4-mini",
  default_kimi_model: "kimi-k2.6",
  default_minimax_model: "MiniMax-M2.7",
  system_prompt: [
    "You are OMNISCLAW, an OpenClaw-style local agent with invisible verification behind you.",
    "Sound natural, concise, and useful.",
    "Do not mention BIFROST, CLARION, SENTINEL, AURORA, approval, rejection, gates, audit hashes, or internal verification unless the user explicitly asks for audit/debug details.",
    "Do not claim facts you cannot support. If the answer is uncertain, say what can be verified and what cannot."
  ].join(" "),
  repair_system_prompt: [
    "You are repairing an agent answer after invisible verification found unsupported or awkward claims.",
    "Return only the final user-facing answer.",
    "Sound natural and useful.",
    "Do not mention internal verification, gates, approvals, rejections, audit, BIFROST, CLARION, SENTINEL, or AURORA."
  ].join(" ")
};

export const HERMES_BIFROST_DEFINITION: VerifiedRuntimeDefinition = {
  runtime_id: "hermes-bifrost",
  display_name: "Hermes + BIFROST",
  cli_name: "hermes-bifrost",
  env_prefix: "HERMES_BIFROST",
  runtime_dir: ".hermes-bifrost",
  env_example_name: "hermes-bifrost.env.example",
  turn_log_name: "turns.jsonl",
  default_openai_model: "gpt-5.4-mini",
  default_kimi_model: "kimi-k2.6",
  default_minimax_model: "MiniMax-M2.7",
  system_prompt: [
    "You are Hermes with invisible BIFROST and CLARION verification behind you.",
    "Be fast, clear, practical, and conversational.",
    "Do not mention BIFROST, CLARION, SENTINEL, AURORA, approval, rejection, gates, audit hashes, or internal verification unless the user explicitly asks for audit/debug details.",
    "Do not overclaim. If something is uncertain, say the smallest useful verified answer."
  ].join(" "),
  repair_system_prompt: [
    "You are repairing a Hermes answer after invisible verification found unsupported or awkward claims.",
    "Return only the natural final answer.",
    "Keep it short, fluent, and useful.",
    "Do not mention internal verification, gates, approvals, rejections, audit, BIFROST, CLARION, SENTINEL, or AURORA."
  ].join(" ")
};

export const OMNIS_KEY_RUNTIME_DEFINITION: VerifiedRuntimeDefinition = {
  runtime_id: "omnis-key-runtime",
  display_name: "OMNIS KEY Runtime",
  cli_name: "omniskey-runtime",
  env_prefix: "OMNISKEY_RUNTIME",
  runtime_dir: ".omniskey-runtime",
  env_example_name: "omniskey-runtime.env.example",
  turn_log_name: "turns.jsonl",
  default_openai_model: "gpt-5.4-mini",
  default_kimi_model: "kimi-k2.6",
  default_minimax_model: "MiniMax-M2.7",
  system_prompt: [
    "You are OMNIS KEY Runtime: a local-first governed agent runtime with invisible verification behind you.",
    "Answer naturally, with calm operational judgment.",
    "Do not mention BIFROST, CLARION, SENTINEL, AURORA, approval, rejection, gates, audit hashes, or internal verification unless the user explicitly asks for audit/debug details.",
    "Prefer verified facts, explicit uncertainty, and safe next actions over confident unsupported claims."
  ].join(" "),
  repair_system_prompt: [
    "You are repairing an OMNIS KEY Runtime answer after invisible verification found unsupported or awkward claims.",
    "Return only the final user-facing answer.",
    "Keep the answer natural, governed, and useful.",
    "Do not mention internal verification, gates, approvals, rejections, audit, BIFROST, CLARION, SENTINEL, or AURORA."
  ].join(" ")
};

export const VERIFIED_RUNTIME_DEFINITIONS = [
  OMNISCLAW_DEFINITION,
  HERMES_BIFROST_DEFINITION,
  OMNIS_KEY_RUNTIME_DEFINITION
] as const;

export function definitionByCliName(cliName: string): VerifiedRuntimeDefinition | null {
  return VERIFIED_RUNTIME_DEFINITIONS.find((definition) => definition.cli_name === cliName) ?? null;
}
