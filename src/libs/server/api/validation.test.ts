import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { ApiError } from "@/libs/server/api/errors";
import {
  normalizeMoneyInput,
  parseDateOnlyInput,
  parseIdParam,
  parseJsonRequestBody,
  parseWithSchema,
} from "@/libs/server/api/validation";

const UUID = "00000000-0000-4000-8000-000000000101";

async function expectApiError(
  operation: () => unknown | Promise<unknown>,
): Promise<ApiError> {
  try {
    await operation();
    throw new Error("Expected ApiError.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
}

describe("api validation", () => {
  test("parses JSON request bodies with a Zod schema", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: JSON.stringify({ name: "Main Wallet" }),
    });

    await expect(
      parseJsonRequestBody(
        request,
        z.object({
          name: z.string().min(1),
        }),
      ),
    ).resolves.toEqual({ name: "Main Wallet" });
  });

  test("turns invalid JSON into a bad request ApiError", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: "{",
    });

    const error = await expectApiError(() =>
      parseJsonRequestBody(request, z.object({})),
    );

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("bad_request");
    expect(error.userMessage).toBe("Request body must be valid JSON.");
  });

  test("turns schema failures into validation ApiErrors", async () => {
    const error = await expectApiError(() =>
      parseWithSchema(
        z.object({
          email: z.string().email(),
        }),
        { email: "not-an-email" },
      ),
    );

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual([
      {
        path: "email",
        message: "Invalid email address",
      },
    ]);
  });

  test("parses UUID route parameters", () => {
    expect(parseIdParam(UUID, "accountId")).toBe(UUID);
  });

  test("rejects invalid UUID route parameters", async () => {
    const error = await expectApiError(() =>
      parseIdParam("not-a-uuid", "accountId"),
    );

    expect(error.details).toEqual([
      {
        path: "accountId",
        message: "Must be a valid UUID.",
      },
    ]);
  });

  test("parses strict date-only inputs", () => {
    expect(parseDateOnlyInput("2026-04-06", "transactionDate")).toBe(
      "2026-04-06",
    );
  });

  test("rejects invalid calendar dates", async () => {
    const error = await expectApiError(() =>
      parseDateOnlyInput("2026-02-31", "transactionDate"),
    );

    expect(error.details).toEqual([
      {
        path: "transactionDate",
        message: "Must be a valid YYYY-MM-DD date.",
      },
    ]);
  });

  test("normalizes money inputs into minor units", () => {
    expect(normalizeMoneyInput("123.45", "amount")).toBe(12345);
    expect(normalizeMoneyInput(12.3, "amount")).toBe(1230);
  });

  test("rejects invalid money inputs", async () => {
    const error = await expectApiError(() =>
      normalizeMoneyInput("12.345", "amount"),
    );

    expect(error.details).toEqual([
      {
        path: "amount",
        message: "Must be a valid money amount with at most two decimals.",
      },
    ]);
  });
});
