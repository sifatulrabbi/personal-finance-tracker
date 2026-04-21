import { describe, expect, test } from "bun:test";

import { ApiError } from "@/libs/server/api/errors";

import { requireHouseholdAccess } from "./access";

const VALID_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000101";

const mockUser = {
  id: "00000000-0000-4000-8000-000000000102",
  householdId: VALID_HOUSEHOLD_ID,
  email: "test@example.com",
  name: "Test User",
  workosUserId: "workos_user_123",
};

describe("requireHouseholdAccess", () => {
  test("returns householdId when it matches the user", async () => {
    const result = await requireHouseholdAccess(
      Promise.resolve({ householdId: VALID_HOUSEHOLD_ID }),
      mockUser,
    );

    expect(result).toBe(VALID_HOUSEHOLD_ID);
  });

  test("throws 403 when householdId does not match the user", async () => {
    try {
      await requireHouseholdAccess(
        Promise.resolve({
          householdId: "00000000-0000-4000-8000-999999999999",
        }),
        mockUser,
      );
      throw new Error("Expected ApiError.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(403);
      expect((error as ApiError).code).toBe("forbidden");
    }
  });

  test("throws 400 when householdId is not a valid UUID", async () => {
    try {
      await requireHouseholdAccess(
        Promise.resolve({ householdId: "not-a-uuid" }),
        mockUser,
      );
      throw new Error("Expected ApiError.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).code).toBe("validation_failed");
    }
  });
});
