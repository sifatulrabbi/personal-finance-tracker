import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { mockTransactions } from "@/libs/server/api/mock-data";
import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { DELETE, GET, PATCH } from "./route";

// Save original state for test isolation
const originalTransactions = mockTransactions.map((t) => ({ ...t }));

const expenseTransaction = mockTransactions.find(
  (t) => t.type === "expense" && t.transferGroupId === null,
)!;
const transferTransaction = mockTransactions.find(
  (t) => t.transferGroupId !== null,
)!;

describe("transactions/[transactionId] routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  afterEach(() => {
    mockTransactions.length = 0;
    mockTransactions.push(...originalTransactions.map((t) => ({ ...t })));
  });

  // ── GET ────────────────────────────────────────────────────────────────────

  test("GET returns 200 with transaction", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(expenseTransaction.id);
    expect(json.data.type).toBe("expense");
  });

  test("GET returns 404 for unknown transaction", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("GET returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  // ── PATCH ──────────────────────────────────────────────────────────────────

  test("PATCH updates description", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ description: "Updated description" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.description).toBe("Updated description");
    // Money fields should be unchanged
    expect(json.data.amountMinor).toBe(expenseTransaction.amountMinor);
    // Verify mock data was mutated
    const mutated = mockTransactions.find(
      (t) => t.id === expenseTransaction.id,
    );
    expect(mutated?.description).toBe("Updated description");
  });

  test("PATCH updates amount and recalculates BDT", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ amount: "50.00" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.originalAmountMinor).toBe(5000);
    expect(json.data.amountMinor).toBe(5000); // BDT, rate=100
  });

  test("PATCH updates category via categoryName (inline creation)", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ categoryName: "New Category" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.category.name).toBe("New Category");
  });

  test("PATCH rejects edit on transfer transaction", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ description: "Nope" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: transferTransaction.id,
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("PATCH rejects originId on expense", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({
        originId: "00000000-0000-4000-8000-000000000999",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("PATCH returns 404 for unknown transaction", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ description: "Nothing" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  test("DELETE returns 204 and removes transaction", async () => {
    const countBefore = mockTransactions.length;
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: expenseTransaction.id,
    });

    const response = await DELETE(request, { params });

    expect(response.status).toBe(204);
    expect(mockTransactions.length).toBe(countBefore - 1);
    expect(
      mockTransactions.find((t) => t.id === expenseTransaction.id),
    ).toBeUndefined();
  });

  test("DELETE removes both sides of a transfer", async () => {
    const groupId = transferTransaction.transferGroupId!;
    const pairCount = mockTransactions.filter(
      (t) => t.transferGroupId === groupId,
    ).length;
    expect(pairCount).toBe(2);

    const countBefore = mockTransactions.length;
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: transferTransaction.id,
    });

    const response = await DELETE(request, { params });

    expect(response.status).toBe(204);
    expect(mockTransactions.length).toBe(countBefore - 2);
    expect(
      mockTransactions.filter((t) => t.transferGroupId === groupId).length,
    ).toBe(0);
  });

  test("DELETE returns 404 for unknown transaction", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      transactionId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });
});
