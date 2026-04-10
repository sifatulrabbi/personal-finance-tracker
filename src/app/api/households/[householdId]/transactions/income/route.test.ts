import { beforeEach, describe, expect, test } from "bun:test";

import {
  mockAccounts,
  mockCategories,
  mockOrigins,
} from "@/libs/server/api/mock-data";
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
const validOrigin = mockOrigins[0]!;
const validPersonId = "00000000-0000-4000-8000-000000000103";

describe("transactions/income POST", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 201 with created income using categoryId and originId", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        originId: validOrigin.id,
        amount: "2500.00",
        transactionDate: "2026-04-01",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.type).toBe("income");
    expect(json.data.amountMinor).toBe(250000);
    expect(json.data.createdByUserId).toBe(MOCK_USER_ID);
    expect(json.data.origin.name).toBe(validOrigin.name);
  });

  test("returns 201 using categoryName and originName", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryName: "Salary",
        originName: "New Corp",
        amount: "3000.00",
        transactionDate: "2026-04-01",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.category.name).toBe("Salary");
    expect(json.data.origin.name).toBe("New Corp");
  });

  test("returns 400 when both originId and originName provided", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        originId: validOrigin.id,
        originName: "Duplicate",
        amount: "100.00",
        transactionDate: "2026-04-01",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 400 when neither originId nor originName provided", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: validAccount.id,
        personId: validPersonId,
        categoryId: validCategory.id,
        amount: "100.00",
        transactionDate: "2026-04-01",
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
      body: JSON.stringify({ amount: "100.00" }),
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
        originId: validOrigin.id,
        amount: "100.00",
        transactionDate: "2026-04-01",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
