import { describe, expect, test } from "bun:test";
import { errorFromBody, errorMessage, networkError } from "./errors";

describe("errorFromBody", () => {
  test("reads the shared error envelope with code, message, and field", () => {
    const error = errorFromBody(
      409,
      JSON.stringify({
        error: {
          code: "duplicate_name",
          message: "A category with this name already exists.",
          field: "name",
        },
      }),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe("duplicate_name");
    expect(error.message).toBe("A category with this name already exists.");
    expect(error.field).toBe("name");
    expect(error.fromServer).toBe(true);
  });

  test("shows a specific legacy server message as sent", () => {
    const error = errorFromBody(400, JSON.stringify({ error: "name is required" }));
    expect(error.message).toBe("name is required");
    expect(error.code).toBe("validation_failed");
    expect(error.fromServer).toBe(true);
  });

  // Regression: every 400 used to say "Amounts need at most two decimal places. USD records
  // need an exchange rate." regardless of what was actually wrong.
  test("a 400 no longer claims a decimal or exchange-rate problem", () => {
    const error = errorFromBody(400, JSON.stringify({ error: "invalid input" }));
    expect(error.message).not.toContain("decimal");
    expect(error.message).not.toContain("exchange rate");
    expect(error.fromServer).toBe(false);
  });

  test("terse legacy sentences fall back to household wording per status", () => {
    expect(errorFromBody(401, '{"error":"authentication required"}').message).toContain(
      "Sign in again",
    );
    expect(
      errorFromBody(409, '{"error":"record changed or request key reused"}').code,
    ).toBe("stale_version");
    expect(errorFromBody(404, '{"error":"record not found"}').code).toBe("not_found");
    expect(errorFromBody(500, '{"error":"internal server error"}').message).toContain(
      "Your entry is still here",
    );
  });

  test("empty and non-JSON bodies still produce a typed error", () => {
    const limited = errorFromBody(429, "");
    expect(limited.code).toBe("rate_limited");
    expect(limited.message).toContain("Wait a minute");
    const proxy = errorFromBody(502, "<html>Bad gateway</html>");
    expect(proxy.code).toBe("internal");
    expect(proxy.status).toBe(502);
  });

  // Regression: the 403 message told household members to check APP_ORIGIN on the server.
  test("a 403 does not use operator language", () => {
    expect(errorFromBody(403, "").message).not.toContain("APP_ORIGIN");
  });

  test("an envelope without a message uses the status fallback", () => {
    const error = errorFromBody(409, '{"error":{"code":"stale_version"}}');
    expect(error.code).toBe("stale_version");
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.fromServer).toBe(false);
  });
});

test("network errors carry status 0 and the network code", () => {
  const error = networkError("timeout");
  expect(error.status).toBe(0);
  expect(error.network).toBe(true);
  expect(errorMessage(error)).toContain("too long");
  expect(errorMessage(new Error("boom"), "fallback")).toBe("fallback");
});
