import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const OMNIS_DIRNAME = ".omnis";
export const LUNA_LOG_FILENAME = "luna.jsonl";
export const OMNIS_PAIRING_FILENAME = "pairing.json";
export const OMNIS_EPOCH = "2026-05-05T00:00:00.000Z";
export const GENESIS_PARENT = "GENESIS";

export function currentOmnisTimestamp(): string {
  return process.env.OMNIS_FIXED_TIME ?? new Date().toISOString();
}

export function omnisDir(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), OMNIS_DIRNAME);
}

export function lunaLogPath(workspaceRoot: string): string {
  return join(omnisDir(workspaceRoot), LUNA_LOG_FILENAME);
}

export function pairingStorePath(workspaceRoot: string): string {
  return join(omnisDir(workspaceRoot), OMNIS_PAIRING_FILENAME);
}

export function ensureOmnisDir(workspaceRoot: string): string {
  const dir = omnisDir(workspaceRoot);
  mkdirSync(dir, { recursive: true });
  return dir;
}
