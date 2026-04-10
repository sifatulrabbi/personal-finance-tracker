import { beforeEach, describe, expect, test } from "bun:test";

import { mockPeople, mockTransactions } from "@/libs/server/api/mock-data";
import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { GET } from "./route";

describe("transactions GET", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 200 with all transactions and meta", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toBeArray();
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.meta).toBeDefined();
    expect(json.meta.total).toBeNumber();
    expect(json.meta.page).toBe(1);
    expect(json.meta.pageSize).toBe(20);
  });

  test("returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  test("filters by personId", async () => {
    const person = mockPeople.find((p) => !p.isDefault)!;
    const request = createTestRequest(
      `http://localhost/test?personId=${person.id}`,
    );
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    for (const txn of json.data) {
      expect(txn.personId).toBe(person.id);
    }
  });

  test("filters by categoryId", async () => {
    const txnWithCategory = mockTransactions.find((t) => t.categoryId)!;
    const request = createTestRequest(
      `http://localhost/test?categoryId=${txnWithCategory.categoryId}`,
    );
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    for (const txn of json.data) {
      expect(txn.categoryId).toBe(txnWithCategory.categoryId);
    }
  });

  test("filters by accountId", async () => {
    const account = mockTransactions[0]!;
    const request = createTestRequest(
      `http://localhost/test?accountId=${account.accountId}`,
    );
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    for (const txn of json.data) {
      expect(txn.accountId).toBe(account.accountId);
    }
  });

  test("filters by type=expense", async () => {
    const request = createTestRequest("http://localhost/test?type=expense");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.length).toBeGreaterThan(0);
    for (const txn of json.data) {
      expect(txn.type).toBe("expense");
    }
  });

  test("filters by type=income", async () => {
    const request = createTestRequest("http://localhost/test?type=income");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.length).toBeGreaterThan(0);
    for (const txn of json.data) {
      expect(txn.type).toBe("income");
    }
  });

  test("ignores invalid type filter", async () => {
    const request = createTestRequest("http://localhost/test?type=invalid");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.length).toBe(mockTransactions.length);
  });

  test("paginates with page and pageSize", async () => {
    const request = createTestRequest(
      "http://localhost/test?page=1&pageSize=2",
    );
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.length).toBeLessThanOrEqual(2);
    expect(json.meta.page).toBe(1);
    expect(json.meta.pageSize).toBe(2);
    expect(json.meta.total).toBe(mockTransactions.length);
  });

  test("clamps pageSize to max 100", async () => {
    const request = createTestRequest("http://localhost/test?pageSize=500");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(json.meta.pageSize).toBe(100);
  });

  test("clamps page to minimum 1", async () => {
    const request = createTestRequest("http://localhost/test?page=0");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(json.meta.page).toBe(1);
  });

  test("returns results in reverse chronological order", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    const dates = json.data.map(
      (t: { transactionDate: string }) => t.transactionDate,
    );
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });
});
