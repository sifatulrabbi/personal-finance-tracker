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

import { DELETE, GET, PATCH } from "./route";

const baseCurrency = mockCurrencies.find((c) => c.isBase)!;
const nonBaseCurrency = mockCurrencies.find((c) => !c.isBase)!;

describe("currencies/[currencyId] routes", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  // ── GET ────────────────────────────────────────────────────────────────────

  test("GET returns 200 with currency", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: nonBaseCurrency.id,
    });

    const response = await GET(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.code).toBe(nonBaseCurrency.code);
  });

  test("GET returns 404 for unknown currency", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("GET returns 403 for wrong household", async () => {
    const request = createTestRequest("/test");
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      currencyId: nonBaseCurrency.id,
    });

    const response = await GET(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });

  // ── PATCH ──────────────────────────────────────────────────────────────────

  test("PATCH returns 200 with updated currency", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Dollar", rateToBdt: "125.00" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: nonBaseCurrency.id,
    });

    const response = await PATCH(request, { params });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.name).toBe("Updated Dollar");
    expect(json.data.rateToBdtMinor).toBe(12500);
  });

  test("PATCH returns 400 when updating base currency rate", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ rateToBdt: "2.00" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: baseCurrency.id,
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("PATCH returns 404 for unknown currency", async () => {
    const request = createTestRequest("/test", {
      method: "PATCH",
      body: JSON.stringify({ name: "Nothing" }),
      headers: { "Content-Type": "application/json" },
    });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await PATCH(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  test("DELETE returns 204 for non-base currency", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: nonBaseCurrency.id,
    });

    const response = await DELETE(request, { params });

    expect(response.status).toBe(204);
  });

  test("DELETE returns 400 for base currency", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: baseCurrency.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 400, "bad_request");
  });

  test("DELETE returns 404 for unknown currency", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      currencyId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });
});
