import { beforeEach, describe, expect, test } from "bun:test";

import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { GET, POST } from "./route";

describe("accounts routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("GET returns 200 with array of accounts", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toBeArray();
    expect(json.data.length).toBeGreaterThan(0);
  });

  test("GET returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  test("POST returns 201 with created account", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        name: "New Account",
        description: "Testing",
        initialBalance: "250.00",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.name).toBe("New Account");
    expect(json.data.initialBalanceMinor).toBe(25000);
    expect(json.data.currentBalanceMinor).toBe(25000);
  });

  test("POST returns 400 for missing name", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ initialBalance: "50.00" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("POST returns 400 for invalid balance", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ name: "Test", initialBalance: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });
});
