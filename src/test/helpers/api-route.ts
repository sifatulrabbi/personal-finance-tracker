import { expect, mock } from "bun:test";
import { NextRequest } from "next/server";

import type { SessionUser } from "@/libs/server/auth";

// ── Constants ───────────────────────────────────────────────────────────────

export const MOCK_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000101";
export const MOCK_USER_ID = "00000000-0000-4000-8000-000000000102";
export const WRONG_HOUSEHOLD_ID = "00000000-0000-4000-8000-999999999999";
export const INVALID_ID = "not-a-uuid";

export const MOCK_SESSION_USER: SessionUser = {
  id: MOCK_USER_ID,
  householdId: MOCK_HOUSEHOLD_ID,
  email: "test@example.com",
  name: "Test User",
  workosUserId: "workos_user_123",
};

// ── Auth mock ───────────────────────────────────────────────────────────────

export const requireSessionUserMock = mock(async () => MOCK_SESSION_USER);

mock.module("@/libs/server/auth", () => ({
  requireSessionUser: requireSessionUserMock,
}));

// ── Request factory ─────────────────────────────────────────────────────────

export function createTestRequest(
  url: string,
  init?: RequestInit,
): NextRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standard RequestInit vs Next.js RequestInit mismatch
  return new NextRequest(new URL(url, "http://localhost"), init as any);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export async function expectErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
) {
  expect(response.status).toBe(expectedStatus);
  const body = await response.json();
  expect(body.error.code).toBe(expectedCode);
  return body;
}
