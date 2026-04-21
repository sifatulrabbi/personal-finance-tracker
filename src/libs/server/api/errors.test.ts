import { describe, expect, mock, test } from "bun:test";

import {
  ApiError,
  createApiErrorResponse,
  createDomainConflictError,
  createValidationError,
  toApiError,
} from "@/libs/server/api/errors";
import type { AppLogger } from "@/libs/server/logger";

function createLoggerStub(): AppLogger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    auth: mock(() => {}),
    seed: mock(() => {}),
    transfer: mock(() => {}),
  };
}

describe("api errors", () => {
  test("creates a user-safe validation error response", async () => {
    const response = createApiErrorResponse(
      createValidationError({
        developerMessage: "email failed schema validation",
        details: [{ path: "email", message: "Invalid email" }],
      }),
      { requestId: "req-1" },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "validation_failed",
        message: "Please check your input and try again.",
        requestId: "req-1",
        details: [{ path: "email", message: "Invalid email" }],
      },
    });
  });

  test("maps domain conflicts to HTTP 409", async () => {
    const response = createApiErrorResponse(
      createDomainConflictError({
        userMessage: "That account name is already in use.",
        developerMessage: "accounts_household_name_unique violation",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "conflict",
        message: "That account name is already in use.",
      },
    });
  });

  test("maps unknown errors to a generic HTTP 500 response", async () => {
    const response = createApiErrorResponse(
      new Error("database connection string leaked detail"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "internal_server_error",
        message: "Something went wrong. Please try again.",
      },
    });
  });

  test("logs developer diagnostics without exposing them to clients", async () => {
    const logger = createLoggerStub();
    const response = createApiErrorResponse(
      new ApiError({
        statusCode: 400,
        code: "bad_request",
        userMessage: "Request body must be valid JSON.",
        developerMessage: "Unexpected token at byte 2.",
      }),
      { logger, requestId: "req-2" },
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "bad_request",
        message: "Request body must be valid JSON.",
        requestId: "req-2",
      },
    });
    expect(logger.error).toHaveBeenCalledWith("api.error", {
      requestId: "req-2",
      statusCode: 400,
      code: "bad_request",
      userMessage: "Request body must be valid JSON.",
      developerMessage: "Unexpected token at byte 2.",
    });
  });

  test("keeps existing ApiError instances unchanged", () => {
    const apiError = createValidationError();

    expect(toApiError(apiError)).toBe(apiError);
  });
});
