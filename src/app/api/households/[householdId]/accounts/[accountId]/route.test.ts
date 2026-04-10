import { beforeEach, describe, expect, test } from "bun:test";

import { mockAccounts } from "@/libs/server/api/mock-data";
import {
  INVALID_ID,
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { DELETE, GET, PATCH } from "./route";

const existingAccount = mockAccounts[0]!;

describe("accounts/[accountId] routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  // ── GET ─────────────────────────────────────────────────────────────────

  test("GET returns 200 with single account", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: existingAccount.id,
    });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(existingAccount.id);
    expect(json.data.name).toBe(existingAccount.name);
  });

  test("GET returns 404 for non-existent account", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("GET returns 400 for invalid accountId", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: INVALID_ID,
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("GET returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      accountId: existingAccount.id,
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  // ── PATCH ───────────────────────────────────────────────────────────────

  test("PATCH returns 200 with updated name", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed Account" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: existingAccount.id,
    });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.name).toBe("Renamed Account");
    expect(json.data.id).toBe(existingAccount.id);
  });

  test("PATCH returns 404 for non-existent account", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  // ── DELETE ──────────────────────────────────────────────────────────────

  test("DELETE returns 409 when account has transactions", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: existingAccount.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 409, "conflict");
  });

  test("DELETE returns 404 for non-existent account", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("DELETE returns 400 for invalid accountId", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      accountId: INVALID_ID,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("DELETE returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      accountId: existingAccount.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
