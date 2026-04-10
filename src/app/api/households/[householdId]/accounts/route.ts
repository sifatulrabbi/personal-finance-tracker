import type { NextRequest } from "next/server";

import { requireHouseholdAccess } from "@/libs/server/api/access";
import { createApiErrorResponse } from "@/libs/server/api/errors";
import { mockAccounts } from "@/libs/server/api/mock-data";
import { createAccountSchema } from "@/libs/server/api/schemas";
import { parseJsonRequestBody } from "@/libs/server/api/validation";
import { requireSessionUser } from "@/libs/server/auth";
import { createId } from "@/libs/id";
import { logger } from "@/libs/server/logger";
import { getUtcTimestamp } from "@/libs/server/time";

type RouteParams = { params: Promise<{ householdId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const accounts = mockAccounts.filter((a) => a.householdId === householdId);

    return Response.json({ data: accounts });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const householdId = await requireHouseholdAccess(params, user);

    const body = await parseJsonRequestBody(request, createAccountSchema);

    const now = getUtcTimestamp();
    const account = {
      id: createId(),
      householdId,
      name: body.name,
      description: body.description ?? null,
      initialBalanceMinor: body.initialBalance,
      currentBalanceMinor: body.initialBalance,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("accounts.created", { accountId: account.id, householdId });

    return Response.json({ data: account }, { status: 201 });
  } catch (error) {
    return createApiErrorResponse(error, { logger });
  }
}
