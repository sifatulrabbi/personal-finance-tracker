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

describe("origins routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("GET returns 200 with array of origins", async () => {
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

  test("POST returns 201 with created origin", async () => {
    const request = createTestRequest("/test", {
      method: "POST",
      body: JSON.stringify({ name: "New Employer", description: "Job" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({ householdId: MOCK_HOUSEHOLD_ID });

    const response = await POST(request, { params });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.name).toBe("New Employer");
    expect(json.data.description).toBe("Job");
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
});
