#!/usr/bin/env node
import { resolve } from "node:path";
import {
  initOmnisKeyRuntime,
  getOmnisKeyRuntimeStatus,
  readOmnisKeyRuntimeTurns,
  renderOmnisKeyRuntimeTurnsMarkdown,
  runOmnisKeyRuntimeTurn,
  getOmnisKeyRuntimeTelegramConfig,
  dispatchOmnisKeyRuntimeTelegramMessage,
  pollOmnisKeyRuntimeTelegram
} from "./index.js";
import type { OmnisModelProviderId } from "./types.js";

const [command, firstArg, ...args] = process.argv.slice(2);

if (!command) {
  usage();
  process.exit(1);
}

if (command === "init") {
  process.stdout.write(json(initOmnisKeyRuntime(resolve(firstArg ?? "."))));
} else if (command === "status") {
  process.stdout.write(json(getOmnisKeyRuntimeStatus(resolve(firstArg ?? "."))));
} else if (command === "log") {
  const markdown = args.includes("--markdown") || firstArg === "--markdown";
  const workspaceRoot = firstArg && firstArg !== "--markdown" ? firstArg : ".";
  process.stdout.write(markdown ? renderOmnisKeyRuntimeTurnsMarkdown(resolve(workspaceRoot)) : json(readOmnisKeyRuntimeTurns(resolve(workspaceRoot))));
} else if (command === "ask") {
  const parsed = parseArgs([firstArg, ...args].filter((item): item is string => Boolean(item)));
  const message = parsed.positionals.join(" ").trim();
  if (!message) {
    usage();
    process.exit(1);
  }
  const result = await runOmnisKeyRuntimeTurn({
    message,
    workspaceRoot: resolve("."),
    mode: parsed.audit ? "audit" : "silent",
    persist: true,
    ...(parsed.provider ? { providerId: providerId(parsed.provider) } : {}),
    ...(parsed.model ? { model: parsed.model } : {})
  });
  process.stdout.write(parsed.json || parsed.audit ? json(result) : `${result.response_text}\n`);
} else if (command === "telegram-config") {
  process.stdout.write(json(getOmnisKeyRuntimeTelegramConfig({ workspaceRoot: resolve(firstArg ?? ".") })));
} else if (command === "telegram-dispatch") {
  if (!firstArg) {
    usage();
    process.exit(1);
  }
  const parsed = parseArgs(args);
  const result = await dispatchOmnisKeyRuntimeTelegramMessage({
    workspaceRoot: resolve("."),
    chatId: firstArg,
    text: parsed.positionals.join(" ").trim() || "Runtime ping",
    sendReply: parsed.send,
    turn: {
      mode: parsed.audit ? "audit" : "silent",
      ...(parsed.provider ? { providerId: providerId(parsed.provider) } : {}),
      ...(parsed.model ? { model: parsed.model } : {})
    }
  });
  process.stdout.write(parsed.json || parsed.audit ? json(result) : `${result.response_text}\n`);
} else if (command === "telegram-poll") {
  const parsed = parseArgs([firstArg, ...args].filter((item): item is string => Boolean(item)));
  const workspaceRoot = firstArg && !firstArg.startsWith("--") ? firstArg : ".";
  const result = await pollOmnisKeyRuntimeTelegram({
    workspaceRoot: resolve(workspaceRoot),
    sendReply: !parsed.noSend,
    ...(parsed.offset !== undefined ? { offset: parsed.offset } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {})
  });
  process.stdout.write(parsed.json ? json(result) : `Handled ${result.handled_count}/${result.update_count} Telegram update(s). Next offset: ${result.next_offset ?? "none"}\n`);
} else {
  usage();
  process.exit(1);
}

function usage(): void {
  process.stderr.write([
    "omniskey-runtime init [workspace]",
    "omniskey-runtime status [workspace]",
    "omniskey-runtime ask <message...> [--json] [--audit] [--provider openai|kimi|minimax] [--model model]",
    "omniskey-runtime log [workspace] [--markdown]",
    "omniskey-runtime telegram-config [workspace]",
    "omniskey-runtime telegram-dispatch <chat-id> <message...> [--json] [--send]",
    "omniskey-runtime telegram-poll [workspace] [--json] [--no-send] [--offset n] [--limit n]"
  ].join("\n") + "\n");
}

function parseArgs(args: string[]): {
  positionals: string[];
  json: boolean;
  audit: boolean;
  send: boolean;
  noSend: boolean;
  offset?: number;
  limit?: number;
  provider?: string;
  model?: string;
} {
  const positionals: string[] = [];
  let jsonOutput = false;
  let audit = false;
  let send = false;
  let noSend = false;
  let offset: number | undefined;
  let limit: number | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--json") { jsonOutput = true; continue; }
    if (arg === "--audit") { audit = true; continue; }
    if (arg === "--send") { send = true; continue; }
    if (arg === "--no-send") { noSend = true; continue; }
    if (arg === "--offset") { offset = Number(args[index + 1]); index += 1; continue; }
    if (arg === "--limit") { limit = Number(args[index + 1]); index += 1; continue; }
    if (arg === "--provider") { provider = args[index + 1]; index += 1; continue; }
    if (arg === "--model") { model = args[index + 1]; index += 1; continue; }
    positionals.push(arg);
  }
  return {
    positionals,
    json: jsonOutput,
    audit,
    send,
    noSend,
    ...(offset !== undefined && Number.isFinite(offset) ? { offset } : {}),
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {})
  };
}

function providerId(value: string): OmnisModelProviderId {
  if (value === "openai" || value === "kimi" || value === "minimax") {
    return value;
  }
  throw new Error("provider must be openai, kimi, or minimax");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
