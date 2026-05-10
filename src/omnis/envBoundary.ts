export function runtimeEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  return env ?? process.env;
}
