import { beforeEach, describe, expect, test } from "bun:test";

import { mockCategories, mockTransactions } from "@/libs/server/api/mock-data";
import {
  INVALID_ID,
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { DELETE } from "./route";

const usedCategory = mockCategories.find((c) =>
  mockTransactions.some((t) => t.categoryId === c.id),
)!;
const unusedCategory = mockCategories.find(
  (c) => !mockTransactions.some((t) => t.categoryId === c.id),
)!;

describe("categories/[categoryId] DELETE", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 204 for unused category", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      categoryId: unusedCategory.id,
    });

    const response = await DELETE(request, { params });

    expect(response.status).toBe(204);
  });

  test("returns 409 for category used by transactions", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      categoryId: usedCategory.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 409, "conflict");
  });

  test("returns 404 for non-existent category", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      categoryId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("returns 400 for invalid categoryId", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      categoryId: INVALID_ID,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      categoryId: unusedCategory.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
