import { beforeEach, describe, expect, test } from "bun:test";

import { mockPeople } from "@/libs/server/api/mock-data";
import {
  INVALID_ID,
  MOCK_HOUSEHOLD_ID,
  MOCK_SESSION_USER,
  WRONG_HOUSEHOLD_ID,
  createTestRequest,
  expectErrorResponse,
  requireSessionUserMock,
} from "@/test/helpers/api-route";

import { DELETE } from "./route";

const defaultPerson = mockPeople.find((p) => p.isDefault)!;
const nonDefaultPerson = mockPeople.find((p) => !p.isDefault)!;

describe("people/[personId] DELETE", () => {
  beforeEach(() => {
    requireSessionUserMock.mockReset();
    requireSessionUserMock.mockResolvedValue(MOCK_SESSION_USER);
  });

  test("returns 204 for non-default person", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      personId: nonDefaultPerson.id,
    });

    const response = await DELETE(request, { params });

    expect(response.status).toBe(204);
  });

  test("returns 409 for default person", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      personId: defaultPerson.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 409, "conflict");
  });

  test("returns 404 for non-existent person", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      personId: "00000000-0000-4000-8000-000000000999",
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 404, "not_found");
  });

  test("returns 400 for invalid personId", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: MOCK_HOUSEHOLD_ID,
      personId: INVALID_ID,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 400, "validation_failed");
  });

  test("returns 403 for wrong household", async () => {
    const request = createTestRequest("/test", { method: "DELETE" });
    const params = Promise.resolve({
      householdId: WRONG_HOUSEHOLD_ID,
      personId: nonDefaultPerson.id,
    });

    const response = await DELETE(request, { params });

    await expectErrorResponse(response, 403, "forbidden");
  });
});
