import { describe, expect, mock, test } from "bun:test";

import { createLogger, type LogEntry } from "@/libs/server/logger";

function createSinkStub() {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("server logger", () => {
  test("writes structured info logs", () => {
    const sink = createSinkStub();
    const logger = createLogger({
      sink,
      now: () => new Date("2026-04-06T00:00:00.000Z"),
    });

    logger.info("account.created", { accountId: "account-1" });

    expect(sink.info).toHaveBeenCalledWith({
      timestamp: "2026-04-06T00:00:00.000Z",
      level: "info",
      event: "account.created",
      metadata: { accountId: "account-1" },
    } satisfies LogEntry);
  });

  test("supports high-risk auth, seed, and transfer event hooks", () => {
    const sink = createSinkStub();
    const logger = createLogger({
      sink,
      now: () => new Date("2026-04-06T00:00:00.000Z"),
    });

    logger.auth("callback.failed", { email: "blocked@example.com" }, "warn");
    logger.seed("failed", { mode: "test" }, "error");
    logger.transfer("write.started", { transferGroupId: "group-1" });

    expect(sink.warn).toHaveBeenCalledWith({
      timestamp: "2026-04-06T00:00:00.000Z",
      level: "warn",
      event: "auth.callback.failed",
      metadata: { email: "blocked@example.com" },
    } satisfies LogEntry);
    expect(sink.error).toHaveBeenCalledWith({
      timestamp: "2026-04-06T00:00:00.000Z",
      level: "error",
      event: "seed.failed",
      metadata: { mode: "test" },
    } satisfies LogEntry);
    expect(sink.info).toHaveBeenCalledWith({
      timestamp: "2026-04-06T00:00:00.000Z",
      level: "info",
      event: "transfer.write.started",
      metadata: { transferGroupId: "group-1" },
    } satisfies LogEntry);
  });
});
