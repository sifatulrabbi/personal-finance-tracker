import { beforeEach, describe, expect, test } from "bun:test";

import {
  INVALID_ID,
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { GET, POST } from "./route";

describe("people routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  // ── GET ─────────────────────────────────────────────────────────────────

  test("GET returns 200 with array of people", async () => {
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

  test("GET returns 400 for invalid householdId", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({ householdId: INVALID_ID });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  // ── POST ────────────────────────────────────────────────────────────────

  test("POST returns 201 with created person", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.name).toBe("Alice");
    expect(json.data.isDefault).toBe(false);
    expect(json.data.householdId).toBe(MOCK_HOUSEHOLD_ID);
    expect(json.data.id).toBeString();
    expect(json.data.createdAt).toBeString();
  });

  test("POST returns 400 for empty name", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("POST returns 400 for invalid JSON", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("POST returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: WRONG_HOUSEHOLD_ID });

    const response = await POST(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
