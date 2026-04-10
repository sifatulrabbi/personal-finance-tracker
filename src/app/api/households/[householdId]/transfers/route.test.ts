import { beforeEach, describe, expect, test } from "bun:test";

import { mockAccounts } from "@/libs/server/api/mock-data";
import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { POST } from "./route";

const sourceAccount = mockAccounts[0]!;
const destAccount = mockAccounts[1]!;
const validPersonId = "00000000-0000-4000-8000-000000000103";

describe("transfers POST", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 201 with transfer pair", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        personId: validPersonId,
        amount: "100.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.transferGroupId).toBeString();
    expect(json.data.expense).toBeDefined();
    expect(json.data.income).toBeDefined();
  });

  test("transfer pair shares the same transferGroupId", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        personId: validPersonId,
        amount: "50.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(json.data.expense.transferGroupId).toBe(json.data.transferGroupId);
    expect(json.data.income.transferGroupId).toBe(json.data.transferGroupId);
  });

  test("expense has type expense and income has type income", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        personId: validPersonId,
        amount: "75.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(json.data.expense.type).toBe("expense");
    expect(json.data.income.type).toBe("income");
    expect(json.data.expense.amountMinor).toBe(json.data.income.amountMinor);
  });

  test("returns 400 when source equals destination", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: sourceAccount.id,
        personId: validPersonId,
        amount: "50.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 400 for invalid body", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ amount: "50.00" }),
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
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        personId: validPersonId,
        amount: "50.00",
        transactionDate: "2026-04-10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
