import { beforeEach, describe, expect, test } from "bun:test";

import { mockCurrencies } from "@/libs/server/api/mock-data";
import {
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { GET, POST } from "./route";

describe("currencies routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("GET returns 200 with array of currencies", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toBeArray();
    expect(json.data.length).toBeGreaterThan(0);
  });

  test("GET returns BDT first (base currency)", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(json.data[0].code).toBe("BDT");
    expect(json.data[0].isBase).toBe(true);
  });

  test("GET returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  test("POST returns 201 with created currency", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        code: "GBP",
        symbol: "£",
        name: "British Pound",
        rateToBdt: "140.25",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.code).toBe("GBP");
    expect(json.data.symbol).toBe("£");
    expect(json.data.rateToBdtMinor).toBe(14025);
    expect(json.data.isBase).toBe(false);
  });

  test("POST returns 400 for duplicate currency code", async () => {
    const existingCode = mockCurrencies[0]!.code;
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        code: existingCode,
        symbol: "৳",
        name: "Duplicate",
        rateToBdt: "1.00",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("POST returns 400 for invalid currency code length", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        code: "AB",
        symbol: "x",
        name: "Bad",
        rateToBdt: "1.00",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("POST returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({
        code: "GBP",
        symbol: "£",
        name: "British Pound",
        rateToBdt: "140.25",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
