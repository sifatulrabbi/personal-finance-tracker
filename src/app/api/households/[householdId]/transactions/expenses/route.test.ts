import { beforeEach, describe, expect, test } from "bun:test";

import { mockAccounts, mockCategories } from "@/libs/server/api/mock-data";
import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  MOCK_USER_ID,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { POST } from "./route";

const validAccount = mockAccounts[0]!;
const validCategory = mockCategories[0]!;
const validPersonId = "00000000-0000-4000-8000-000000000103";

describe("transactions/expenses POST", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 201 with created expense using categoryId", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        amount: "32.50",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.type).toBe("expense");
    expect(json.data.amountMinor).toBe(3250);
    expect(json.data.createdByUserId).toBe(MOCK_USER_ID);
    expect(json.data.accountId).toBe(validAccount.id);
    expect(json.data.transferGroupId).toBeNull();
  });

  test("returns 201 with created expense using categoryName", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryName: "New Category",
        amount: "15.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.category.name).toBe("New Category");
  });

  test("returns 400 when both categoryId and categoryName provided", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        categoryName: "Duplicate",
        amount: "10.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 400 when neither categoryId nor categoryName provided", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        amount: "10.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 400 for missing required fields", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ amount: "10.00" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        amount: "10.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
