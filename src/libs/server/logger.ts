import { getUtcTimestamp } from "@/libs/server/time";

export type LogLevel = "info" | "warn" | "error";
export type LogMetadata = Record<string, unknown>;

export type LogEntry = Readonly<{
  timestamp: string;
  level: LogLevel;
  event: string;
  metadata?: LogMetadata;
}>;

export type LogSink = Pick<Console, "info" | "warn" | "error">;

export type AppLogger = Readonly<{
  info: (event: string, metadata?: LogMetadata) => void;
  warn: (event: string, metadata?: LogMetadata) => void;
  error: (event: string, metadata?: LogMetadata) => void;
  auth: (event: string, metadata?: LogMetadata, level?: LogLevel) => void;
  seed: (event: string, metadata?: LogMetadata, level?: LogLevel) => void;
  transfer: (event: string, metadata?: LogMetadata, level?: LogLevel) => void;
}>;

export type LoggerDependencies = Readonly<{
  sink?: LogSink;
  now?: () => Date;
}>;

function writeLogEntry(sink: LogSink, entry: LogEntry): void {
  sink[entry.level](entry);
}

/**
 * Creates a tiny structured logger for developer diagnostics.
 */
export function createLogger({
  sink = console,
  now = () => new Date(),
}: LoggerDependencies = {}): AppLogger {
  function log(level: LogLevel, event: string, metadata?: LogMetadata): void {
    writeLogEntry(sink, {
      timestamp: getUtcTimestamp(now()),
      level,
      event,
      metadata,
    });
  }

  function logCategory(
    category: "auth" | "seed" | "transfer",
    event: string,
    metadata?: LogMetadata,
    level: LogLevel = "info",
  ): void {
    log(level, `${category}.${event}`, metadata);
  }

  return {
    info: (event, metadata) => log("info", event, metadata),
    warn: (event, metadata) => log("warn", event, metadata),
    error: (event, metadata) => log("error", event, metadata),
    auth: (event, metadata, level) =>
      logCategory("auth", event, metadata, level),
    seed: (event, metadata, level) =>
      logCategory("seed", event, metadata, level),
    transfer: (event, metadata, level) =>
      logCategory("transfer", event, metadata, level),
  };
}

export const logger = createLogger();
