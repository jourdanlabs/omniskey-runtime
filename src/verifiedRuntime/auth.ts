import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashCanonical } from "../audit/hash.js";
import type { VerifiedRuntimeDefinition } from "./definition.js";

export type MiniMaxOAuthRegion = "global" | "cn";

export interface VerifiedRuntimeAuthStatus {
  runtime: string;
  auth_home: string;
  profiles_path: string;
  providers: Array<{
    provider_id: "minimax";
    auth_type: "oauth";
    configured: boolean;
    expired: boolean;
    region: MiniMaxOAuthRegion;
    profile_id: string;
    resource_url_configured: boolean;
    expires?: number;
  }>;
  audit_hash: string;
}

export interface MiniMaxOAuthCredential {
  type: "oauth";
  provider: "minimax-portal";
  access: string;
  refresh?: string;
  expires?: number;
  region: MiniMaxOAuthRegion;
  resourceUrl?: string;
  email?: string;
  displayName?: string;
  accountId?: string;
}

interface AuthProfile {
  profileId: string;
  credential: MiniMaxOAuthCredential;
}

interface AuthProfileStore {
  version: 1;
  profiles: AuthProfile[];
}

interface MiniMaxOAuthCodeResponse {
  user_code?: string;
  verification_uri?: string;
  interval?: number;
  expired_in?: number;
  state?: string;
}

interface MiniMaxOAuthTokenResponse {
  status?: string;
  access_token?: string;
  refresh_token?: string;
  expired_in?: number;
  resource_url?: string;
  notification_message?: string;
  base_resp?: {
    status_msg?: string;
  };
}

export const MINIMAX_OAUTH_CONFIG = {
  global: {
    baseUrl: "https://api.minimax.io",
    anthropicBaseUrl: "https://api.minimax.io/anthropic",
    clientId: "78257093-7e40-4613-99e0-527b14b39113"
  },
  cn: {
    baseUrl: "https://api.minimaxi.com",
    anthropicBaseUrl: "https://api.minimaxi.com/anthropic",
    clientId: "78257093-7e40-4613-99e0-527b14b39113"
  }
} as const;

const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";
const MINIMAX_OAUTH_EXPIRY_SKEW_MS = 60_000;

export async function loginVerifiedRuntimeMiniMaxOAuth(
  definition: VerifiedRuntimeDefinition,
  input?: {
    env?: Record<string, string | undefined>;
    region?: MiniMaxOAuthRegion;
    fetchImpl?: typeof fetch;
    openUrl?: (url: string) => Promise<void>;
    note?: (message: string) => Promise<void>;
  }
): Promise<VerifiedRuntimeAuthStatus> {
  const env = input?.env ?? process.env;
  const region = input?.region ?? "global";
  const token = await loginMiniMaxPortalOAuth({
    region,
    openUrl: input?.openUrl ?? defaultOpenUrl,
    note: input?.note ?? defaultNote,
    ...(input?.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
  });
  writeMiniMaxOAuthCredential(definition, {
    env,
    credential: {
      type: "oauth",
      provider: "minimax-portal",
      access: token.access,
      ...(token.refresh ? { refresh: token.refresh } : {}),
      ...(token.expires ? { expires: token.expires } : {}),
      region,
      ...(token.resourceUrl ? { resourceUrl: token.resourceUrl } : {})
    }
  });
  if (token.notification_message) {
    await (input?.note ?? defaultNote)(token.notification_message);
  }
  return getVerifiedRuntimeAuthStatus(definition, { env });
}

export function getVerifiedRuntimeAuthStatus(
  definition: VerifiedRuntimeDefinition,
  input?: {
    env?: Record<string, string | undefined>;
  }
): VerifiedRuntimeAuthStatus {
  const env = input?.env ?? process.env;
  const authHome = verifiedRuntimeAuthHome(definition, env);
  const profilesPath = authProfilesPath(definition, env);
  const credential = readMiniMaxOAuthCredential(definition, { env });
  const region = credential?.region ?? "global";
  const profileId = miniMaxOAuthProfileId(definition, region);
  const withoutHash = {
    runtime: definition.runtime_id,
    auth_home: authHome,
    profiles_path: profilesPath,
    providers: [
      {
        provider_id: "minimax" as const,
        auth_type: "oauth" as const,
        configured: Boolean(credential && !isMiniMaxCredentialExpired(credential)),
        expired: Boolean(credential && isMiniMaxCredentialExpired(credential)),
        region,
        profile_id: profileId,
        resource_url_configured: Boolean(credential?.resourceUrl),
        ...(credential?.expires ? { expires: credential.expires } : {})
      }
    ]
  };
  return {
    ...withoutHash,
    audit_hash: hashCanonical(withoutHash)
  };
}

export function logoutVerifiedRuntimeAuth(
  definition: VerifiedRuntimeDefinition,
  input?: {
    env?: Record<string, string | undefined>;
    provider?: "minimax";
    region?: MiniMaxOAuthRegion;
  }
): VerifiedRuntimeAuthStatus {
  const env = input?.env ?? process.env;
  const store = readAuthProfileStore(definition, env);
  const region = input?.region;
  const profileIds = region
    ? [miniMaxOAuthProfileId(definition, region)]
    : [miniMaxOAuthProfileId(definition, "global"), miniMaxOAuthProfileId(definition, "cn")];
  const next = {
    version: 1 as const,
    profiles: store.profiles.filter((profile) => !profileIds.includes(profile.profileId))
  };
  writeAuthProfileStore(definition, env, next);
  return getVerifiedRuntimeAuthStatus(definition, { env });
}

export function readMiniMaxOAuthCredential(
  definition: VerifiedRuntimeDefinition,
  input?: {
    env?: Record<string, string | undefined>;
    region?: MiniMaxOAuthRegion;
  }
): MiniMaxOAuthCredential | null {
  const env = input?.env ?? process.env;
  const store = readAuthProfileStore(definition, env);
  const regions = input?.region ? [input.region] : ["global", "cn"] as const;
  for (const region of regions) {
    const profile = store.profiles.find((item) => item.profileId === miniMaxOAuthProfileId(definition, region));
    if (profile?.credential.provider === "minimax-portal") {
      return profile.credential;
    }
  }
  return null;
}

export function writeMiniMaxOAuthCredential(
  definition: VerifiedRuntimeDefinition,
  input: {
    env?: Record<string, string | undefined>;
    credential: MiniMaxOAuthCredential;
  }
): void {
  const env = input.env ?? process.env;
  const store = readAuthProfileStore(definition, env);
  const profileId = miniMaxOAuthProfileId(definition, input.credential.region);
  const nextProfiles = store.profiles.filter((profile) => profile.profileId !== profileId);
  nextProfiles.push({ profileId, credential: input.credential });
  writeAuthProfileStore(definition, env, {
    version: 1,
    profiles: nextProfiles
  });
}

export function isMiniMaxOAuthConfigured(
  definition: VerifiedRuntimeDefinition,
  env: Record<string, string | undefined>
): boolean {
  const credential = readMiniMaxOAuthCredential(definition, { env });
  return Boolean(credential && !isMiniMaxCredentialExpired(credential));
}

export function miniMaxOAuthBearer(
  definition: VerifiedRuntimeDefinition,
  env: Record<string, string | undefined>
): {
  accessToken: string;
  baseUrl: string;
} | null {
  const credential = readMiniMaxOAuthCredential(definition, { env });
  if (!credential) return null;
  if (isMiniMaxCredentialExpired(credential)) {
    throw new Error("MiniMax OAuth token expired. Re-run auth login minimax.");
  }
  return {
    accessToken: credential.access,
    baseUrl: credential.resourceUrl ?? MINIMAX_OAUTH_CONFIG[credential.region].anthropicBaseUrl
  };
}

export function verifiedRuntimeAuthHome(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>): string {
  return resolve(env[`${definition.env_prefix}_AUTH_HOME`] ?? env.OMNIS_AUTH_HOME ?? join(homedir(), definition.runtime_dir));
}

export function authProfilesPath(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>): string {
  return join(verifiedRuntimeAuthHome(definition, env), "auth-profiles.json");
}

export function miniMaxOAuthProfileId(definition: VerifiedRuntimeDefinition, region: MiniMaxOAuthRegion): string {
  return `${definition.cli_name}:minimax-portal:${region}`;
}

async function loginMiniMaxPortalOAuth(input: {
  region: MiniMaxOAuthRegion;
  fetchImpl?: typeof fetch;
  openUrl: (url: string) => Promise<void>;
  note: (message: string) => Promise<void>;
}): Promise<{
  access: string;
  refresh?: string;
  expires?: number;
  resourceUrl?: string;
  notification_message?: string;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const { verifier, challenge } = generatePkceVerifierChallenge();
  const state = randomBytes(16).toString("base64url");
  const config = MINIMAX_OAUTH_CONFIG[input.region];
  const codeResponse = await postForm<MiniMaxOAuthCodeResponse>(fetchImpl, `${config.baseUrl}/oauth/code`, {
    response_type: "code",
    client_id: config.clientId,
    scope: MINIMAX_OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  }, {
    "x-request-id": randomUUID()
  });
  if (!codeResponse.user_code || !codeResponse.verification_uri || !codeResponse.expired_in) {
    throw new Error("MiniMax OAuth authorization returned an incomplete payload.");
  }
  if (codeResponse.state !== state) {
    throw new Error("MiniMax OAuth state mismatch: possible CSRF attack or session corruption.");
  }
  await input.note([
    "MiniMax OAuth",
    `Open ${codeResponse.verification_uri} to approve access.`,
    `If prompted, enter the code ${codeResponse.user_code}.`
  ].join("\n"));
  try {
    await input.openUrl(codeResponse.verification_uri);
  } catch {
    // The URL and user code were already printed; browser open is best-effort.
  }
  let interval = Math.max(codeResponse.interval ?? 2000, 2000);
  while (Date.now() < codeResponse.expired_in) {
    const tokenResponse = await postForm<MiniMaxOAuthTokenResponse>(fetchImpl, `${config.baseUrl}/oauth/token`, {
      grant_type: MINIMAX_OAUTH_GRANT_TYPE,
      client_id: config.clientId,
      user_code: codeResponse.user_code,
      code_verifier: verifier
    });
    if (tokenResponse.status === "error") {
      throw new Error(tokenResponse.base_resp?.status_msg ?? "MiniMax OAuth failed. Please try again later.");
    }
    if (tokenResponse.status === "success" && tokenResponse.access_token && tokenResponse.refresh_token && tokenResponse.expired_in) {
      return {
        access: tokenResponse.access_token,
        refresh: tokenResponse.refresh_token,
        expires: tokenResponse.expired_in,
        ...(tokenResponse.resource_url ? { resourceUrl: tokenResponse.resource_url } : {}),
        ...(tokenResponse.notification_message ? { notification_message: tokenResponse.notification_message } : {})
      };
    }
    await sleep(interval);
    interval = Math.max(interval, 2000);
  }
  throw new Error("MiniMax OAuth timed out before authorization completed.");
}

async function postForm<T>(
  fetchImpl: typeof fetch,
  url: string,
  body: Record<string, string>,
  headers?: Record<string, string>
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/x-www-form-urlencoded",
      ...(headers ?? {})
    },
    body: new URLSearchParams(body).toString()
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`MiniMax OAuth request failed: ${response.status} ${summarizeAuthError(parsed)}`);
  }
  return parsed as T;
}

function readAuthProfileStore(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>): AuthProfileStore {
  const path = authProfilesPath(definition, env);
  if (!existsSync(path)) {
    return { version: 1, profiles: [] };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AuthProfileStore>;
  return {
    version: 1,
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles.filter(isAuthProfile) : []
  };
}

function writeAuthProfileStore(definition: VerifiedRuntimeDefinition, env: Record<string, string | undefined>, store: AuthProfileStore): void {
  const path = authProfilesPath(definition, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

function isAuthProfile(value: unknown): value is AuthProfile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.profileId === "string" &&
    Boolean(record.credential) &&
    typeof record.credential === "object" &&
    (record.credential as Record<string, unknown>).provider === "minimax-portal";
}

function isMiniMaxCredentialExpired(credential: MiniMaxOAuthCredential): boolean {
  return typeof credential.expires === "number" && credential.expires <= Date.now() + MINIMAX_OAUTH_EXPIRY_SKEW_MS;
}

function generatePkceVerifierChallenge(): {
  verifier: string;
  challenge: string;
} {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function summarizeAuthError(value: unknown): string {
  if (!value || typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const baseResp = record.base_resp;
  if (baseResp && typeof baseResp === "object") {
    const statusMsg = (baseResp as Record<string, unknown>).status_msg;
    if (typeof statusMsg === "string") return statusMsg;
  }
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return JSON.stringify(value).slice(0, 300);
}

async function defaultNote(message: string): Promise<void> {
  process.stderr.write(`${message}\n`);
}

async function defaultOpenUrl(url: string): Promise<void> {
  const command = platform() === "darwin"
    ? "open"
    : platform() === "win32"
      ? "cmd"
      : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
