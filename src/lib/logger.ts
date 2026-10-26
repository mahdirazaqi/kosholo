// Plain line logs to stdout/stderr (Docker collects them):
//   2026-10-26T12:00:00.000Z ERROR [upload] processing failed: <message>
// Never pass secrets, passwords, tokens or request bodies to the logger.
// No "server-only": the custom server uses it too.
type Level = "info" | "warn" | "error";

function format(level: Level, scope: string, message: string, error?: unknown) {
  let line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  if (error instanceof Error) line += `: ${error.stack ?? error.message}`;
  else if (error !== undefined) line += `: ${String(error)}`;
  return line;
}

export const logger = {
  info: (scope: string, message: string) => console.log(format("info", scope, message)),
  warn: (scope: string, message: string, error?: unknown) => console.warn(format("warn", scope, message, error)),
  error: (scope: string, message: string, error?: unknown) => console.error(format("error", scope, message, error)),
};
